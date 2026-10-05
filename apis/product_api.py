"""Product API methods exposed to the pywebview front end."""


class ProductApiMixin:
	"""All product-related methods callable from JavaScript."""

	def get_products_data(self):
		"""Get all products ordered by date_mixed (newest first)"""
		return self.db_manager.get_products_data()

	def get_product_totals(self):
		"""Get combined inventory totals for products with the same exact name."""
		return self.db_manager.get_product_totals()

	def update_product_total(self, product_name, amount_on_hand, memo=None):
		"""Update the combined on-hand amount for an exact product name.

		``memo`` is attached to each inventory event created for this change.
		"""
		return self.db_manager.update_product_total(product_name, amount_on_hand, memo=memo)

	def get_product_ingredients(self, product_id):
		"""Get all ingredients used in a specific product with their details"""
		return self.db_manager.get_product_ingredients(product_id)

	def check_product_has_flagged_ingredients(self, product_id):
		"""Check if a product contains any flagged ingredients"""
		return self.db_manager.check_product_has_flagged_ingredients(product_id)

	def search_products_by_ingredient_name(self, ingredient_name):
		"""Search for products that contain ingredients matching the given name"""
		return self.db_manager.search_products_by_ingredient_name(ingredient_name)

	def search_products_by_ingredient_barcode(self, barcode_id):
		"""Search for products that contain ingredient with specific barcode ID (supports partial matching)"""
		return self.db_manager.search_products_by_ingredient_barcode(barcode_id)

	def get_product_by_id(self, product_id):
		"""Get a specific product by its ID"""
		return self.db_manager.get_product_by_id(product_id)

	def update_product(self, product_data):
		"""Update an existing product with new ingredient data"""
		return self.db_manager.update_product(product_data)

	def adjust_product_amount(self, product_id, delta):
		"""Adjust product amount by the specified delta"""
		return self.db_manager.adjust_product_amount(product_id, delta)

	def update_product_amount(self, product_id, new_amount):
		"""Update product amount to a specific value"""
		return self.db_manager.update_product_amount(product_id, new_amount)

	def create_product(self, product_data):
		"""Create a new product with ingredients"""
		return self.db_manager.create_product(product_data)

	def delete_product(self, product_id):
		"""Delete a product and its associated ingredient relationships"""
		return self.db_manager.delete_product(product_id)

	def get_inventory_data(self):
		"""Legacy method - now returns products data for compatibility"""
		return self.db_manager.get_products_data()
