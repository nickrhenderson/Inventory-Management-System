import random
import string
import time
import tempfile
import webbrowser
import os
from reportlab.pdfgen import canvas
from reportlab.graphics.barcode import code128


class BarcodeManager:
	"""Handles all barcode generation and PDF creation operations"""
	
	def __init__(self):
		"""Initialize the barcode manager"""
		pass
	
	def generate_barcode_id(self, prefix="", length=12):
		"""Generate a barcode-compatible unique ID"""
		chars = string.digits + string.ascii_uppercase
		random_part = ''.join(random.choice(chars) for _ in range(length - len(prefix)))
		return f"{prefix}{random_part}"
	
	def generate_ingredient_barcode(self):
		"""Generate a realistic 12-digit UPC-style barcode for ingredients"""
		manufacturer_code = "978"  # Standard book manufacturer code
		item_code = ''.join(random.choice(string.digits) for _ in range(8))
		
		# Calculate UPC check digit
		digits = manufacturer_code + item_code
		odd_sum = sum(int(digits[i]) for i in range(0, 11, 2))
		even_sum = sum(int(digits[i]) for i in range(1, 11, 2))
		check_digit = (10 - ((odd_sum + even_sum * 3) % 10)) % 10
		
		return digits + str(check_digit)
	
	def generate_product_barcode(self):
		"""Generate a simple unique barcode for products"""
		timestamp = str(int(time.time() * 1000))[-10:]
		random_suffix = ''.join(random.choice(string.digits) for _ in range(2))
		return f"PRD{timestamp}{random_suffix}"
	
	def generate_barcode_pdf(self, barcode_id, ingredient_name="Unknown Ingredient"):
		"""Generate a PDF file with a printable barcode optimized for 1.5" x 1" labels (PLS198)"""
		try:
			# Create a temporary file for the PDF
			temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
			temp_filename = temp_file.name
			temp_file.close()
			
			# Define label dimensions for 1.5" x 1" labels (PLS198 template)
			# 72 points per inch: 1.5" = 108 points, 1" = 72 points
			label_width = 108
			label_height = 72
			
			# Create the PDF with custom page size
			c = canvas.Canvas(temp_filename, pagesize=(label_width, label_height))
			
			# Set up the page
			c.setTitle(f"Barcode - {ingredient_name}")
			
			# Define padding from edges (3 points for maximum space usage)
			padding = 3
			
			# Calculate available space for content
			content_width = label_width - (2 * padding)
			content_height = label_height - (2 * padding)
			
			# Reserve space for ingredient name at top and barcode ID at bottom
			name_height = 10
			barcode_id_height = 8
			barcode_area_height = content_height - name_height - barcode_id_height
			
			# Handle ingredient name - single line, truncated if necessary
			max_name_length = 16  # Adjust based on available width
			display_name = ingredient_name[:max_name_length] + "..." if len(ingredient_name) > max_name_length else ingredient_name
			
			# Add ingredient name at top with padding
			c.setFont("Helvetica-Bold", 6)
			c.drawCentredString(label_width/2, label_height - padding - 6, display_name)
			
			# Create barcode with optimal scanner-friendly dimensions
			# Use industry-standard dimensions for better scanning
			barcode_height = min(barcode_area_height, 30)  # Good height for scanning
			
			# Start with scanner-friendly bar width (minimum 0.8 points for reliable scanning)
			bar_width = 1.2  # Start larger for better scanning
			barcode = code128.Code128(barcode_id, barWidth=bar_width, barHeight=barcode_height)
			
			# If barcode is too wide, reduce bar width but not below scanner minimum
			while barcode.width > content_width and bar_width > 0.8:
				bar_width -= 0.05
				barcode = code128.Code128(barcode_id, barWidth=bar_width, barHeight=barcode_height)
			
			# Center the barcode horizontally, position in middle area
			x_position = (label_width - barcode.width) / 2
			y_position = padding + barcode_id_height + (barcode_area_height - barcode_height) / 2
			
			# Draw the barcode
			barcode.drawOn(c, x_position, y_position)
			
			# Add barcode ID text below the barcode
			c.setFont("Helvetica", 5)
			c.drawCentredString(label_width/2, padding + 2, barcode_id)
			
			# Save the PDF
			c.save()
			
			# Open the PDF in the default browser/application
			webbrowser.open(f'file:///{temp_filename.replace(os.sep, "/")}')
			
			return {
				"success": True,
				"message": "Barcode PDF generated successfully for 1.5\" x 1\" labels (PLS198)",
				"pdf_path": temp_filename
			}
			
		except Exception as e:
			return {
				"success": False,
				"message": f"Failed to generate barcode PDF: {str(e)}"
			}