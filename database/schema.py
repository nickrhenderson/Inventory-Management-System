"""Central definition of the expected database schema.

Each table maps to its expected columns as (column_name, sql_type) tuples.
The migration layer uses this to create missing tables and to add/remove
columns that drift from the current expected shape.
"""

EXPECTED_SCHEMA = {
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
		('original_amount', 'INTEGER DEFAULT 1'),
		('notes', 'TEXT'),
		('last_updated', 'DATETIME DEFAULT CURRENT_TIMESTAMP')
	],
	'product_totals': [
		('id', 'INTEGER PRIMARY KEY AUTOINCREMENT'),
		('product_name', 'TEXT UNIQUE NOT NULL'),
		('amount_on_hand', 'INTEGER DEFAULT 0'),
		('image_path', 'TEXT'),
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
	],
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
		('memo', 'TEXT'),
		('created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP')
	]
}
