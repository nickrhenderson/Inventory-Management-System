"""Database package: connection, schema, migrations and domain data access.

Public API:
    - :class:`DatabaseManager` - central data-access object
    - :func:`get_data_path` - resolve the writable data directory
"""

from .app import DatabaseManager
from .connection import get_data_path

__all__ = ["DatabaseManager", "get_data_path"]
