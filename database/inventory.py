"""Inventory event data-access methods.

Handles the inventory_events table: adding events (which also adjust product
amounts), listing them newest-first, and editing their title/date/memo.
"""


class InventoryEventMixin:
	"""Inventory event logging, listing and editing operations."""

	def get_inventory_events(self, limit=200):
		"""Return inventory events ordered newest first."""
		with self._get_db_connection() as conn:
			cursor = conn.execute(
				"""
				SELECT e.id, e.product_id, p.product_name, p.batch_number, e.delta, e.event_title,
				       e.event_date, e.memo, e.created_at
				FROM inventory_events e
				JOIN products p ON p.id = e.product_id
				ORDER BY e.created_at DESC
				LIMIT ?
				""",
				(limit,)
			)
			return [dict(row) for row in cursor.fetchall()]

	def add_inventory_events(self, events, title=None, event_date=None, memo=None):
		"""Add one or more inventory events and update product amounts accordingly."""
		try:
			with self._get_db_connection() as conn:
				for entry in events:
					product_id = entry.get('product_id')
					delta = int(entry.get('delta', 0))
					if not product_id or delta == 0:
						continue
					current_row = conn.execute('SELECT product_name, amount, original_amount FROM products WHERE id = ?', (product_id,)).fetchone()
					if not current_row:
						raise Exception(f"Product {product_id} not found")
					current_amount = current_row['amount'] or 0
					original_amount = current_row['original_amount'] or 1
					if delta < 0 and current_amount + delta < 0:
						raise Exception(f"Cannot remove more than in stock for product {product_id}")
					new_amount = current_amount + delta
					if new_amount > original_amount:
						raise Exception(f"Cannot add more than the original number of products produced for product {product_id}")
					conn.execute(
						"UPDATE products SET amount = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?",
						(new_amount, product_id)
					)
					self._change_product_total(conn, current_row['product_name'], delta)
					self._log_inventory_event(
						conn,
						product_id,
						delta,
						title or entry.get('event_title') or "Inventory event",
						event_date or entry.get('event_date'),
						memo or entry.get('memo')
					)
				conn.commit()
				return self._success_response("Events added")
		except Exception as e:
			return self._error_response(e)

	def update_inventory_event_memo(self, event_id, memo):
		"""Attach or replace the free-form memo stored on a single inventory event."""
		try:
			memo_value = (memo or "").strip()
			with self._get_db_connection() as conn:
				existing = conn.execute('SELECT id FROM inventory_events WHERE id = ?', (event_id,)).fetchone()
				if not existing:
					return self._error_response("Event not found")
				conn.execute(
					"UPDATE inventory_events SET memo = ? WHERE id = ?",
					(memo_value or None, event_id)
				)
				conn.commit()
				return self._success_response("Event memo updated", memo=memo_value or None)
		except Exception as e:
			return self._error_response(e)

	def update_inventory_event(self, event_ids, title=None, event_date=None, memo=None):
		"""Update title, date and memo for one or more inventory event rows."""
		try:
			if not event_ids:
				return self._error_response("No event ids provided")
			title_value = (title or "").strip() or None
			event_date_value = self._parse_date(event_date)
			memo_value = (memo or "").strip() or None
			placeholders = ",".join("?" for _ in event_ids)
			with self._get_db_connection() as conn:
				existing = conn.execute(
					f"SELECT COUNT(*) AS count FROM inventory_events WHERE id IN ({placeholders})",
					tuple(event_ids)
				).fetchone()
				if not existing or existing['count'] == 0:
					return self._error_response("Event not found")
				conn.execute(
					f"""
					UPDATE inventory_events
					SET event_title = COALESCE(?, event_title),
					    event_date = COALESCE(?, event_date),
					    memo = ?
					WHERE id IN ({placeholders})
					""",
					(title_value, event_date_value, memo_value, *event_ids)
				)
				conn.commit()
				return self._success_response("Event updated")
		except Exception as e:
			return self._error_response(e)
