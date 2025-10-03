
import webview
import os
import sys
import sqlite3
import random
import string
import time
import tempfile
import webbrowser
import requests
import json
import shutil
import subprocess
from datetime import datetime, timedelta
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.graphics.barcode import code128

# Application version
APP_VERSION = "0.2.0"
GITHUB_REPO = "nickrhenderson/Inventory-Management-System"

# Windows-specific import for taskbar icon
try:
	import ctypes
	myappid = 'inventorysystem.app.1.0'  # arbitrary string
	ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except ImportError:
	pass  # Not on Windows or ctypes not available



class InventoryAPI:
	def __init__(self):
		self.db_path = os.path.join(get_data_path(), "inventory.db")
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
		chars = string.digits + string.ascii_uppercase
		random_part = ''.join(random.choice(chars) for _ in range(length - len(prefix)))
		return f"{prefix}{random_part}"
	
	def generate_ingredient_barcode(self):
		"""Generate a realistic 12-digit UPC-style barcode for ingredients"""
		manufacturer_code = "978"  # Standard book manufacturer code
		item_code = ''.join(random.choice(string.digits) for _ in range(8))
		
		# Calculate UPC check digit
		digits = manufacturer_code + item_code
		odd_sum = sum(int(digits[i]) for i in range(0, 11, 2))
		even_sum = sum(int(digits[i]) for i in range(1, 11, 2))
		check_digit = (10 - ((odd_sum + even_sum * 3) % 10)) % 10
		
		return digits + str(check_digit)
	
	def generate_product_barcode(self):
		"""Generate a simple unique barcode for products"""
		timestamp = str(int(time.time() * 1000))[-10:]
		random_suffix = ''.join(random.choice(string.digits) for _ in range(2))
		return f"PRD{timestamp}{random_suffix}"
	
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
					notes TEXT,
					date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
					last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
				)
			''')
			
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
				       total_quantity, total_cost, notes, date_added
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
				       p.total_quantity, p.total_cost, p.notes, p.date_added
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
				       p.total_quantity, p.total_cost, p.notes, p.date_added
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
				       total_quantity, total_cost, notes, date_added
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
			with self._get_db_connection() as conn:
				product_id = product_data['id']
				mixed_date = self._parse_date(product_data['mixed_date'], datetime.now().date())
				
				# Verify product exists
				existing_product = conn.execute('SELECT id FROM products WHERE id = ?', (product_id,)).fetchone()
				if not existing_product:
					return self._error_response("Product not found")
				
				# Update product basic info (allow name and mixed date changes)
				conn.execute('''
					UPDATE products 
					SET product_name = ?, date_mixed = ?, notes = ?, last_updated = CURRENT_TIMESTAMP
					WHERE id = ?
				''', (product_data['product_name'], mixed_date, "Updated via product edit modal", product_id))
				
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
			with self._get_db_connection() as conn:
				mixed_date = self._parse_date(product_data['mixed_date'], datetime.now().date())
				
				# Insert product
				cursor = conn.execute('''
					INSERT INTO products (barcode_id, product_name, batch_number, date_mixed, notes)
					VALUES (?, ?, ?, ?, ?)
				''', (
					self.generate_product_barcode(),
					product_data['product_name'],
					f"BATCH{random.randint(1000, 9999)}",
					mixed_date,
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
	
	def generate_barcode_pdf(self, barcode_id):
		"""Generate a PDF file with a printable barcode"""
		try:
			# Look up the ingredient name from the database
			ingredient_name = "Unknown Ingredient"
			with self._get_db_connection() as conn:
				cursor = conn.execute('SELECT name FROM ingredients WHERE barcode_id = ?', (barcode_id,))
				result = cursor.fetchone()
				if result:
					ingredient_name = result['name']
			
			# Create a temporary file for the PDF
			temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
			temp_filename = temp_file.name
			temp_file.close()
			
			# Create the PDF
			c = canvas.Canvas(temp_filename, pagesize=letter)
			width, height = letter
			
			# Set up the page
			c.setTitle(f"Barcode - {ingredient_name}")
			
			# Add header text with ingredient name
			c.setFont("Helvetica-Bold", 16)
			c.drawCentredString(width/2, height - 100, ingredient_name)
			
			# Add barcode ID text
			c.setFont("Helvetica", 12)
			c.drawCentredString(width/2, height - 130, f"Barcode ID: {barcode_id}")
			
			# Create barcode directly
			barcode = code128.Code128(barcode_id, barWidth=1.5, barHeight=60)
			
			# Position the barcode on the page (centered)
			x_position = (width - barcode.width) / 2
			y_position = height - 250
			
			# Draw the barcode directly on the canvas
			barcode.drawOn(c, x_position, y_position)
			
			# Add barcode text below
			c.setFont("Helvetica-Bold", 14)
			c.drawCentredString(width/2, y_position - 30, barcode_id)
			
			# Add timestamp
			c.setFont("Helvetica", 10)
			timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
			c.drawCentredString(width/2, 50, f"Generated: {timestamp}")
			
			# Save the PDF
			c.save()
			
			# Open the PDF in the default browser/application
			webbrowser.open(f'file:///{temp_filename.replace(os.sep, "/")}')
			
			return self._success_response(
				"Barcode PDF generated successfully",
				pdf_path=temp_filename
			)
			
		except Exception as e:
			return self._error_response(f"Failed to generate barcode PDF: {str(e)}")
	
	def get_app_version(self):
		"""Get the current application version"""
		return self._success_response("Version retrieved", version=APP_VERSION)
	
	def check_for_updates(self):
		"""Check for updates on GitHub releases"""
		try:
			# GitHub API endpoint for latest release (this excludes pre-releases)
			url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
			
			response = requests.get(url, timeout=10)
			
			# If no latest release found (404), try to get all releases and find the latest
			if response.status_code == 404:
				url = f"https://api.github.com/repos/{GITHUB_REPO}/releases"
				response = requests.get(url, timeout=10)
				response.raise_for_status()
				
				releases = response.json()
				if not releases:
					return self._error_response("No releases found in repository")
				
				# Get the most recent release (including pre-releases)
				release_data = releases[0]
			else:
				response.raise_for_status()
				release_data = response.json()
			
			latest_version = release_data.get('tag_name', '').lstrip('v')
			release_url = release_data.get('html_url', '')
			release_notes = release_data.get('body', '')
			published_at = release_data.get('published_at', '')
			is_prerelease = release_data.get('prerelease', False)
			
			# Find the .exe asset
			exe_asset = None
			for asset in release_data.get('assets', []):
				if asset.get('name', '').endswith('.exe'):
					exe_asset = {
						'name': asset.get('name'),
						'download_url': asset.get('browser_download_url'),
						'size': asset.get('size', 0)
					}
					break
			
			# Compare versions
			update_available = self._is_newer_version(latest_version, APP_VERSION)
			
			return self._success_response(
				"Update check completed",
				current_version=APP_VERSION,
				latest_version=latest_version,
				update_available=update_available,
				release_url=release_url,
				release_notes=release_notes,
				published_at=published_at,
				is_prerelease=is_prerelease,
				exe_asset=exe_asset
			)
			
		except requests.RequestException as e:
			return self._error_response(f"Failed to check for updates: Network error - {str(e)}")
		except json.JSONDecodeError as e:
			return self._error_response(f"Failed to parse update information: {str(e)}")
		except Exception as e:
			return self._error_response(f"Failed to check for updates: {str(e)}")
	
	def _is_newer_version(self, latest, current):
		"""Compare version strings to determine if latest is newer than current"""
		try:
			# Simple version comparison - assumes semantic versioning (x.y.z)
			latest_parts = [int(x) for x in latest.split('.')]
			current_parts = [int(x) for x in current.split('.')]
			
			# Pad shorter version with zeros
			max_len = max(len(latest_parts), len(current_parts))
			latest_parts.extend([0] * (max_len - len(latest_parts)))
			current_parts.extend([0] * (max_len - len(current_parts)))
			
			for latest_part, current_part in zip(latest_parts, current_parts):
				if latest_part > current_part:
					return True
				elif latest_part < current_part:
					return False
			
			return False  # Versions are equal
			
		except (ValueError, AttributeError):
			# If version parsing fails, assume update is available to be safe
			return True
	
	def download_update(self, download_url):
		"""Download the update file"""
		try:
			if not download_url:
				return self._error_response("No download URL provided")
			
			# Create downloads directory
			downloads_dir = os.path.join(get_data_path(), "downloads")
			os.makedirs(downloads_dir, exist_ok=True)
			
			# Get filename from URL
			filename = download_url.split('/')[-1]
			if not filename.endswith('.exe'):
				filename = "InventorySystem_Update.exe"
			
			file_path = os.path.join(downloads_dir, filename)
			
			# Download the file
			response = requests.get(download_url, stream=True, timeout=30)
			response.raise_for_status()
			
			total_size = int(response.headers.get('content-length', 0))
			downloaded = 0
			
			with open(file_path, 'wb') as f:
				for chunk in response.iter_content(chunk_size=8192):
					if chunk:
						f.write(chunk)
						downloaded += len(chunk)
			
			return self._success_response(
				"Update downloaded successfully",
				file_path=file_path,
				file_size=downloaded,
				filename=filename
			)
			
		except requests.RequestException as e:
			return self._error_response(f"Failed to download update: Network error - {str(e)}")
		except Exception as e:
			return self._error_response(f"Failed to download update: {str(e)}")
	
	def install_update(self, file_path):
		"""Install the downloaded update"""
		try:
			if not os.path.exists(file_path):
				return self._error_response("Update file not found")
			
			# Get current executable path
			if getattr(sys, 'frozen', False):
				current_exe = sys.executable
			else:
				return self._error_response("Cannot update - not running as executable")
			
			# Create batch script for updating
			batch_script = os.path.join(get_data_path(), "update.bat")
			
			with open(batch_script, 'w') as f:
				f.write(f'''@echo off
echo Installing update...
timeout /t 3 /nobreak > nul
taskkill /f /im "{os.path.basename(current_exe)}" > nul 2>&1
timeout /t 2 /nobreak > nul
copy /y "{file_path}" "{current_exe}"
if %errorlevel% equ 0 (
    echo Update installed successfully!
    del "{file_path}"
    del "{batch_script}"
    start "" "{current_exe}"
) else (
    echo Update failed!
    pause
)
''')
			
			# Start the update process
			subprocess.Popen(['cmd', '/c', batch_script], creationflags=subprocess.CREATE_NO_WINDOW)
			
			return self._success_response(
				"Update process started - application will restart",
				restart_required=True
			)
			
		except Exception as e:
			return self._error_response(f"Failed to install update: {str(e)}")
	
	def open_release_page(self, release_url):
		"""Open the GitHub release page in the browser"""
		try:
			webbrowser.open(release_url)
			return self._success_response("Release page opened in browser")
		except Exception as e:
			return self._error_response(f"Failed to open release page: {str(e)}")

def get_resource_path(relative_path):
	"""Get absolute path to resource, works for dev and for PyInstaller"""
	try:
		# PyInstaller creates a temp folder and stores path in _MEIPASS
		base_path = sys._MEIPASS
	except Exception:
		base_path = os.path.abspath(".")
	return os.path.join(base_path, relative_path)

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

def main():
	# Initialize API
	api = InventoryAPI()
	
	# Use resource path function to handle both development and compiled versions
	html_file = get_resource_path("index.html")
	url = f'file:///{html_file.replace(os.sep, "/")}'
	
	webview.create_window(
		"Bad-Bandit IMS",
		url,
		width=1200,
		height=720,
		min_size=(1100, 125),
		resizable=True,
		js_api=api
	)
	webview.start(debug=False)

if __name__ == "__main__":
	main()