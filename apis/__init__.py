"""InventoryAPI - the single js_api object passed to pywebview.

The class is assembled from domain-specific mixins (products, ingredients,
inventory, groups, backup, server, image) so its ~59 methods are easy to
navigate while still exposing a single object to the JavaScript bridge.

Import from the rest of the app with::

    from apis import InventoryAPI
"""

from .common import ResponseMixin
from .product_api import ProductApiMixin
from .ingredient_api import IngredientApiMixin
from .inventory_api import InventoryApiMixin
from .group_api import GroupApiMixin
from .backup_api import BackupApiMixin
from .server_api import ServerApiMixin
from .image_api import ImageApiMixin
from .settings_api import SettingsApiMixin


class InventoryAPI(
	ResponseMixin,
	ProductApiMixin,
	IngredientApiMixin,
	InventoryApiMixin,
	GroupApiMixin,
	BackupApiMixin,
	ServerApiMixin,
	ImageApiMixin,
	SettingsApiMixin,
):
	"""The complete API surface exposed to the front end (pywebview js_api)."""

	def __init__(self, db_manager, settings, google_drive, live_server, image_service, app_version):
		"""Wire up the collaborators needed by every API mixin."""
		self.db_manager = db_manager
		self.settings = settings
		self.google_drive = google_drive
		self.live_server = live_server
		self.image_service = image_service
		self._app_version = app_version


__all__ = ["InventoryAPI"]
