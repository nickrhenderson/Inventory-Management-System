"""Schema initialization and migration logic.

Handles:
- Creating the SQLite database on first run
- Migrating existing tables to match :data:`database.schema.EXPECTED_SCHEMA`
  (dynamically adding/removing columns via table recreation when needed)
- Applying one-off data migrations
- Creating performance indexes
"""

import os
import sqlite3

from .schema import EXPECTED_SCHEMA


class MigrationMixin:
	"""Provides table creation, migration, and index setup."""

	def init_database(self):
		"""Create the data folder and migrate all tables to the expected schema."""
		# Create data folder if it doesn't exist
		data_dir = getattr(self, 'data_dir', None) or _default_data_dir()
		if not os.path.exists(data_dir):
			os.makedirs(data_dir)

		db_path = os.path.join(data_dir, "inventory.db")
		self.db_path = db_path

		# Existing products stored total_cost for an entire batch. Convert it once
		# when the original production count column is introduced.
		needs_cost_per_product_migration = False
		if os.path.exists(db_path):
			with sqlite3.connect(db_path) as migration_check_conn:
				products_table = migration_check_conn.execute(
					"SELECT name FROM sqlite_master WHERE type='table' AND name='products'"
				).fetchone()
				if products_table:
					product_columns = {row[1] for row in migration_check_conn.execute("PRAGMA table_info(products)")}
					needs_cost_per_product_migration = "original_amount" not in product_columns

		# Initialize database and create/migrate tables dynamically
		with sqlite3.connect(db_path) as conn:
			# Drop old inventory table if it exists (legacy)
			conn.execute('DROP TABLE IF EXISTS inventory')

			# Migrate all tables to match expected schema
			for table_name, expected_columns in EXPECTED_SCHEMA.items():
				self._migrate_table_schema(conn, table_name, expected_columns)

			if needs_cost_per_product_migration:
				conn.execute("""
					UPDATE products
					SET original_amount = CASE WHEN amount > 0 THEN amount ELSE 1 END
				""")
				conn.execute("UPDATE products SET total_cost = total_cost / original_amount")

			self._seed_product_totals(conn)

			# Remove any product_totals rows that no longer have a matching batch.
			# Keeps the product page from showing stale names after a batch is deleted.
			conn.execute("""
				DELETE FROM product_totals
				WHERE product_name NOT IN (SELECT product_name FROM products)
			""")

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


def _default_data_dir():
	"""Resolve the default writable data directory without needing an instance."""
	from . import connection
	return connection.get_data_path()
