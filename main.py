import webview
import os
import sys
import requests
import json
import tempfile
import subprocess
import shutil
import time
from database import DatabaseManager, get_data_path

# Application version
APP_VERSION = "0.6.0"
GITHUB_REPO = "nickrhenderson/Inventory-Management-System"

# Windows-specific import for taskbar icon
try:
	import ctypes
	myappid = 'inventorysystem.app.1.0'  # arbitrary string
	ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except ImportError:
	pass  # Not on Windows or ctypes not available



class InventoryAPI:
	def __init__(self):
		self.db_manager = DatabaseManager(APP_VERSION)
	
	def _success_response(self, message, **kwargs):
		"""Create a standardized success response"""
		response = {"success": True, "message": message}
		response.update(kwargs)
		return response
	
	def _error_response(self, error):
		"""Create a standardized error response"""
		return {"success": False, "message": str(error)}



	def get_products_data(self):
		"""Get all products ordered by date_mixed (newest first)"""
		return self.db_manager.get_products_data()
	
	def get_product_ingredients(self, product_id):
		"""Get all ingredients used in a specific product with their details"""
		return self.db_manager.get_product_ingredients(product_id)
	
	def flag_ingredient(self, ingredient_id):
		"""Flag an ingredient as problematic"""
		return self.db_manager.flag_ingredient(ingredient_id)
	
	def unflag_ingredient(self, ingredient_id):
		"""Remove flag from an ingredient"""
		return self.db_manager.unflag_ingredient(ingredient_id)

	def delete_ingredient(self, ingredient_id):
		"""Delete an ingredient and its associated product relationships"""
		return self.db_manager.delete_ingredient(ingredient_id)

	def delete_product(self, product_id):
		"""Delete a product and its associated ingredient relationships"""
		return self.db_manager.delete_product(product_id)
	
	def get_flagged_ingredients(self):
		"""Get all flagged ingredients"""
		return self.db_manager.get_flagged_ingredients()
	
	def check_product_has_flagged_ingredients(self, product_id):
		"""Check if a product contains any flagged ingredients"""
		return self.db_manager.check_product_has_flagged_ingredients(product_id)
	
	def search_products_by_ingredient_name(self, ingredient_name):
		"""Search for products that contain ingredients matching the given name"""
		return self.db_manager.search_products_by_ingredient_name(ingredient_name)
	
	def search_products_by_ingredient_barcode(self, barcode_id):
		"""Search for products that contain ingredient with specific barcode ID (supports partial matching)"""
		return self.db_manager.search_products_by_ingredient_barcode(barcode_id)
	
	def search_ingredient_by_barcode(self, barcode_id):
		"""Search for a specific ingredient by its barcode ID"""
		return self.db_manager.search_ingredient_by_barcode(barcode_id)
	
	def get_product_by_id(self, product_id):
		"""Get a specific product by its ID"""
		return self.db_manager.get_product_by_id(product_id)
	
	def get_ingredient_by_id(self, ingredient_id):
		"""Get a specific ingredient by its ID"""
		return self.db_manager.get_ingredient_by_id(ingredient_id)
	
	def update_product(self, product_data):
		"""Update an existing product with new ingredient data"""
		return self.db_manager.update_product(product_data)
	
	def adjust_product_amount(self, product_id, delta):
		"""Adjust product amount by the specified delta"""
		return self.db_manager.adjust_product_amount(product_id, delta)

	def update_product_amount(self, product_id, new_amount):
		"""Update product amount to a specific value"""
		return self.db_manager.update_product_amount(product_id, new_amount)

	def update_ingredient(self, ingredient_data):
		"""Update an existing ingredient (barcode cannot be changed)"""
		return self.db_manager.update_ingredient(ingredient_data)
	
	def get_all_ingredients(self):
		"""Get all available ingredients for product creation"""
		return self.db_manager.get_all_ingredients()
	
	def create_product(self, product_data):
		"""Create a new product with ingredients"""
		return self.db_manager.create_product(product_data)
	
	def create_ingredient(self, ingredient_data):
		"""Create a new ingredient with barcode generation"""
		return self.db_manager.create_ingredient(ingredient_data)
	
	def get_inventory_data(self):
		"""Legacy method - now returns products data for compatibility"""
		return self.db_manager.get_products_data()
	
	# Group management methods
	
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

	# Group parameter API wrappers

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

	def get_inventory_events(self, limit=200):
		"""Return inventory events newest-first."""
		return self.db_manager.get_inventory_events(limit)

	def add_inventory_events(self, events, title=None, event_date=None):
		"""Add inventory events with validation (no over-removal)."""
		return self.db_manager.add_inventory_events(events, title, event_date)
	
	def generate_barcode_pdf(self, barcode_id):
		"""Generate a PDF file with a printable barcode optimized for 1.5" x 1" labels (PLS198)"""
		return self.db_manager.generate_barcode_pdf(barcode_id)
	
	def get_app_version(self):
		"""Get the current application version"""
		return self._success_response("Version retrieved", version=APP_VERSION)
	
	def check_for_updates(self):
		"""Check for updates on GitHub releases"""
		try:
			# GitHub API endpoint for latest release (this excludes pre-releases)
			url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
			
			response = requests.get(url, timeout=10)
			
			# If no latest release found (404), try to get all releases and find the latest
			if response.status_code == 404:
				url = f"https://api.github.com/repos/{GITHUB_REPO}/releases"
				response = requests.get(url, timeout=10)
				response.raise_for_status()
				
				releases = response.json()
				if not releases:
					return self._error_response("No releases found in repository")
				
				# Get the most recent release (including pre-releases)
				release_data = releases[0]
			else:
				response.raise_for_status()
				release_data = response.json()
			
			latest_version = release_data.get('tag_name', '').lstrip('v')
			
			# Compare versions
			update_available = self._is_newer_version(latest_version, APP_VERSION)
			
			return self._success_response(
				"Update check completed",
				current_version=APP_VERSION,
				latest_version=latest_version,
				update_available=update_available
			)
			
		except requests.RequestException as e:
			return self._error_response(f"Failed to check for updates: Network error - {str(e)}")
		except json.JSONDecodeError as e:
			return self._error_response(f"Failed to parse update information: {str(e)}")
		except Exception as e:
			return self._error_response(f"Failed to check for updates: {str(e)}")
	
	def _is_newer_version(self, latest, current):
		"""Compare version strings to determine if latest is newer than current"""
		try:
			# Simple version comparison - assumes semantic versioning (x.y.z)
			latest_parts = [int(x) for x in latest.split('.')]
			current_parts = [int(x) for x in current.split('.')]
			
			# Pad shorter version with zeros
			max_len = max(len(latest_parts), len(current_parts))
			latest_parts.extend([0] * (max_len - len(latest_parts)))
			current_parts.extend([0] * (max_len - len(current_parts)))
			
			for latest_part, current_part in zip(latest_parts, current_parts):
				if latest_part > current_part:
					return True
				elif latest_part < current_part:
					return False
			
			return False  # Versions are equal
			
		except (ValueError, AttributeError):
			# If version parsing fails, assume update is available to be safe
			return True
	
	def download_and_install_update(self):
		"""Download latest EXE, spawn a copied updater, then exit to allow replacement."""
		try:
			# Get latest release information
			url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
			response = requests.get(url, timeout=10)
			
			if response.status_code == 404:
				url = f"https://api.github.com/repos/{GITHUB_REPO}/releases"
				response = requests.get(url, timeout=10)
				response.raise_for_status()
				releases = response.json()
				if not releases:
					return self._error_response("No releases found in repository")
				release_data = releases[0]
			else:
				response.raise_for_status()
				release_data = response.json()
			
			# Find the exe asset
			assets = release_data.get('assets', [])
			exe_asset = None
			for asset in assets:
				if asset['name'].endswith('.exe'):
					exe_asset = asset
					break
			
			if not exe_asset:
				return self._error_response("No executable file found in the latest release")
			
			# Get current executable path
			current_exe = sys.executable if getattr(sys, 'frozen', False) else os.path.abspath(sys.argv[0])
			current_dir = os.path.dirname(current_exe)
			current_filename = os.path.basename(current_exe)
			
			# Download the new exe to a temporary location
			download_url = exe_asset['browser_download_url']
			temp_dir = tempfile.mkdtemp()
			temp_exe_path = os.path.join(temp_dir, f"new_{current_filename}")
			
			# Download with progress indication
			with requests.get(download_url, stream=True, timeout=30) as r:
				r.raise_for_status()
				total_size = int(r.headers.get('content-length', 0))
				
				with open(temp_exe_path, 'wb') as f:
					downloaded = 0
					for chunk in r.iter_content(chunk_size=8192):
						if chunk:
							f.write(chunk)
							downloaded += len(chunk)
			
			# Verify the download
			if not os.path.exists(temp_exe_path) or os.path.getsize(temp_exe_path) == 0:
				os.remove(temp_exe_path)
				shutil.rmtree(temp_dir)
				return self._error_response("Download failed - file is empty or corrupted")
			
			# Create updater.exe by copying current exe to a writable data directory
			data_dir = get_data_path()
			updater_path = os.path.join(data_dir, 'Updater.exe')
			try:
				shutil.copy2(current_exe, updater_path)
			except Exception as e:
				return self._error_response(f"Failed to stage updater: {str(e)}")

			# Launch the updater copy in updater mode and exit this process to release lock
			args = [updater_path, "--updater", temp_exe_path, current_exe, "relaunch"]
			subprocess.Popen(args, shell=False, creationflags=subprocess.DETACHED_PROCESS)
			# Give it a moment to start, then exit hard
			time.sleep(0.2)
			os._exit(0)
			
		except requests.RequestException as e:
			return self._error_response(f"Failed to download update: Network error - {str(e)}")
		except Exception as e:
			return self._error_response(f"Failed to install update: {str(e)}")

def get_resource_path(relative_path):
	"""Get absolute path to resource, works for dev and for PyInstaller"""
	try:
		# PyInstaller creates a temp folder and stores path in _MEIPASS
		base_path = sys._MEIPASS
	except Exception:
		base_path = os.path.abspath(".")
	return os.path.join(base_path, relative_path)

def get_data_path():
	"""Get writable data directory for the database"""
	if getattr(sys, 'frozen', False):
		# Running as compiled executable
		# Use user's AppData directory for writable database
		import tempfile
		app_data = os.path.join(os.environ.get('APPDATA', tempfile.gettempdir()), 'InventorySystem')
		os.makedirs(app_data, exist_ok=True)
		return app_data
	else:
		# Running as Python script
		return os.path.join(os.path.dirname(__file__), "data")

def get_html_file_url(html_file_path):
	"""Return the file URL for the HTML file"""
	return f'file:///{html_file_path.replace(os.sep, "/")}'

def main():
	# Initialize API
	api = InventoryAPI()
	
	# Use resource path function to handle both development and compiled versions
	html_file = get_resource_path("index.html")
	
	# Get the HTML file URL
	html_url = get_html_file_url(html_file)
	
	webview.create_window(
		"Bad-Bandit IMS",
		url=html_url,
		width=1200,
		height=720,
		min_size=(1200, 125),
		resizable=True,
		js_api=api
	)
	
	webview.start()

if __name__ == "__main__":
	# If started in updater mode, perform replacement and exit
	if len(sys.argv) >= 5 and sys.argv[1] == "--updater":
		new_exe = sys.argv[2]
		target_exe = sys.argv[3]
		relaunch = (sys.argv[4].lower() == 'relaunch') if len(sys.argv) > 4 else False

		# Retry replacing until the original process releases the file
		for _ in range(30):
			try:
				try:
					os.replace(new_exe, target_exe)
				except OSError:
					shutil.copy2(new_exe, target_exe)
					try:
						os.remove(new_exe)
					except Exception:
						pass
				break
			except PermissionError:
				time.sleep(0.5)
			except Exception:
				time.sleep(0.5)

		if relaunch:
			try:
				subprocess.Popen([target_exe], shell=False)
			except Exception:
				pass
		sys.exit(0)

	# Normal app start
	main()