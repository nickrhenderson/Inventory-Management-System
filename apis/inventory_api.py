"""Inventory / event API methods exposed to the pywebview front end."""


class InventoryApiMixin:
	"""Inventory events and stock-adjustment methods callable from JavaScript."""

	def get_inventory_events(self, limit=200):
		"""Return inventory events newest-first."""
		return self.db_manager.get_inventory_events(limit)

	def update_inventory_event_memo(self, event_id, memo):
		"""Attach or replace the free-form memo stored on a single inventory event."""
		return self.db_manager.update_inventory_event_memo(event_id, memo)

	def update_inventory_event(self, event_ids, title=None, event_date=None, memo=None):
		"""Update title, date and memo for one or more inventory event rows."""
		return self.db_manager.update_inventory_event(event_ids, title, event_date, memo)
