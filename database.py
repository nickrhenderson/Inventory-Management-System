import sqlite3
import os
import sys
from datetime import datetime
from barcode import BarcodeManager


def get_data_path():
	"""Get writable data directory for the database"""
	if getattr(sys, 'frozen', False):
		# Running as compiled executable
		# Use user's AppData directory for writable database
		import tempfile
		app_data = os.path.join(os.environ.get('APPDATA', tempfile.gettempdir()), 'InventorySystem')
		os.makedirs(app_data, exist_ok=True)
		return app_data
	else:
		# Running as Python script
		return os.path.join(os.path.dirname(__file__), "data")


class DatabaseManager:
	def __init__(self, app_version="0.2.0"):
		self.app_version = app_version
		self.db_path = os.path.join(get_data_path(), "inventory.db")
		self.barcode_manager = BarcodeManager()
		self.init_database()

	def _get_db_connection(self):
		"""Get database connection with row factory"""
		conn = sqlite3.connect(self.db_path)
		conn.row_factory = sqlite3.Row
		return conn

	def _parse_date(self, date_str, default=None):
		"""Parse date string or return default"""
		if not date_str:
			return default
		try:
			return datetime.strptime(date_str, "%Y-%m-%d").date()
		except (ValueError, TypeError):
			return default

	def _success_response(self, message="Success", **kwargs):
		"""Create standardized success response"""
		response = {"success": True, "message": message}
		response.update(kwargs)
		return response

	def _error_response(self, error):
		"""Create standardized error response"""
		return {"success": False, "error": str(error)}
	
	def generate_barcode_id(self, prefix="", length=12):
		"""Generate a barcode-compatible unique ID"""
		return self.barcode_manager.generate_barcode_id(prefix, length)
	
	def generate_ingredient_barcode(self):
		"""Generate a realistic 12-digit UPC-style barcode for ingredients"""
		return self.barcode_manager.generate_ingredient_barcode()
	
	def generate_product_barcode(self):
		"""Generate a simple unique barcode for products"""
		return self.barcode_manager.generate_product_barcode()
	
	def generate_batch_number(self):
		"""Generate a batch number using barcode manager"""
		import random
		return f"BATCH{random.randint(1000, 9999)}"
	
	def generate_barcode_pdf(self, barcode_id):
		"""Generate a PDF file with a printable barcode optimized for 1.5" x 1" labels (PLS198)"""
		# Look up the ingredient name from the database
		ingredient_name = "Unknown Ingredient"
		with self._get_db_connection() as conn:
			cursor = conn.execute('SELECT name FROM ingredients WHERE barcode_id = ?', (barcode_id,))
			result = cursor.fetchone()
			if result:
				ingredient_name = result['name']
		
		return self.barcode_manager.generate_barcode_pdf(barcode_id, ingredient_name)
	
	def init_database(self):
		# Create data folder if it doesn't exist
		data_dir = get_data_path()
		if not os.path.exists(data_dir):
			os.makedirs(data_dir)
		
		db_path = os.path.join(data_dir, "inventory.db")
		
		# Initialize database and create tables
		with sqlite3.connect(db_path) as conn:
			# Drop old inventory table if it exists
			conn.execute('DROP TABLE IF EXISTS inventory')
			
			# Check if we need to migrate the ingredients table
			cursor = conn.execute("PRAGMA table_info(ingredients)")
			columns = [column[1] for column in cursor.fetchall()]
			
			# If the table has unit or category columns, we need to migrate
			if 'unit' in columns or 'category' in columns:
				self._migrate_ingredients_table(conn)
			else:
				# Create new ingredients table without unit and category
				conn.execute('''
					CREATE TABLE IF NOT EXISTS ingredients (
						id INTEGER PRIMARY KEY AUTOINCREMENT,
						barcode_id TEXT UNIQUE NOT NULL,
						name TEXT NOT NULL,
						unit_cost REAL DEFAULT 0.0,
						purchase_date DATE,
						expiration_date DATE,
						supplier TEXT,
						is_flagged INTEGER DEFAULT 0,
						date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
						last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
					)
				''')
			
			# Add is_flagged column to existing ingredients table if it doesn't exist
			try:
				conn.execute('ALTER TABLE ingredients ADD COLUMN is_flagged INTEGER DEFAULT 0')
			except sqlite3.OperationalError:
				# Column already exists
				pass
			
			# Create products table
			conn.execute('''
				CREATE TABLE IF NOT EXISTS products (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					barcode_id TEXT UNIQUE NOT NULL,
					product_name TEXT NOT NULL,
					batch_number TEXT,
					date_mixed DATE NOT NULL,
					total_quantity REAL DEFAULT 0.0,
					total_cost REAL DEFAULT 0.0,
					amount INTEGER DEFAULT 0,
					notes TEXT,
					date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
					last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
				)
			''')
			
			# Add amount column to existing products table if it doesn't exist
			try:
				conn.execute('ALTER TABLE products ADD COLUMN amount INTEGER DEFAULT 0')
				print("Added 'amount' column to products table")
			except sqlite3.OperationalError:
				# Column already exists
				pass
			
			# Create product_ingredients junction table (many-to-many relationship)
			conn.execute('''
				CREATE TABLE IF NOT EXISTS product_ingredients (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					product_id INTEGER NOT NULL,
					ingredient_id INTEGER NOT NULL,
					quantity_used REAL NOT NULL,
					cost_per_unit REAL DEFAULT 0.0,
					FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
					FOREIGN KEY (ingredient_id) REFERENCES ingredients (id) ON DELETE CASCADE,
					UNIQUE(product_id, ingredient_id)
				)
			''')
			
			# Create indexes for better performance
			conn.execute('CREATE INDEX IF NOT EXISTS idx_ingredients_barcode ON ingredients(barcode_id)')
			conn.execute('CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode_id)')
			conn.execute('CREATE INDEX IF NOT EXISTS idx_products_date_mixed ON products(date_mixed)')
			conn.execute('CREATE INDEX IF NOT EXISTS idx_product_ingredients_product ON product_ingredients(product_id)')
			conn.execute('CREATE INDEX IF NOT EXISTS idx_product_ingredients_ingredient ON product_ingredients(ingredient_id)')
			
			conn.commit()
		
		return db_path
	
	def _migrate_ingredients_table(self, conn):
		"""Migrate ingredients table to remove unit and category columns"""
		print("Migrating ingredients table to remove unit and category columns...")
		
		# Create new table without unit and category columns
		conn.execute('''
			CREATE TABLE ingredients_new (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				barcode_id TEXT UNIQUE NOT NULL,
				name TEXT NOT NULL,
				unit_cost REAL DEFAULT 0.0,
				purchase_date DATE,
				expiration_date DATE,
				supplier TEXT,
				is_flagged INTEGER DEFAULT 0,
				date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
				last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		''')
		
		# Copy data from old table to new table (excluding unit and category)
		conn.execute('''
			INSERT INTO ingredients_new (id, barcode_id, name, unit_cost, purchase_date, expiration_date, supplier, is_flagged, date_added, last_updated)
			SELECT id, barcode_id, name, unit_cost, purchase_date, expiration_date, supplier, 
			       COALESCE(is_flagged, 0), date_added, last_updated
			FROM ingredients
		''')
		
		# Drop old table and rename new table
		conn.execute('DROP TABLE ingredients')
		conn.execute('ALTER TABLE ingredients_new RENAME TO ingredients')
		
		# Also update product_ingredients table to remove unit column if it exists
		cursor = conn.execute("PRAGMA table_info(product_ingredients)")
		pi_columns = [column[1] for column in cursor.fetchall()]
		
		if 'unit' in pi_columns:
			# Create new product_ingredients table without unit column
			conn.execute('''
				CREATE TABLE product_ingredients_new (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					product_id INTEGER NOT NULL,
					ingredient_id INTEGER NOT NULL,
					quantity_used REAL NOT NULL,
					cost_per_unit REAL DEFAULT 0.0,
					FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
					FOREIGN KEY (ingredient_id) REFERENCES ingredients (id) ON DELETE CASCADE,
					UNIQUE(product_id, ingredient_id)
				)
			''')
			
			# Copy data from old table to new table (excluding unit)
			conn.execute('''
				INSERT INTO product_ingredients_new (id, product_id, ingredient_id, quantity_used, cost_per_unit)
				SELECT id, product_id, ingredient_id, quantity_used, cost_per_unit
				FROM product_ingredients
			''')
			
			# Drop old table and rename new table
			conn.execute('DROP TABLE product_ingredients')
			conn.execute('ALTER TABLE product_ingredients_new RENAME TO product_ingredients')
		
		print("Migration completed successfully!")
	
	def get_products_data(self):
		"""Get all products ordered by date_mixed (newest first)"""
		with self._get_db_connection() as conn:
			cursor = conn.execute('''
				SELECT id, barcode_id, product_name, batch_number, date_mixed, 
				       total_quantity, total_cost, amount, notes, date_added
				FROM products 
				ORDER BY date_mixed DESC, date_added DESC
			''')
			return [dict(row) for row in cursor.fetchall()]
	
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

	def delete_product(self, product_id):
		"""Delete a product and its associated ingredient relationships"""
		try:
			with self._get_db_connection() as conn:
				# First check if product exists
				product = conn.execute('SELECT product_name FROM products WHERE id = ?', (product_id,)).fetchone()
				if not product:
					return self._error_response("Product not found")
				
				product_name = product['product_name']
				
				# Delete from product_ingredients table first (foreign key constraint)
				conn.execute('DELETE FROM product_ingredients WHERE product_id = ?', (product_id,))
				
				# Delete the product
				conn.execute('DELETE FROM products WHERE id = ?', (product_id,))
				conn.commit()
				
				return self._success_response(f"Product '{product_name}' deleted successfully")
		except Exception as e:
			return self._error_response(e)
	
	def get_flagged_ingredients(self):
		"""Get all flagged ingredients"""
		with self._get_db_connection() as conn:
			cursor = conn.execute('SELECT id, name FROM ingredients WHERE is_flagged = 1')
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
				       p.total_quantity, p.total_cost, p.amount, p.notes, p.date_added
				FROM products p
				JOIN product_ingredients pi ON p.id = pi.product_id
				JOIN ingredients i ON pi.ingredient_id = i.id
				WHERE LOWER(i.name) LIKE LOWER(?)
				ORDER BY p.date_mixed DESC, p.date_added DESC
			''', (f'%{ingredient_name}%',))
			rows = cursor.fetchall()
			return [dict(row) for row in rows]
	
	def search_products_by_ingredient_barcode(self, barcode_id):
		"""Search for products that contain ingredient with specific barcode ID (supports partial matching)"""
		with sqlite3.connect(self.db_path) as conn:
			conn.row_factory = sqlite3.Row
			cursor = conn.execute('''
				SELECT DISTINCT p.id, p.barcode_id, p.product_name, p.batch_number, p.date_mixed, 
				       p.total_quantity, p.total_cost, p.amount, p.notes, p.date_added
				FROM products p
				JOIN product_ingredients pi ON p.id = pi.product_id
				JOIN ingredients i ON pi.ingredient_id = i.id
				WHERE i.barcode_id LIKE ?
				ORDER BY p.date_mixed DESC, p.date_added DESC
			''', (f'{barcode_id}%',))
			rows = cursor.fetchall()
			return [dict(row) for row in rows]
	
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
	
	def get_product_by_id(self, product_id):
		"""Get a specific product by its ID"""
		with self._get_db_connection() as conn:
			cursor = conn.execute('''
				SELECT id, barcode_id, product_name, batch_number, date_mixed, 
				       total_quantity, total_cost, amount, notes, date_added
				FROM products 
				WHERE id = ?
			''', (product_id,))
			row = cursor.fetchone()
			return dict(row) if row else None
	
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
				existing_product = conn.execute('SELECT id FROM products WHERE id = ?', (product_id,)).fetchone()
				if not existing_product:
					return self._error_response("Product not found")
				
				# Update product basic info (allow name, mixed date, and amount changes)
				amount = int(product_data.get('amount', 0))
				conn.execute('''
					UPDATE products 
					SET product_name = ?, date_mixed = ?, amount = ?, notes = ?, last_updated = CURRENT_TIMESTAMP
					WHERE id = ?
				''', (product_data['product_name'], mixed_date, amount, "Updated via product edit modal", product_id))
				
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
				''', (total_quantity, total_cost, product_id))
				
				conn.commit()
				
				return self._success_response("Product updated successfully", product_id=product_id)
				
		except Exception as e:
			return self._error_response(e)
	
	def adjust_product_amount(self, product_id, delta):
		"""Adjust product amount by the specified delta"""
		try:
			with self._get_db_connection() as conn:
				# Get current amount
				current_product = conn.execute('SELECT amount FROM products WHERE id = ?', (product_id,)).fetchone()
				if not current_product:
					return self._error_response("Product not found")
				
				current_amount = current_product[0] or 0
				new_amount = max(0, current_amount + delta)  # Prevent negative amounts
				
				# Update the amount
				conn.execute('''
					UPDATE products 
					SET amount = ?, last_updated = CURRENT_TIMESTAMP 
					WHERE id = ?
				''', (new_amount, product_id))
				
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
				existing_product = conn.execute('SELECT id FROM products WHERE id = ?', (product_id,)).fetchone()
				if not existing_product:
					return self._error_response("Product not found")
				
				# Ensure amount is non-negative
				amount = max(0, int(new_amount))
				
				# Update the amount
				conn.execute('''
					UPDATE products 
					SET amount = ?, last_updated = CURRENT_TIMESTAMP 
					WHERE id = ?
				''', (amount, product_id))
				
				conn.commit()
				
				return self._success_response(
					"Product amount updated successfully",
					new_amount=amount
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
				
				# Insert product
				cursor = conn.execute('''
					INSERT INTO products (barcode_id, product_name, batch_number, date_mixed, amount, notes)
					VALUES (?, ?, ?, ?, ?, ?)
				''', (
					self.generate_product_barcode(),
					product_data['product_name'],
					self.generate_batch_number(),
					mixed_date,
					amount,
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
				''', (total_quantity, total_cost, product_id))
				
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
	
	def get_inventory_data(self):
		"""Legacy method - now returns products data for compatibility"""
		return self.get_products_data()