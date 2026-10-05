"""Group, group-parameter and product-group API methods."""


class GroupApiMixin:
	"""All group-related methods callable from JavaScript."""

	def get_all_groups(self):
		"""Get all groups with their product IDs"""
		return self.db_manager.get_all_groups()

	def create_group(self, group_name):
		"""Create a new group"""
		return self.db_manager.create_group(group_name)

	def delete_group(self, group_id):
		"""Delete a group (products remain, just removed from group)"""
		return self.db_manager.delete_group(group_id)

	def update_group_order(self, group_id, new_order):
		"""Update the display order of a group"""
		return self.db_manager.update_group_order(group_id, new_order)

	def update_group_collapsed_state(self, group_id, is_collapsed):
		"""Update whether a group is collapsed or expanded"""
		return self.db_manager.update_group_collapsed_state(group_id, is_collapsed)

	def update_group_name(self, group_id, new_name):
		"""Rename a group"""
		return self.db_manager.update_group_name(group_id, new_name)

	def update_group_parameter(self, parameter_id, new_name):
		"""Rename a group parameter"""
		return self.db_manager.update_group_parameter(parameter_id, new_name)

	def add_product_to_group(self, group_id, product_id):
		"""Add a product to a group"""
		return self.db_manager.add_product_to_group(group_id, product_id)

	def remove_product_from_group(self, product_id):
		"""Remove a product from its group"""
		return self.db_manager.remove_product_from_group(product_id)

	def get_product_group(self, product_id):
		"""Get the group that a product belongs to (if any)"""
		return self.db_manager.get_product_group(product_id)

	# Group parameters

	def get_group_parameters(self, group_id):
		"""Get parameters defined for a group"""
		return self.db_manager.get_group_parameters(group_id)

	def create_group_parameter(self, group_id, name):
		"""Create a new parameter for a group"""
		return self.db_manager.create_group_parameter(group_id, name)

	def delete_group_parameter(self, parameter_id):
		"""Delete a group parameter"""
		return self.db_manager.delete_group_parameter(parameter_id)

	def get_product_group_parameter_values(self, product_id):
		"""Get custom parameter values for a product"""
		return self.db_manager.get_product_group_parameter_values(product_id)

	def set_product_group_parameter_values(self, product_id, values_list):
		"""Set (upsert) custom parameter values for a product"""
		return self.db_manager.set_product_group_parameter_values(product_id, values_list)
