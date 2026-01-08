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
		
		# Define expected schema for all tables
		self.expected_schema = {
			'ingredients': [
				('id', 'INTEGER PRIMARY KEY AUTOINCREMENT'),
				('barcode_id', 'TEXT UNIQUE NOT NULL'),
				('name', 'TEXT NOT NULL'),
				('unit_cost', 'REAL DEFAULT 0.0'),
				('purchase_date', 'DATE'),
				('expiration_date', 'DATE'),
				('supplier', 'TEXT'),
				('is_flagged', 'INTEGER DEFAULT 0'),
				('last_updated', 'DATETIME DEFAULT CURRENT_TIMESTAMP')
			],
			'products': [
				('id', 'INTEGER PRIMARY KEY AUTOINCREMENT'),
				('barcode_id', 'TEXT UNIQUE NOT NULL'),
				('product_name', 'TEXT NOT NULL'),
				('batch_number', 'TEXT'),
				('date_mixed', 'DATE NOT NULL'),
				('total_quantity', 'REAL DEFAULT 0.0'),
				('total_cost', 'REAL DEFAULT 0.0'),
				('amount', 'INTEGER DEFAULT 0'),
				('notes', 'TEXT'),
				('last_updated', 'DATETIME DEFAULT CURRENT_TIMESTAMP')
			],
			'product_ingredients': [
				('id', 'INTEGER PRIMARY KEY AUTOINCREMENT'),
				('product_id', 'INTEGER NOT NULL'),
				('ingredient_id', 'INTEGER NOT NULL'),
				('quantity_used', 'REAL NOT NULL'),
				('cost_per_unit', 'REAL DEFAULT 0.0')
			],
			'groups': [
				('id', 'INTEGER PRIMARY KEY AUTOINCREMENT'),
				('name', 'TEXT NOT NULL'),
				('display_order', 'INTEGER DEFAULT 0'),
				('is_collapsed', 'INTEGER DEFAULT 0'),
				('created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP'),
				('last_updated', 'DATETIME DEFAULT CURRENT_TIMESTAMP')
			],
			'group_products': [
				('id', 'INTEGER PRIMARY KEY AUTOINCREMENT'),
				('group_id', 'INTEGER NOT NULL'),
				('product_id', 'INTEGER NOT NULL')
			]
			,
			'group_parameters': [
				('id', 'INTEGER PRIMARY KEY AUTOINCREMENT'),
				('group_id', 'INTEGER NOT NULL'),
				('name', 'TEXT NOT NULL'),
				('display_order', 'INTEGER DEFAULT 0'),
				('created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP')
			],
			'product_group_parameter_values': [
				('id', 'INTEGER PRIMARY KEY AUTOINCREMENT'),
				('product_id', 'INTEGER NOT NULL'),
				('group_parameter_id', 'INTEGER NOT NULL'),
				('value', 'TEXT'),
				('last_updated', 'DATETIME DEFAULT CURRENT_TIMESTAMP')
			],
			'inventory_events': [
				('id', 'INTEGER PRIMARY KEY AUTOINCREMENT'),
				('product_id', 'INTEGER NOT NULL'),
				('delta', 'INTEGER NOT NULL'),
				('event_title', 'TEXT'),
				('event_date', 'DATE DEFAULT CURRENT_DATE'),
				('created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP')
			]
		}
		
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

	def _log_inventory_event(self, conn, product_id, delta, title=None, event_date=None):
		"""Log a quantity delta for a product."""
		if delta == 0:
			return
		event_date_value = event_date or datetime.now().date()
		conn.execute(
			"""
			INSERT INTO inventory_events (product_id, delta, event_title, event_date)
			VALUES (?, ?, ?, ?)
			""",
			(product_id, delta, title or "Inventory change", event_date_value)
		)
	
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
		
		# Initialize database and create/migrate tables dynamically
		with sqlite3.connect(db_path) as conn:
			# Drop old inventory table if it exists (legacy)
			conn.execute('DROP TABLE IF EXISTS inventory')
			
			# Migrate all tables to match expected schema
			for table_name, expected_columns in self.expected_schema.items():
				self._migrate_table_schema(conn, table_name, expected_columns)
			
			# Create indexes for better performance
			self._create_indexes(conn)
			
			conn.commit()
		
		return db_path
	
	def _migrate_table_schema(self, conn, table_name, expected_columns):
		"""
		Dynamically migrate a table to match the expected schema.
		Adds missing columns and removes columns not in the schema.
		"""
		# Check if table exists
		cursor = conn.execute(
			"SELECT name FROM sqlite_master WHERE type='table' AND name=?",
			(table_name,)
		)
		table_exists = cursor.fetchone() is not None
		
		if not table_exists:
			# Create table from scratch
			print(f"Creating new table: {table_name}")
			self._create_table(conn, table_name, expected_columns)
			return
		
		# Get current columns
		cursor = conn.execute(f"PRAGMA table_info({table_name})")
		current_columns = {row[1]: row[2] for row in cursor.fetchall()}  # {name: type}
		
		expected_column_names = {col[0] for col in expected_columns}
		current_column_names = set(current_columns.keys())
		
		# Find columns to add and remove
		columns_to_add = expected_column_names - current_column_names
		columns_to_remove = current_column_names - expected_column_names
		
		if not columns_to_add and not columns_to_remove:
			# Schema matches, no migration needed
			return
		
		print(f"Migrating table: {table_name}")
		if columns_to_add:
			print(f"  Adding columns: {', '.join(columns_to_add)}")
		if columns_to_remove:
			print(f"  Removing columns: {', '.join(columns_to_remove)}")
		
		# SQLite doesn't support DROP COLUMN directly until 3.35.0
		# We need to recreate the table
		self._recreate_table(conn, table_name, expected_columns, current_columns)
	
	def _create_table(self, conn, table_name, columns):
		"""Create a new table with the specified columns"""
		column_defs = [f"{col[0]} {col[1]}" for col in columns]
		
		# Add foreign key constraints for specific tables
		constraints = []
		if table_name == 'product_ingredients':
			constraints.append('FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE')
			constraints.append('FOREIGN KEY (ingredient_id) REFERENCES ingredients (id) ON DELETE CASCADE')
			constraints.append('UNIQUE(product_id, ingredient_id)')
		elif table_name == 'group_products':
			constraints.append('FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE')
			constraints.append('FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE')
			constraints.append('UNIQUE(product_id)')
		elif table_name == 'group_parameters':
			constraints.append('FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE')
			constraints.append('UNIQUE(group_id, name)')
		elif table_name == 'product_group_parameter_values':
			constraints.append('FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE')
			constraints.append('FOREIGN KEY (group_parameter_id) REFERENCES group_parameters (id) ON DELETE CASCADE')
			constraints.append('UNIQUE(product_id, group_parameter_id)')
		
		all_defs = column_defs + constraints
		create_sql = f"CREATE TABLE {table_name} ({', '.join(all_defs)})"
		conn.execute(create_sql)
	
	def _recreate_table(self, conn, table_name, expected_columns, current_columns):
		"""
		Recreate a table with the expected schema.
		Preserves data for columns that exist in both old and new schema.
		"""
		# Create temporary table with new schema
		temp_table_name = f"{table_name}_new"
		self._create_table(conn, temp_table_name, expected_columns)
		
		# Find columns that exist in both schemas
		expected_column_names = {col[0] for col in expected_columns}
		current_column_names = set(current_columns.keys())
		common_columns = expected_column_names & current_column_names
		
		if common_columns:
			# Copy data from old table to new table (only common columns)
			common_cols_str = ', '.join(common_columns)
			copy_sql = f"""
				INSERT INTO {temp_table_name} ({common_cols_str})
				SELECT {common_cols_str}
				FROM {table_name}
			"""
			try:
				conn.execute(copy_sql)
			except sqlite3.Error as e:
				print(f"  Warning: Could not copy all data from {table_name}: {e}")
				print(f"  Attempting to copy row by row...")
				# Try copying row by row to handle type mismatches
				self._copy_data_safe(conn, table_name, temp_table_name, common_columns)
		
		# Drop old table and rename new table
		conn.execute(f"DROP TABLE {table_name}")
		conn.execute(f"ALTER TABLE {temp_table_name} RENAME TO {table_name}")
	
	def _copy_data_safe(self, conn, old_table, new_table, common_columns):
		"""Safely copy data row by row, handling type conversions"""
		common_cols_str = ', '.join(common_columns)
		placeholders = ', '.join(['?' for _ in common_columns])
		
		cursor = conn.execute(f"SELECT {common_cols_str} FROM {old_table}")
		insert_sql = f"INSERT INTO {new_table} ({common_cols_str}) VALUES ({placeholders})"
		
		for row in cursor:
			try:
				conn.execute(insert_sql, row)
			except sqlite3.Error as e:
				print(f"    Skipping row due to error: {e}")
				continue
	
	def _create_indexes(self, conn):
		"""Create indexes for better performance"""
		indexes = [
			'CREATE INDEX IF NOT EXISTS idx_ingredients_barcode ON ingredients(barcode_id)',
			'CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode_id)',
			'CREATE INDEX IF NOT EXISTS idx_products_date_mixed ON products(date_mixed)',
			'CREATE INDEX IF NOT EXISTS idx_product_ingredients_product ON product_ingredients(product_id)',
			'CREATE INDEX IF NOT EXISTS idx_product_ingredients_ingredient ON product_ingredients(ingredient_id)',
			'CREATE INDEX IF NOT EXISTS idx_groups_order ON groups(display_order)',
			'CREATE INDEX IF NOT EXISTS idx_group_products_group ON group_products(group_id)',
			'CREATE INDEX IF NOT EXISTS idx_group_products_product ON group_products(product_id)',
			'CREATE INDEX IF NOT EXISTS idx_group_parameters_group ON group_parameters(group_id)',
			'CREATE INDEX IF NOT EXISTS idx_product_param_values_product ON product_group_parameter_values(product_id)',
			'CREATE INDEX IF NOT EXISTS idx_product_param_values_parameter ON product_group_parameter_values(group_parameter_id)'
		]
		
		for index_sql in indexes:
			try:
				conn.execute(index_sql)
			except sqlite3.OperationalError as e:
				print(f"Index creation failed for: {index_sql} -> {e}")
	
	def get_products_data(self):
		"""Get all products ordered by date_mixed (newest first)"""
		with self._get_db_connection() as conn:
			cursor = conn.execute('''
				SELECT id, barcode_id, product_name, batch_number, date_mixed, 
				       total_quantity, total_cost, amount, notes
				FROM products 
				ORDER BY date_mixed DESC
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
				       total_quantity, total_cost, amount, notes
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
				existing_product = conn.execute('SELECT id, amount FROM products WHERE id = ?', (product_id,)).fetchone()
				if not existing_product:
					return self._error_response("Product not found")
				
				# Ensure amount is non-negative
				amount = max(0, int(new_amount))
				current_amount = existing_product[1] or 0
				
				# Update the amount
				conn.execute('''
					UPDATE products 
					SET amount = ?, last_updated = CURRENT_TIMESTAMP 
					WHERE id = ?
				''', (amount, product_id))
				self._log_inventory_event(conn, product_id, amount - current_amount, "Manual Inventory Adjustment")
				
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

	def get_inventory_events(self, limit=200):
		"""Return inventory events ordered newest first."""
		with self._get_db_connection() as conn:
			cursor = conn.execute(
				"""
				SELECT e.id, e.product_id, p.product_name, p.batch_number, e.delta, e.event_title,
				       e.event_date, e.created_at
				FROM inventory_events e
				JOIN products p ON p.id = e.product_id
				ORDER BY e.created_at DESC
				LIMIT ?
				""",
				(limit,)
			)
			return [dict(row) for row in cursor.fetchall()]

	def add_inventory_events(self, events, title=None, event_date=None):
		"""Add one or more inventory events and update product amounts accordingly."""
		try:
			with self._get_db_connection() as conn:
				for entry in events:
					product_id = entry.get('product_id')
					delta = int(entry.get('delta', 0))
					if not product_id or delta == 0:
						continue
					current_row = conn.execute('SELECT amount FROM products WHERE id = ?', (product_id,)).fetchone()
					if not current_row:
						raise Exception(f"Product {product_id} not found")
					current_amount = current_row[0] or 0
					if delta < 0 and current_amount + delta < 0:
						raise Exception(f"Cannot remove more than in stock for product {product_id}")
					new_amount = current_amount + delta
					conn.execute(
						"UPDATE products SET amount = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?",
						(new_amount, product_id)
					)
					self._log_inventory_event(
						conn,
						product_id,
						delta,
						title or entry.get('event_title') or "Inventory event",
						event_date or entry.get('event_date')
					)
				conn.commit()
				return self._success_response("Events added")
		except Exception as e:
			return self._error_response(e)
	
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
	
	# Group Management Methods
	
	def get_all_groups(self):
		"""Get all groups ordered by display_order"""
		with self._get_db_connection() as conn:
			cursor = conn.execute('''
				SELECT id, name, display_order, is_collapsed
				FROM groups
				ORDER BY display_order
			''')
			groups = [dict(row) for row in cursor.fetchall()]
			
			# For each group, get the product IDs
			for group in groups:
				cursor = conn.execute('''
					SELECT product_id
					FROM group_products
					WHERE group_id = ?
				''', (group['id'],))
				group['product_ids'] = [row[0] for row in cursor.fetchall()]
			
			return groups
	
	def create_group(self, group_name):
		"""Create a new group"""
		try:
			with self._get_db_connection() as conn:
				# Get the max display_order
				cursor = conn.execute('SELECT MAX(display_order) as max_order FROM groups')
				result = cursor.fetchone()
				next_order = (result['max_order'] or -1) + 1
				
				# Insert the group
				cursor = conn.execute('''
					INSERT INTO groups (name, display_order, is_collapsed)
					VALUES (?, ?, 0)
				''', (group_name, next_order))
				
				group_id = cursor.lastrowid
				conn.commit()
				
				return self._success_response(
					"Group created successfully",
					group_id=group_id,
					display_order=next_order
				)
		except Exception as e:
			return self._error_response(e)
	
	def delete_group(self, group_id):
		"""Delete a group (products are not deleted, just removed from group)"""
		try:
			with self._get_db_connection() as conn:
				# Verify group exists
				group = conn.execute('SELECT name FROM groups WHERE id = ?', (group_id,)).fetchone()
				if not group:
					return self._error_response("Group not found")
				
				group_name = group['name']
				
				# Delete group-product relationships (CASCADE will handle this, but explicit is clear)
				conn.execute('DELETE FROM group_products WHERE group_id = ?', (group_id,))
				
				# Delete the group
				conn.execute('DELETE FROM groups WHERE id = ?', (group_id,))
				conn.commit()
				
				return self._success_response(f"Group '{group_name}' deleted successfully")
		except Exception as e:
			return self._error_response(e)
	
	def update_group_order(self, group_id, new_order):
		"""Update the display order of a group"""
		try:
			with self._get_db_connection() as conn:
				conn.execute('''
					UPDATE groups 
					SET display_order = ?, last_updated = CURRENT_TIMESTAMP 
					WHERE id = ?
				''', (new_order, group_id))
				conn.commit()
				
				return self._success_response("Group order updated successfully")
		except Exception as e:
			return self._error_response(e)
	
	def update_group_collapsed_state(self, group_id, is_collapsed):
		"""Update whether a group is collapsed"""
		try:
			with self._get_db_connection() as conn:
				conn.execute('''
					UPDATE groups 
					SET is_collapsed = ?, last_updated = CURRENT_TIMESTAMP 
					WHERE id = ?
				''', (1 if is_collapsed else 0, group_id))
				conn.commit()
				
				return self._success_response("Group collapsed state updated successfully")
		except Exception as e:
			return self._error_response(e)

	def update_group_name(self, group_id, new_name):
		"""Rename a group"""
		try:
			with self._get_db_connection() as conn:
				# Verify group exists
				existing = conn.execute('SELECT id FROM groups WHERE id = ?', (group_id,)).fetchone()
				if not existing:
					return self._error_response("Group not found")
				conn.execute('''
					UPDATE groups
					SET name = ?, last_updated = CURRENT_TIMESTAMP
					WHERE id = ?
				''', (new_name.strip(), group_id))
				conn.commit()
				return self._success_response("Group name updated")
		except Exception as e:
			return self._error_response(e)

	def update_group_parameter(self, parameter_id, new_name):
		"""Rename a group parameter"""
		try:
			with self._get_db_connection() as conn:
				# Verify parameter exists
				param = conn.execute('SELECT id, group_id FROM group_parameters WHERE id = ?', (parameter_id,)).fetchone()
				if not param:
					return self._error_response("Group parameter not found")
				# Attempt update (will raise constraint error if duplicate)
				conn.execute('''
					UPDATE group_parameters
					SET name = ?
					WHERE id = ?
				''', (new_name.strip(), parameter_id))
				conn.commit()
				return self._success_response("Group parameter updated")
		except sqlite3.IntegrityError:
			return self._error_response("A parameter with that name already exists in this group")
		except Exception as e:
			return self._error_response(e)
	
	def add_product_to_group(self, group_id, product_id):
		"""Add a product to a group"""
		try:
			with self._get_db_connection() as conn:
				# Remove product from any existing group first (UNIQUE constraint on product_id)
				# Also purge any existing custom parameter values tied to previous group's parameters
				conn.execute('DELETE FROM group_products WHERE product_id = ?', (product_id,))
				conn.execute('DELETE FROM product_group_parameter_values WHERE product_id = ?', (product_id,))
				
				# Add to new group
				conn.execute('''
					INSERT INTO group_products (group_id, product_id)
					VALUES (?, ?)
				''', (group_id, product_id))
				
				conn.commit()
				
				return self._success_response("Product added to group successfully")
		except Exception as e:
			return self._error_response(e)
	
	def remove_product_from_group(self, product_id):
		"""Remove a product from its group"""
		try:
			with self._get_db_connection() as conn:
				# Remove relationship
				conn.execute('DELETE FROM group_products WHERE product_id = ?', (product_id,))
				# Purge any custom parameter values now that product is ungrouped
				conn.execute('DELETE FROM product_group_parameter_values WHERE product_id = ?', (product_id,))
				conn.commit()
				
				return self._success_response("Product removed from group successfully")
		except Exception as e:
			return self._error_response(e)
	
	def get_product_group(self, product_id):
		"""Get the group that a product belongs to (if any)"""
		with self._get_db_connection() as conn:
			cursor = conn.execute('''
				SELECT g.id, g.name, g.display_order, g.is_collapsed
				FROM groups g
				JOIN group_products gp ON g.id = gp.group_id
				WHERE gp.product_id = ?
			''', (product_id,))
			row = cursor.fetchone()
			return dict(row) if row else None

	# === Group Parameter Methods ===

	def get_group_parameters(self, group_id):
		"""Return all parameters defined for a group"""
		with self._get_db_connection() as conn:
			cursor = conn.execute('''
				SELECT id, name, display_order
				FROM group_parameters
				WHERE group_id = ?
				ORDER BY display_order, name
			''', (group_id,))
			return [dict(row) for row in cursor.fetchall()]

	def create_group_parameter(self, group_id, name):
		"""Create a new parameter for a group"""
		try:
			with self._get_db_connection() as conn:
				# Determine next display_order
				order_row = conn.execute('SELECT MAX(display_order) as max_order FROM group_parameters WHERE group_id = ?', (group_id,)).fetchone()
				next_order = (order_row['max_order'] or -1) + 1
				cursor = conn.execute('''
					INSERT INTO group_parameters (group_id, name, display_order)
					VALUES (?, ?, ?)
				''', (group_id, name.strip(), next_order))
				param_id = cursor.lastrowid
				conn.commit()
				return self._success_response("Group parameter created", parameter_id=param_id, display_order=next_order)
		except Exception as e:
			return self._error_response(e)

	def delete_group_parameter(self, parameter_id):
		"""Delete a group parameter and any product values referencing it"""
		try:
			with self._get_db_connection() as conn:
				conn.execute('DELETE FROM product_group_parameter_values WHERE group_parameter_id = ?', (parameter_id,))
				conn.execute('DELETE FROM group_parameters WHERE id = ?', (parameter_id,))
				conn.commit()
				return self._success_response("Group parameter deleted")
		except Exception as e:
			return self._error_response(e)

	# === Product Parameter Value Methods ===

	def get_product_group_parameter_values(self, product_id):
		"""Get parameter values for a product (including parameter name & group_id)"""
		with self._get_db_connection() as conn:
			cursor = conn.execute('''
				SELECT pgpv.id, pgpv.product_id, pgpv.group_parameter_id, pgpv.value,
				       gp.name as parameter_name, gp.group_id
				FROM product_group_parameter_values pgpv
				JOIN group_parameters gp ON gp.id = pgpv.group_parameter_id
				WHERE pgpv.product_id = ?
			''', (product_id,))
			return [dict(row) for row in cursor.fetchall()]

	def set_product_group_parameter_values(self, product_id, values_list):
		"""Set (upsert) parameter values for a product. values_list: [{parameter_id, value}]"""
		try:
			with self._get_db_connection() as conn:
				for item in values_list or []:
					param_id = item.get('parameter_id')
					val = item.get('value', '')
					if not param_id:
						continue
					# Try update first
					updated = conn.execute('''
						UPDATE product_group_parameter_values
						SET value = ?, last_updated = CURRENT_TIMESTAMP
						WHERE product_id = ? AND group_parameter_id = ?
					''', (val, product_id, param_id))
					if updated.rowcount == 0:
						conn.execute('''
							INSERT INTO product_group_parameter_values (product_id, group_parameter_id, value)
							VALUES (?, ?, ?)
						''', (product_id, param_id, val))
				conn.commit()
				return self._success_response("Product parameter values saved")
		except Exception as e:
			return self._error_response(e)