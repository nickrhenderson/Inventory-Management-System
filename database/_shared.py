"""Shared helpers used by multiple data-access modules.

These methods operate on an *open connection* passed in by the caller, so they
can be used from any domain module. They are mixed into :class:`DatabaseManager`
for convenient access.
"""

from datetime import datetime


class EventLogMixin:
	"""Cross-cutting write helpers shared between product/inventory modules."""

	def _log_inventory_event(self, conn, product_id, delta, title=None, event_date=None, memo=None):
		"""Log a quantity delta for a product."""
		if delta == 0:
			return
		event_date_value = event_date or datetime.now().date()
		memo_value = (memo or "").strip() or None
		conn.execute(
			"""
			INSERT INTO inventory_events (product_id, delta, event_title, event_date, memo)
			VALUES (?, ?, ?, ?, ?)
			""",
			(product_id, delta, title or "Inventory change", event_date_value, memo_value)
		)

	def _change_product_total(self, conn, product_name, delta):
		"""Apply a stock change to the total tracked for an exact product name."""
		conn.execute(
			"""
			INSERT INTO product_totals (product_name, amount_on_hand)
			VALUES (?, ?)
			ON CONFLICT(product_name) DO UPDATE SET
				amount_on_hand = MAX(0, product_totals.amount_on_hand + excluded.amount_on_hand),
				last_updated = CURRENT_TIMESTAMP
			""",
			(product_name, delta)
		)

	def _seed_product_totals(self, conn):
		"""Create totals for existing batch names without overwriting edited totals."""
		conn.execute(
			"""
			INSERT INTO product_totals (product_name, amount_on_hand)
			SELECT product_name, SUM(amount) FROM products GROUP BY product_name
			ON CONFLICT(product_name) DO NOTHING
			"""
		)
