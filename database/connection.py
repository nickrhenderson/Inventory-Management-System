"""Database connection helpers and shared utility methods.

Responsible for:
- Resolving the writable data directory (works in dev and PyInstaller frozen mode)
- Opening SQLite connections with the row factory applied
- Date parsing helpers shared across all data-access modules
- Standardized success / error response shapes
"""

import os
import sqlite3
import sys
from datetime import datetime


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
		# Running as Python script (developer testing environment).
		# Keep runtime data inside dev/data so it never mixes with the source tree.
		project_root = os.path.dirname(os.path.dirname(__file__))
		return os.path.join(project_root, "dev", "data")


class ConnectionMixin:
	"""Provides the shared database connection and response helpers.

	Concrete :class:`DatabaseManager` subclasses the domain mixins and this
	mixin so every data-access method has access to the same helpers.
	"""

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
		message = str(error)
		return {"success": False, "error": message, "message": message}
