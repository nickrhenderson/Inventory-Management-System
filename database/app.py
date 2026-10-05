"""DatabaseManager - the concrete entry point for all data access.

Composes the domain mixins (products, ingredients, inventory, groups) with the
shared connection/migration helpers into a single :class:`DatabaseManager`
class so external callers keep one familiar object. Also holds the barcode
generation and database snapshot/restore logic that does not cleanly belong to
a single domain module.

Import this from the rest of the app with::

    from database import DatabaseManager
"""

import os
import sqlite3

from utils.barcode import BarcodeManager

from .connection import ConnectionMixin
from . import connection as _connection
from .migrations import MigrationMixin
from ._shared import EventLogMixin
from .products import ProductMixin
from .ingredients import IngredientMixin
from .inventory import InventoryEventMixin
from .groups import GroupMixin


class DatabaseManager(
	ConnectionMixin,
	MigrationMixin,
	EventLogMixin,
	ProductMixin,
	IngredientMixin,
	InventoryEventMixin,
	GroupMixin,
):
	"""Central data-access object for the inventory application."""

	def __init__(self, app_version="0.2.0"):
		self.app_version = app_version
		self.data_dir = _connection.get_data_path()
		self.db_path = os.path.join(self.data_dir, "inventory.db")
		self.barcode_manager = BarcodeManager()

		self.init_database()

	# ------------------------------------------------------------------
	# Database location / revision helpers
	# ------------------------------------------------------------------

	def get_database_path(self):
		"""Return the current on-disk database path."""
		return self.db_path

	def get_database_revision(self):
		"""Return a lightweight marker that changes when the database file is committed."""
		try:
			stat_result = os.stat(self.db_path)
			return f"{stat_result.st_mtime_ns}:{stat_result.st_size}"
		except OSError:
			return None

	# ------------------------------------------------------------------
	# Barcode / batch generation (delegates to BarcodeManager)
	# ------------------------------------------------------------------

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

	# ------------------------------------------------------------------
	# Snapshot / restore (used by Google Drive backup)
	# ------------------------------------------------------------------

	def create_database_snapshot(self, snapshot_path):
		"""Write a consistent copy of the current database to snapshot_path."""
		try:
			os.makedirs(os.path.dirname(snapshot_path), exist_ok=True)
			snapshot_bytes = self.create_database_snapshot_bytes()
			with open(snapshot_path, "wb") as snapshot_file:
				snapshot_file.write(snapshot_bytes)
			return self._success_response("Database snapshot created", snapshot_path=snapshot_path)
		except Exception as e:
			return self._error_response(e)

	def create_database_snapshot_bytes(self):
		"""Return a binary SQLite snapshot of the current database without using a temp file."""
		with self._get_db_connection() as source_conn:
			memory_conn = sqlite3.connect(":memory:")
			try:
				source_conn.backup(memory_conn)
				if hasattr(memory_conn, "serialize"):
					return memory_conn.serialize()
				raise RuntimeError("SQLite serialization is not available in this Python build")
			finally:
				memory_conn.close()

	def restore_database_from_snapshot(self, snapshot_path):
		"""Replace the current local database contents with a snapshot file."""
		try:
			if not os.path.exists(snapshot_path):
				return self._error_response("Snapshot file not found")

			with open(snapshot_path, "rb") as snapshot_file:
				return self.restore_database_from_snapshot_bytes(snapshot_file.read())

		except Exception as e:
			return self._error_response(e)

	def restore_database_from_snapshot_bytes(self, snapshot_bytes):
		"""Replace the current database contents with an in-memory SQLite snapshot."""
		try:
			memory_conn = sqlite3.connect(":memory:")
			try:
				if hasattr(memory_conn, "deserialize"):
					memory_conn.deserialize(snapshot_bytes)
				else:
					raise RuntimeError("SQLite deserialization is not available in this Python build")

				with self._get_db_connection() as target_conn:
					memory_conn.backup(target_conn)
			finally:
				memory_conn.close()

			# Re-run initialization so any missing indexes are restored.
			self.init_database()
			return self._success_response("Database restored successfully")
		except Exception as e:
			return self._error_response(e)
