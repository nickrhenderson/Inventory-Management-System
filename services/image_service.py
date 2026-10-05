"""Product image storage service.

Handles decoding, saving and removing a product's image on disk, and tracking
the stored filename in the product_totals table. Used by both the desktop app
API and the live phone server so image handling stays in one place.
"""

import os
import re


def _images_dir(data_dir):
	"""Return (and create if needed) the writable product-images directory."""
	images_dir = os.path.join(data_dir, "product_images")
	os.makedirs(images_dir, exist_ok=True)
	return images_dir


def _safe_product_filename(product_name):
	"""Return a safe, unique base filename (without extension) for a product."""
	safe = re.sub(r'[^A-Za-z0-9._-]+', '_', str(product_name)).strip('._') or 'product'
	return safe


def decode_image(image_b64):
	"""Decode a base64 image (optionally with a data: prefix) and sniff the extension."""
	import base64
	if not image_b64:
		raise ValueError("Image data is required")

	if "," in image_b64[:64] and image_b64.startswith("data:"):
		image_b64 = image_b64.split(",", 1)[1]

	raw = base64.b64decode(image_b64)
	if not raw:
		raise ValueError("Could not decode image data")

	# Pick an extension from the sniffed content.
	ext = ".png"
	if raw[:8] == b"\x89PNG\r\n\x1a\n":
		ext = ".png"
	elif raw[:2] == b"\xff\xd8":
		ext = ".jpg"
	elif raw[:6] in (b"GIF87a", b"GIF89a"):
		ext = ".gif"
	elif raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
		ext = ".webp"
	elif raw[12:16] == b"ftyp":
		ext = ".mp4"

	return raw, ext


class ProductImageService:
	"""Save / remove product images on disk and in the database."""

	def __init__(self, database_manager, data_dir):
		self.database_manager = database_manager
		self.data_dir = data_dir

	def _belongs_to_product(self, filename, product_name):
		"""Return True if the stored file currently belongs to this product name."""
		try:
			with self.database_manager._get_db_connection() as conn:
				row = conn.execute(
					"SELECT image_path FROM product_totals WHERE product_name = ?",
					(product_name,)
				).fetchone()
				return bool(row and row["image_path"] == filename)
		except Exception:
			return False

	def _remove_old_product_image(self, product_name, new_filename):
		"""Delete any previously stored image file for this product that differs from new_filename."""
		try:
			with self.database_manager._get_db_connection() as conn:
				row = conn.execute(
					"SELECT image_path FROM product_totals WHERE product_name = ?",
					(product_name,)
				).fetchone()
				old = row["image_path"] if row else None
			if old and old != new_filename:
				old_path = os.path.join(_images_dir(self.data_dir), old)
				if os.path.exists(old_path):
					try:
						os.remove(old_path)
					except OSError:
						pass
		except Exception:
			pass

	def save_product_image(self, product_name, image_b64):
		"""Save a base64-encoded image for a product and return the stored filename."""
		if not product_name:
			raise ValueError("Product name is required")

		raw, ext = decode_image(image_b64)
		base = _safe_product_filename(product_name)
		filename = f"{base}{ext}"
		dest = os.path.join(_images_dir(self.data_dir), filename)

		# Avoid collisions by appending a counter when the file already exists
		# but belongs to a *different* product (same sanitized name).
		counter = 1
		while os.path.exists(dest) and not self._belongs_to_product(filename, product_name):
			filename = f"{base}_{counter}{ext}"
			dest = os.path.join(_images_dir(self.data_dir), filename)
			counter += 1

		with open(dest, "wb") as f:
			f.write(raw)

		# Remove an old image for the same product if the filename changed.
		self._remove_old_product_image(product_name, filename)

		self.database_manager.set_product_image(product_name, filename)
		return filename

	def get_product_image_path(self, product_name):
		"""Return the absolute path of a product's image, or None."""
		with self.database_manager._get_db_connection() as conn:
			row = conn.execute(
				"SELECT image_path FROM product_totals WHERE product_name = ?",
				(product_name,)
			).fetchone()
			if row and row["image_path"]:
				p = os.path.join(_images_dir(self.data_dir), row["image_path"])
				if os.path.exists(p):
					return p
		return None

	def delete_product_image(self, product_name):
		"""Delete a product's stored image file and clear the DB field."""
		self._remove_old_product_image(product_name, None)
		self.database_manager.set_product_image(product_name, None)
