"""Product data-access methods.

Handles products and product_totals (the combined on-hand number per product
name), including searching products by their ingredients.
"""

import sqlite3
from datetime import datetime


class ProductMixin:
	"""Product CRUD, totals and search operations."""

	def get_products_data(self):
		"""Get all products ordered by date_mixed (newest first)"""
		with self._get_db_connection() as conn:
			cursor = conn.execute('''
				SELECT id, barcode_id, product_name, batch_number, date_mixed,
				       total_quantity, total_cost, amount, original_amount, notes
				FROM products
				ORDER BY date_mixed DESC
			''')
			return [dict(row) for row in cursor.fetchall()]

	def get_product_totals(self):
		"""Get one inventory total for every exact product name."""
		with self._get_db_connection() as conn:
			cursor = conn.execute('''
				SELECT totals.product_name, totals.amount_on_hand,
				       totals.image_path,
				       COALESCE(SUM(batches.original_amount), 0) AS units_created
				FROM product_totals AS totals
				LEFT JOIN products AS batches ON batches.product_name = totals.product_name
				GROUP BY totals.product_name, totals.amount_on_hand, totals.image_path
				ORDER BY totals.product_name COLLATE NOCASE
			''')
			return [dict(row) for row in cursor.fetchall()]

	def update_product_total(self, product_name, amount_on_hand, memo=None):
		"""Set the combined stock for a product and preserve batch-level event compatibility.

		Each batch's delta is logged as its own discrete inventory event so edits
		are coded as separate events (rather than being lumped into one shared
		"Manual product adjustment"). The caller-supplied memo is attached to every
		event created by this change.
		"""
		try:
			amount = max(0, int(amount_on_hand))
			with self._get_db_connection() as conn:
				batches = conn.execute('''
					SELECT id, amount, original_amount FROM products
					WHERE product_name = ?
					ORDER BY date_mixed DESC, id DESC
				''', (product_name,)).fetchall()
				if not batches:
					return self._error_response("Product not found")

				capacity = sum(batch['original_amount'] or 0 for batch in batches)
				if amount > capacity:
					return self._error_response("Amount on hand cannot exceed the total units produced")

				remaining = amount
				for batch in batches:
					new_amount = min(batch['original_amount'] or 0, remaining)
					remaining -= new_amount
					delta = new_amount - (batch['amount'] or 0)
					conn.execute(
						"UPDATE products SET amount = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?",
						(new_amount, batch['id'])
					)
					self._log_inventory_event(
						conn, batch['id'], delta, "Manual product adjustment", memo=memo
					)

				conn.execute(
					"UPDATE product_totals SET amount_on_hand = ?, last_updated = CURRENT_TIMESTAMP WHERE product_name = ?",
					(amount, product_name)
				)
				conn.commit()
				return self._success_response("Product amount updated successfully", amount_on_hand=amount)
		except Exception as e:
			return self._error_response(e)

	def get_product_by_id(self, product_id):
		"""Get a specific product by its ID"""
		with self._get_db_connection() as conn:
			cursor = conn.execute('''
				SELECT id, barcode_id, product_name, batch_number, date_mixed,
				       total_quantity, total_cost, amount, original_amount, notes
				FROM products
				WHERE id = ?
			''', (product_id,))
			row = cursor.fetchone()
			return dict(row) if row else None

	def create_product(self, product_data):
		"""Create a new product with ingredients"""
		try:
			# Validate that at least one ingredient is provided
			if not product_data.get('ingredients') or len(product_data['ingredients']) == 0:
				return {
					"success": False,
					"message": "Please select at least one ingredient for the product"
				}

			with self._get_db_connection() as conn:
				mixed_date = self._parse_date(product_data['mixed_date'], datetime.now().date())
				amount = int(product_data.get('amount', 0))
				original_amount = int(product_data.get('original_amount', 0))
				if amount < 0:
					return self._error_response("Current number of products cannot be negative")
				if original_amount < 1:
					return self._error_response("Original number of products produced must be at least 1")
				if amount > original_amount:
					return self._error_response("Current number of products cannot exceed the original number of products produced")

				# Insert product
				cursor = conn.execute('''
					INSERT INTO products (barcode_id, product_name, batch_number, date_mixed, amount, original_amount, notes)
					VALUES (?, ?, ?, ?, ?, ?, ?)
				''', (
					self.generate_product_barcode(),
					product_data['product_name'],
					self.generate_batch_number(),
					mixed_date,
					amount,
					original_amount,
					"Created via product creation modal"
				))

				product_id = cursor.lastrowid
				total_cost = 0
				total_quantity = 0

				# Add ingredients
				for ingredient_data in product_data['ingredients']:
					ingredient_id = ingredient_data['ingredient_id']
					quantity = ingredient_data['quantity']

					# Get ingredient unit cost (unit is now always grams)
					ingredient_info = conn.execute(
						"SELECT unit_cost FROM ingredients WHERE id = ?",
						(ingredient_id,)
					).fetchone()

					if not ingredient_info:
						raise Exception(f"Ingredient with ID {ingredient_id} not found")

					unit_cost = ingredient_info[0]
					cost = quantity * unit_cost
					total_cost += cost
					total_quantity += quantity

					# Insert product-ingredient relationship
					conn.execute('''
						INSERT INTO product_ingredients (product_id, ingredient_id, quantity_used, cost_per_unit)
						VALUES (?, ?, ?, ?)
					''', (product_id, ingredient_id, quantity, unit_cost))

				# Update product totals
				conn.execute('''
					UPDATE products SET total_quantity = ?, total_cost = ? WHERE id = ?
				''', (total_quantity, total_cost / original_amount, product_id))
				self._change_product_total(conn, product_data['product_name'], amount)
				self._log_inventory_event(conn, product_id, amount, "Product created", mixed_date)

				conn.commit()

				return {
					"success": True,
					"message": "Product created successfully",
					"product_id": product_id
				}

		except Exception as e:
			return {
				"success": False,
				"message": str(e)
			}

	def update_product(self, product_data):
		"""Update an existing product with new ingredient data"""
		try:
			# Validate that at least one ingredient is provided
			if not product_data.get('ingredients') or len(product_data['ingredients']) == 0:
				return {
					"success": False,
					"message": "Please select at least one ingredient for the product"
				}

			with self._get_db_connection() as conn:
				product_id = product_data['id']
				mixed_date = self._parse_date(product_data['mixed_date'], datetime.now().date())

				# Verify product exists
				existing_product = conn.execute('SELECT product_name, amount FROM products WHERE id = ?', (product_id,)).fetchone()
				if not existing_product:
					return self._error_response("Product not found")
				previous_name = existing_product['product_name']
				previous_amount = existing_product['amount'] or 0

				# Update product basic info (allow name, mixed date, and counts to change)
				amount = int(product_data.get('amount', 0))
				original_amount = int(product_data.get('original_amount', 0))
				if amount < 0:
					return self._error_response("Current number of products cannot be negative")
				if original_amount < 1:
					return self._error_response("Original number of products produced must be at least 1")
				if amount > original_amount:
					return self._error_response("Current number of products cannot exceed the original number of products produced")
				conn.execute('''
					UPDATE products
					SET product_name = ?, date_mixed = ?, amount = ?, original_amount = ?, notes = ?, last_updated = CURRENT_TIMESTAMP
					WHERE id = ?
				''', (product_data['product_name'], mixed_date, amount, original_amount, "Updated via product edit modal", product_id))
				if previous_name != product_data['product_name'] or previous_amount != amount:
					self._change_product_total(conn, previous_name, -previous_amount)
					self._change_product_total(conn, product_data['product_name'], amount)

				# Delete existing product-ingredient relationships
				conn.execute('DELETE FROM product_ingredients WHERE product_id = ?', (product_id,))

				# Add updated ingredients
				total_cost = 0
				total_quantity = 0

				for ingredient_data in product_data['ingredients']:
					ingredient_id = ingredient_data['ingredient_id']
					quantity = ingredient_data['quantity']

					# Get ingredient unit cost
					ingredient_info = conn.execute(
						"SELECT unit_cost FROM ingredients WHERE id = ?",
						(ingredient_id,)
					).fetchone()

					if not ingredient_info:
						raise Exception(f"Ingredient with ID {ingredient_id} not found")

					unit_cost = ingredient_info[0]
					cost = quantity * unit_cost
					total_cost += cost
					total_quantity += quantity

					# Insert updated product-ingredient relationship
					conn.execute('''
						INSERT INTO product_ingredients (product_id, ingredient_id, quantity_used, cost_per_unit)
						VALUES (?, ?, ?, ?)
					''', (product_id, ingredient_id, quantity, unit_cost))

				# Update product totals
				conn.execute('''
					UPDATE products SET total_quantity = ?, total_cost = ? WHERE id = ?
				''', (total_quantity, total_cost / original_amount, product_id))

				conn.commit()

				return self._success_response("Product updated successfully", product_id=product_id)

		except Exception as e:
			return self._error_response(e)

	def delete_product(self, product_id):
		"""Delete a product and its associated ingredient relationships"""
		try:
			with self._get_db_connection() as conn:
				# First check if product exists
				product = conn.execute('SELECT product_name, amount FROM products WHERE id = ?', (product_id,)).fetchone()
				if not product:
					return self._error_response("Product not found")

				product_name = product['product_name']

				# Delete from product_ingredients table first (foreign key constraint)
				conn.execute('DELETE FROM product_ingredients WHERE product_id = ?', (product_id,))

				# Delete the product
				conn.execute('DELETE FROM products WHERE id = ?', (product_id,))
				self._change_product_total(conn, product_name, -(product['amount'] or 0))

				# If this was the last batch with this product name, remove the
				# now-orphaned total row so it no longer shows on the product page.
				remaining = conn.execute(
					'SELECT 1 FROM products WHERE product_name = ? LIMIT 1',
					(product_name,)
				).fetchone()
				if not remaining:
					conn.execute('DELETE FROM product_totals WHERE product_name = ?', (product_name,))

				conn.commit()

				return self._success_response(f"Product '{product_name}' deleted successfully")
		except Exception as e:
			return self._error_response(e)

	def adjust_product_amount(self, product_id, delta):
		"""Adjust product amount by the specified delta"""
		try:
			with self._get_db_connection() as conn:
				# Get current amount
				current_product = conn.execute('SELECT product_name, amount, original_amount FROM products WHERE id = ?', (product_id,)).fetchone()
				if not current_product:
					return self._error_response("Product not found")

				current_amount = current_product[0] or 0
				original_amount = current_product[1] or 1
				new_amount = max(0, current_amount + delta)  # Prevent negative amounts
				if new_amount > original_amount:
					return self._error_response("Current number of products cannot exceed the original number of products produced")

				# Update the amount
				conn.execute('''
					UPDATE products
					SET amount = ?, last_updated = CURRENT_TIMESTAMP
					WHERE id = ?
				''', (new_amount, product_id))
				self._change_product_total(conn, current_product['product_name'], new_amount - current_amount)
				self._log_inventory_event(conn, product_id, new_amount - current_amount, "Manual adjustment")

				conn.commit()

				return self._success_response(
					"Product amount updated successfully",
					new_amount=new_amount
				)

		except Exception as e:
			return self._error_response(e)

	def update_product_amount(self, product_id, new_amount):
		"""Update product amount to a specific value"""
		try:
			with self._get_db_connection() as conn:
				# Verify product exists
				existing_product = conn.execute('SELECT product_name, amount, original_amount FROM products WHERE id = ?', (product_id,)).fetchone()
				if not existing_product:
					return self._error_response("Product not found")

				# Ensure amount is non-negative
				amount = max(0, int(new_amount))
				current_amount = existing_product[1] or 0
				original_amount = existing_product[2] or 1
				if amount > original_amount:
					return self._error_response("Current number of products cannot exceed the original number of products produced")

				# Update the amount
				conn.execute('''
					UPDATE products
					SET amount = ?, last_updated = CURRENT_TIMESTAMP
					WHERE id = ?
				''', (amount, product_id))
				self._change_product_total(conn, existing_product['product_name'], amount - current_amount)
				self._log_inventory_event(conn, product_id, amount - current_amount, "Manual Inventory Adjustment")

				conn.commit()

				return self._success_response(
					"Product amount updated successfully",
					new_amount=amount
				)

		except Exception as e:
			return self._error_response(e)

	def get_product_ingredients(self, product_id):
		"""Get all ingredients used in a specific product with their details"""
		with self._get_db_connection() as conn:
			cursor = conn.execute('''
				SELECT
					i.id, i.barcode_id, i.name, i.purchase_date, i.expiration_date, i.supplier, i.is_flagged,
					pi.quantity_used, pi.cost_per_unit,
					(pi.quantity_used * pi.cost_per_unit) as total_ingredient_cost
				FROM ingredients i
				JOIN product_ingredients pi ON i.id = pi.ingredient_id
				WHERE pi.product_id = ?
				ORDER BY i.name
			''', (product_id,))
			return [dict(row) for row in cursor.fetchall()]

	def check_product_has_flagged_ingredients(self, product_id):
		"""Check if a product contains any flagged ingredients"""
		with sqlite3.connect(self.db_path) as conn:
			cursor = conn.execute('''
				SELECT COUNT(*) as flagged_count
				FROM ingredients i
				JOIN product_ingredients pi ON i.id = pi.ingredient_id
				WHERE pi.product_id = ? AND i.is_flagged = 1
			''', (product_id,))
			result = cursor.fetchone()
			return result[0] > 0

	def search_products_by_ingredient_name(self, ingredient_name):
		"""Search for products that contain ingredients matching the given name"""
		with sqlite3.connect(self.db_path) as conn:
			conn.row_factory = sqlite3.Row
			cursor = conn.execute('''
				SELECT DISTINCT p.id, p.barcode_id, p.product_name, p.batch_number, p.date_mixed,
				       p.total_quantity, p.total_cost, p.amount, p.notes
				FROM products p
				JOIN product_ingredients pi ON p.id = pi.product_id
				JOIN ingredients i ON pi.ingredient_id = i.id
				WHERE LOWER(i.name) LIKE LOWER(?)
				ORDER BY p.date_mixed DESC
			''', (f'%{ingredient_name}%',))
			rows = cursor.fetchall()
			return [dict(row) for row in rows]

	def search_products_by_ingredient_barcode(self, barcode_id):
		"""Search for products that contain ingredient with specific barcode ID (supports partial matching)"""
		with sqlite3.connect(self.db_path) as conn:
			conn.row_factory = sqlite3.Row
			cursor = conn.execute('''
				SELECT DISTINCT p.id, p.barcode_id, p.product_name, p.batch_number, p.date_mixed,
				       p.total_quantity, p.total_cost, p.amount, p.notes
				FROM products p
				JOIN product_ingredients pi ON p.id = pi.product_id
				JOIN ingredients i ON pi.ingredient_id = i.id
				WHERE i.barcode_id LIKE ?
				ORDER BY p.date_mixed DESC
			''', (f'{barcode_id}%',))
			rows = cursor.fetchall()
			return [dict(row) for row in rows]

	def set_product_image(self, product_name, image_path):
		"""Assign (or clear) an image path for a product. If image_path is None,
		just clears any existing image. Returns the stored path on success."""
		try:
			with self._get_db_connection() as conn:
				# Ensure a product_totals row exists for this product name
				conn.execute('''
					INSERT OR IGNORE INTO product_totals (product_name, amount_on_hand)
					SELECT ?, 0 WHERE EXISTS (SELECT 1 FROM products WHERE product_name = ?)
				''', (product_name, product_name))
				conn.execute(
					"UPDATE product_totals SET image_path = ?, last_updated = CURRENT_TIMESTAMP WHERE product_name = ?",
					(image_path, product_name)
				)
				conn.commit()
				return self._success_response("Product image updated successfully", image_path=image_path)
		except Exception as e:
			return self._error_response(e)
