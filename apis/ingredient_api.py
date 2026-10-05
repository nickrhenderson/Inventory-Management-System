"""Ingredient API methods exposed to the pywebview front end."""


class IngredientApiMixin:
	"""All ingredient-related methods callable from JavaScript."""

	def flag_ingredient(self, ingredient_id):
		"""Flag an ingredient as problematic"""
		return self.db_manager.flag_ingredient(ingredient_id)

	def unflag_ingredient(self, ingredient_id):
		"""Remove flag from an ingredient"""
		return self.db_manager.unflag_ingredient(ingredient_id)

	def delete_ingredient(self, ingredient_id):
		"""Delete an ingredient and its associated product relationships"""
		return self.db_manager.delete_ingredient(ingredient_id)

	def get_flagged_ingredients(self):
		"""Get all flagged ingredients"""
		return self.db_manager.get_flagged_ingredients()

	def search_ingredient_by_barcode(self, barcode_id):
		"""Search for a specific ingredient by its barcode ID"""
		return self.db_manager.search_ingredient_by_barcode(barcode_id)

	def generate_barcode_pdf(self, barcode_id):
		"""Generate a print-ready PDF barcode label (opens in default viewer)"""
		return self.db_manager.generate_barcode_pdf(barcode_id)

	def get_ingredient_by_id(self, ingredient_id):
		"""Get a specific ingredient by its ID"""
		return self.db_manager.get_ingredient_by_id(ingredient_id)

	def update_ingredient(self, ingredient_data):
		"""Update an existing ingredient (barcode cannot be changed)"""
		return self.db_manager.update_ingredient(ingredient_data)

	def get_all_ingredients(self):
		"""Get all available ingredients for product creation"""
		return self.db_manager.get_all_ingredients()

	def create_ingredient(self, ingredient_data):
		"""Create a new ingredient with barcode generation"""
		return self.db_manager.create_ingredient(ingredient_data)
