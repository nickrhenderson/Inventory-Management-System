"""Image API methods exposed to the pywebview front end.

These wrap :class:`services.image_service.ProductImageService` and return the
same standardized response shapes the front end expects.
"""


class ImageApiMixin:
	"""Product image save / fetch / delete methods callable from JavaScript."""

	def save_product_image(self, product_name, image_b64):
		"""Save a base64-encoded image for a product to the data folder and store
		its filename in the product_totals row."""
		try:
			if not product_name:
				return self._error_response("Product name is required")
			if not image_b64:
				return self._error_response("Image data is required")

			filename = self.image_service.save_product_image(product_name, image_b64)
			return self.db_manager.set_product_image(product_name, filename)
		except Exception as e:
			return self._error_response(f"Failed to save product image: {str(e)}")

	def get_product_image_path(self, product_name):
		"""Return the absolute path of a product's image, or None."""
		try:
			image_path = self.image_service.get_product_image_path(product_name)
			if image_path:
				return self._success_response("Product image path retrieved", image_path=image_path)
			return self._success_response("No product image", image_path=None)
		except Exception:
			return self._error_response("Failed to retrieve product image path")

	def delete_product_image(self, product_name):
		"""Delete a product's stored image file and clear the DB field."""
		try:
			self.image_service.delete_product_image(product_name)
			return self._success_response("Product image removed")
		except Exception as e:
			return self._error_response(f"Failed to remove product image: {str(e)}")
