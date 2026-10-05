"""Group data-access methods.

Handles groups, group_products relationships, group parameters, and the
per-product values stored for those parameters.
"""

import sqlite3


class GroupMixin:
	"""Group management, group parameters and product parameter values."""

	def get_all_groups(self):
		"""Get all groups ordered by display_order"""
		with self._get_db_connection() as conn:
			cursor = conn.execute('''
				SELECT id, name, display_order, is_collapsed
				FROM groups
				ORDER BY display_order
			''')
			groups = [dict(row) for row in cursor.fetchall()]

			# For each group, get the product IDs
			for group in groups:
				cursor = conn.execute('''
					SELECT product_id
					FROM group_products
					WHERE group_id = ?
				''', (group['id'],))
				group['product_ids'] = [row[0] for row in cursor.fetchall()]

			return groups

	def create_group(self, group_name):
		"""Create a new group"""
		try:
			with self._get_db_connection() as conn:
				# Get the max display_order
				cursor = conn.execute('SELECT MAX(display_order) as max_order FROM groups')
				result = cursor.fetchone()
				next_order = (result['max_order'] or -1) + 1

				# Insert the group
				cursor = conn.execute('''
					INSERT INTO groups (name, display_order, is_collapsed)
					VALUES (?, ?, 0)
				''', (group_name, next_order))

				group_id = cursor.lastrowid
				conn.commit()

				return self._success_response(
					"Group created successfully",
					group_id=group_id,
					display_order=next_order
				)
		except Exception as e:
			return self._error_response(e)

	def delete_group(self, group_id):
		"""Delete a group (products are not deleted, just removed from group)"""
		try:
			with self._get_db_connection() as conn:
				# Verify group exists
				group = conn.execute('SELECT name FROM groups WHERE id = ?', (group_id,)).fetchone()
				if not group:
					return self._error_response("Group not found")

				group_name = group['name']

				# Delete group-product relationships (CASCADE will handle this, but explicit is clear)
				conn.execute('DELETE FROM group_products WHERE group_id = ?', (group_id,))

				# Delete the group
				conn.execute('DELETE FROM groups WHERE id = ?', (group_id,))
				conn.commit()

				return self._success_response(f"Group '{group_name}' deleted successfully")
		except Exception as e:
			return self._error_response(e)

	def update_group_order(self, group_id, new_order):
		"""Update the display order of a group"""
		try:
			with self._get_db_connection() as conn:
				conn.execute('''
					UPDATE groups
					SET display_order = ?, last_updated = CURRENT_TIMESTAMP
					WHERE id = ?
				''', (new_order, group_id))
				conn.commit()

				return self._success_response("Group order updated successfully")
		except Exception as e:
			return self._error_response(e)

	def update_group_collapsed_state(self, group_id, is_collapsed):
		"""Update whether a group is collapsed"""
		try:
			with self._get_db_connection() as conn:
				conn.execute('''
					UPDATE groups
					SET is_collapsed = ?, last_updated = CURRENT_TIMESTAMP
					WHERE id = ?
				''', (1 if is_collapsed else 0, group_id))
				conn.commit()

				return self._success_response("Group collapsed state updated successfully")
		except Exception as e:
			return self._error_response(e)

	def update_group_name(self, group_id, new_name):
		"""Rename a group"""
		try:
			with self._get_db_connection() as conn:
				# Verify group exists
				existing = conn.execute('SELECT id FROM groups WHERE id = ?', (group_id,)).fetchone()
				if not existing:
					return self._error_response("Group not found")
				conn.execute('''
					UPDATE groups
					SET name = ?, last_updated = CURRENT_TIMESTAMP
					WHERE id = ?
				''', (new_name.strip(), group_id))
				conn.commit()
				return self._success_response("Group name updated")
		except Exception as e:
			return self._error_response(e)

	def add_product_to_group(self, group_id, product_id):
		"""Add a product to a group"""
		try:
			with self._get_db_connection() as conn:
				# Remove product from any existing group first (UNIQUE constraint on product_id)
				# Also purge any existing custom parameter values tied to previous group's parameters
				conn.execute('DELETE FROM group_products WHERE product_id = ?', (product_id,))
				conn.execute('DELETE FROM product_group_parameter_values WHERE product_id = ?', (product_id,))

				# Add to new group
				conn.execute('''
					INSERT INTO group_products (group_id, product_id)
					VALUES (?, ?)
				''', (group_id, product_id))

				conn.commit()

				return self._success_response("Product added to group successfully")
		except Exception as e:
			return self._error_response(e)

	def remove_product_from_group(self, product_id):
		"""Remove a product from its group"""
		try:
			with self._get_db_connection() as conn:
				# Remove relationship
				conn.execute('DELETE FROM group_products WHERE product_id = ?', (product_id,))
				# Purge any custom parameter values now that product is ungrouped
				conn.execute('DELETE FROM product_group_parameter_values WHERE product_id = ?', (product_id,))
				conn.commit()

				return self._success_response("Product removed from group successfully")
		except Exception as e:
			return self._error_response(e)

	def get_product_group(self, product_id):
		"""Get the group that a product belongs to (if any)"""
		with self._get_db_connection() as conn:
			cursor = conn.execute('''
				SELECT g.id, g.name, g.display_order, g.is_collapsed
				FROM groups g
				JOIN group_products gp ON g.id = gp.group_id
				WHERE gp.product_id = ?
			''', (product_id,))
			row = cursor.fetchone()
			return dict(row) if row else None

	# === Group Parameter Methods ===

	def get_group_parameters(self, group_id):
		"""Return all parameters defined for a group"""
		with self._get_db_connection() as conn:
			cursor = conn.execute('''
				SELECT id, name, display_order
				FROM group_parameters
				WHERE group_id = ?
				ORDER BY display_order, name
			''', (group_id,))
			return [dict(row) for row in cursor.fetchall()]

	def create_group_parameter(self, group_id, name):
		"""Create a new parameter for a group"""
		try:
			with self._get_db_connection() as conn:
				# Determine next display_order
				order_row = conn.execute('SELECT MAX(display_order) as max_order FROM group_parameters WHERE group_id = ?', (group_id,)).fetchone()
				next_order = (order_row['max_order'] or -1) + 1
				cursor = conn.execute('''
					INSERT INTO group_parameters (group_id, name, display_order)
					VALUES (?, ?, ?)
				''', (group_id, name.strip(), next_order))
				param_id = cursor.lastrowid
				conn.commit()
				return self._success_response("Group parameter created", parameter_id=param_id, display_order=next_order)
		except Exception as e:
			return self._error_response(e)

	def update_group_parameter(self, parameter_id, new_name):
		"""Rename a group parameter"""
		try:
			with self._get_db_connection() as conn:
				# Verify parameter exists
				param = conn.execute('SELECT id, group_id FROM group_parameters WHERE id = ?', (parameter_id,)).fetchone()
				if not param:
					return self._error_response("Group parameter not found")
				# Attempt update (will raise constraint error if duplicate)
				conn.execute('''
					UPDATE group_parameters
					SET name = ?
					WHERE id = ?
				''', (new_name.strip(), parameter_id))
				conn.commit()
				return self._success_response("Group parameter updated")
		except sqlite3.IntegrityError:
			return self._error_response("A parameter with that name already exists in this group")
		except Exception as e:
			return self._error_response(e)

	def delete_group_parameter(self, parameter_id):
		"""Delete a group parameter and any product values referencing it"""
		try:
			with self._get_db_connection() as conn:
				conn.execute('DELETE FROM product_group_parameter_values WHERE group_parameter_id = ?', (parameter_id,))
				conn.execute('DELETE FROM group_parameters WHERE id = ?', (parameter_id,))
				conn.commit()
				return self._success_response("Group parameter deleted")
		except Exception as e:
			return self._error_response(e)

	# === Product Parameter Value Methods ===

	def get_product_group_parameter_values(self, product_id):
		"""Get parameter values for a product (including parameter name & group_id)"""
		with self._get_db_connection() as conn:
			cursor = conn.execute('''
				SELECT pgpv.id, pgpv.product_id, pgpv.group_parameter_id, pgpv.value,
				       gp.name as parameter_name, gp.group_id
				FROM product_group_parameter_values pgpv
				JOIN group_parameters gp ON gp.id = pgpv.group_parameter_id
				WHERE pgpv.product_id = ?
			''', (product_id,))
			return [dict(row) for row in cursor.fetchall()]

	def set_product_group_parameter_values(self, product_id, values_list):
		"""Set (upsert) parameter values for a product. values_list: [{parameter_id, value}]"""
		try:
			with self._get_db_connection() as conn:
				for item in values_list or []:
					param_id = item.get('parameter_id')
					val = item.get('value', '')
					if not param_id:
						continue
					# Try update first
					updated = conn.execute('''
						UPDATE product_group_parameter_values
						SET value = ?, last_updated = CURRENT_TIMESTAMP
						WHERE product_id = ? AND group_parameter_id = ?
					''', (val, product_id, param_id))
					if updated.rowcount == 0:
						conn.execute('''
							INSERT INTO product_group_parameter_values (product_id, group_parameter_id, value)
							VALUES (?, ?, ?)
						''', (product_id, param_id, val))
				conn.commit()
				return self._success_response("Product parameter values saved")
		except Exception as e:
			return self._error_response(e)
