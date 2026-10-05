"""Ingredient data-access methods.

Handles the ingredients table plus flagging, searching by barcode, and
relationships to products.
"""

import sqlite3
from datetime import datetime


class IngredientMixin:
	"""Ingredient CRUD, search and flagging operations."""

	def get_all_ingredients(self):
		"""Get all available ingredients for product creation"""
		with self._get_db_connection() as conn:
			cursor = conn.execute('''
				SELECT id, barcode_id, name, unit_cost, supplier,
				       purchase_date, expiration_date, is_flagged
				FROM ingredients
				ORDER BY name
			''')
			return [dict(row) for row in cursor.fetchall()]

	def get_ingredient_by_id(self, ingredient_id):
		"""Get a specific ingredient by its ID"""
		with self._get_db_connection() as conn:
			cursor = conn.execute('''
				SELECT id, barcode_id, name, unit_cost, supplier,
				       purchase_date, expiration_date, is_flagged
				FROM ingredients
				WHERE id = ?
			''', (ingredient_id,))
			row = cursor.fetchone()
			return dict(row) if row else None

	def create_ingredient(self, ingredient_data):
		"""Create a new ingredient with barcode generation"""
		try:
			with self._get_db_connection() as conn:
				barcode_id = self.generate_ingredient_barcode()
				expiry_date = self._parse_date(ingredient_data.get('expiry_date'))

				cursor = conn.execute('''
					INSERT INTO ingredients (
						barcode_id, name, supplier,
						expiration_date, unit_cost, purchase_date, is_flagged
					)
					VALUES (?, ?, ?, ?, ?, ?, ?)
				''', (
					barcode_id,
					ingredient_data['name'],
					ingredient_data.get('location', ''),  # location maps to supplier
					expiry_date,
					ingredient_data.get('cost', 0),
					datetime.now().date(),
					0  # not flagged by default
				))

				ingredient_id = cursor.lastrowid
				conn.commit()

				# Get the created ingredient data
				created_ingredient = conn.execute('''
					SELECT id, barcode_id, name, supplier,
					       expiration_date, unit_cost, purchase_date, is_flagged
					FROM ingredients WHERE id = ?
				''', (ingredient_id,)).fetchone()

				ingredient_dict = dict(created_ingredient) if created_ingredient else {}

				return self._success_response(
					"Ingredient created successfully",
					ingredient=ingredient_dict,
					barcode_id=barcode_id
				)

		except Exception as e:
			return self._error_response(e)

	def update_ingredient(self, ingredient_data):
		"""Update an existing ingredient (barcode cannot be changed)"""
		try:
			with self._get_db_connection() as conn:
				ingredient_id = ingredient_data['id']

				# Verify ingredient exists
				existing_ingredient = conn.execute('SELECT barcode_id, name FROM ingredients WHERE id = ?', (ingredient_id,)).fetchone()
				if not existing_ingredient:
					return self._error_response("Ingredient not found")

				# Parse expiry date
				expiry_date = self._parse_date(ingredient_data.get('expiry_date'))

				# Update ingredient (barcode_id remains unchanged)
				conn.execute('''
					UPDATE ingredients
					SET name = ?, supplier = ?, expiration_date = ?, unit_cost = ?,
					    purchase_date = ?, last_updated = CURRENT_TIMESTAMP
					WHERE id = ?
				''', (
					ingredient_data['name'],
					ingredient_data.get('location', ''),  # location maps to supplier
					expiry_date,
					ingredient_data.get('cost', 0),
					self._parse_date(ingredient_data.get('purchase_date'), datetime.now().date()),
					ingredient_id
				))

				conn.commit()

				# Get the updated ingredient data
				updated_ingredient = conn.execute('''
					SELECT id, barcode_id, name, supplier,
					       expiration_date, unit_cost, purchase_date, is_flagged
					FROM ingredients WHERE id = ?
				''', (ingredient_id,)).fetchone()

				ingredient_dict = dict(updated_ingredient) if updated_ingredient else {}

				return self._success_response(
					"Ingredient updated successfully",
					ingredient=ingredient_dict
				)

		except Exception as e:
			return self._error_response(e)

	def delete_ingredient(self, ingredient_id):
		"""Delete an ingredient and its associated product relationships"""
		try:
			with self._get_db_connection() as conn:
				# First check if ingredient exists
				ingredient = conn.execute('SELECT name FROM ingredients WHERE id = ?', (ingredient_id,)).fetchone()
				if not ingredient:
					return self._error_response("Ingredient not found")

				ingredient_name = ingredient['name']

				# Delete from product_ingredients table first (foreign key constraint)
				conn.execute('DELETE FROM product_ingredients WHERE ingredient_id = ?', (ingredient_id,))

				# Delete the ingredient
				conn.execute('DELETE FROM ingredients WHERE id = ?', (ingredient_id,))
				conn.commit()

				return self._success_response(f"Ingredient '{ingredient_name}' deleted successfully")
		except Exception as e:
			return self._error_response(e)

	def flag_ingredient(self, ingredient_id):
		"""Flag an ingredient as problematic"""
		try:
			with self._get_db_connection() as conn:
				conn.execute('''
					UPDATE ingredients
					SET is_flagged = 1, last_updated = CURRENT_TIMESTAMP
					WHERE id = ?
				''', (ingredient_id,))
				conn.commit()
				return self._success_response("Ingredient flagged successfully")
		except Exception as e:
			return self._error_response(e)

	def unflag_ingredient(self, ingredient_id):
		"""Remove flag from an ingredient"""
		try:
			with self._get_db_connection() as conn:
				conn.execute('''
					UPDATE ingredients
					SET is_flagged = 0, last_updated = CURRENT_TIMESTAMP
					WHERE id = ?
				''', (ingredient_id,))
				conn.commit()
				return self._success_response("Ingredient unflagged successfully")
		except Exception as e:
			return self._error_response(e)

	def get_flagged_ingredients(self):
		"""Get all flagged ingredients"""
		with self._get_db_connection() as conn:
			cursor = conn.execute('SELECT id, name FROM ingredients WHERE is_flagged = 1')
			return [dict(row) for row in cursor.fetchall()]

	def search_ingredient_by_barcode(self, barcode_id):
		"""Search for a specific ingredient by its barcode ID"""
		with sqlite3.connect(self.db_path) as conn:
			conn.row_factory = sqlite3.Row
			cursor = conn.execute('''
				SELECT id, barcode_id, name, unit_cost,
				       purchase_date, expiration_date, supplier, is_flagged
				FROM ingredients
				WHERE barcode_id = ?
			''', (barcode_id,))
			row = cursor.fetchone()
			return dict(row) if row else None
