
import webview
import os
import sys
import time
import webbrowser
import requests
import json
import shutil
import subprocess
from database import DatabaseManager, get_data_path

# Application version
APP_VERSION = "0.3.2"
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
	
	def generate_barcode_pdf(self, barcode_id):
		"""Generate a PDF file with a printable barcode optimized for 1.5" x 1" labels (PLS198)"""
		return self.db_manager.generate_barcode_pdf(barcode_id)
	
	def get_app_version(self):
		"""Get the current application version"""
		return self._success_response("Version retrieved", version=APP_VERSION)
	
	def force_css_refresh(self):
		"""Force CSS refresh by injecting JavaScript to reload stylesheets"""
		try:
			# This will be called from JavaScript to force CSS refresh
			timestamp = str(int(time.time()))
			return self._success_response("CSS refresh initiated", timestamp=timestamp)
		except Exception as e:
			return self._error_response(f"Failed to refresh CSS: {str(e)}")
	
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
			release_url = release_data.get('html_url', '')
			release_notes = release_data.get('body', '')
			published_at = release_data.get('published_at', '')
			is_prerelease = release_data.get('prerelease', False)
			
			# Find the .exe asset
			exe_asset = None
			for asset in release_data.get('assets', []):
				if asset.get('name', '').endswith('.exe'):
					exe_asset = {
						'name': asset.get('name'),
						'download_url': asset.get('browser_download_url'),
						'size': asset.get('size', 0)
					}
					break
			
			# Compare versions
			update_available = self._is_newer_version(latest_version, APP_VERSION)
			
			return self._success_response(
				"Update check completed",
				current_version=APP_VERSION,
				latest_version=latest_version,
				update_available=update_available,
				release_url=release_url,
				release_notes=release_notes,
				published_at=published_at,
				is_prerelease=is_prerelease,
				exe_asset=exe_asset
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
	
	def download_update(self, download_url):
		"""Download the update file"""
		try:
			if not download_url:
				return self._error_response("No download URL provided")
			
			# Create downloads directory
			downloads_dir = os.path.join(get_data_path(), "downloads")
			os.makedirs(downloads_dir, exist_ok=True)
			
			# Get filename from URL
			filename = download_url.split('/')[-1]
			if not filename.endswith('.exe'):
				filename = "InventorySystem_Update.exe"
			
			file_path = os.path.join(downloads_dir, filename)
			
			# Download the file
			response = requests.get(download_url, stream=True, timeout=30)
			response.raise_for_status()
			
			total_size = int(response.headers.get('content-length', 0))
			downloaded = 0
			
			with open(file_path, 'wb') as f:
				for chunk in response.iter_content(chunk_size=8192):
					if chunk:
						f.write(chunk)
						downloaded += len(chunk)
			
			return self._success_response(
				"Update downloaded successfully",
				file_path=file_path,
				file_size=downloaded,
				filename=filename
			)
			
		except requests.RequestException as e:
			return self._error_response(f"Failed to download update: Network error - {str(e)}")
		except Exception as e:
			return self._error_response(f"Failed to download update: {str(e)}")
	
	def install_update(self, file_path):
		"""Install the downloaded update"""
		try:
			if not os.path.exists(file_path):
				return self._error_response("Update file not found")
			
			# Get current executable path
			if getattr(sys, 'frozen', False):
				current_exe = sys.executable
			else:
				return self._error_response("Cannot update - not running as executable")
			
			# Create batch script for updating
			batch_script = os.path.join(get_data_path(), "update.bat")
			
			with open(batch_script, 'w') as f:
				f.write(f'''@echo off
echo Installing update...
timeout /t 2 /nobreak > nul
taskkill /f /im "{os.path.basename(current_exe)}" > nul 2>&1
timeout /t 2 /nobreak > nul
copy /y "{file_path}" "{current_exe}"
if %errorlevel% equ 0 (
    echo Update installed successfully!
    del "{file_path}" > nul 2>&1
    echo Clearing application cache...
    timeout /t 1 /nobreak > nul
    echo Restarting application with fresh cache...
    start "" "{current_exe}" --clear-cache --force-reload
    del "{batch_script}" > nul 2>&1
) else (
    echo Update failed!
    echo Press any key to continue...
    pause > nul
)
''')
			
			# Start the update process and immediately initiate shutdown
			subprocess.Popen(['cmd', '/c', batch_script], creationflags=subprocess.CREATE_NO_WINDOW)
			
			# Schedule application exit after a brief delay to allow the response to be sent
			import threading
			def delayed_exit():
				time.sleep(1)  # Give time for the response to be sent
				os._exit(0)  # Force exit without cleanup (batch script will restart)
			
			threading.Thread(target=delayed_exit, daemon=True).start()
			
			return self._success_response(
				"Update installed - application restarting with fresh cache",
				restart_required=True
			)
			
		except Exception as e:
			return self._error_response(f"Failed to install update: {str(e)}")
	
	def open_release_page(self, release_url):
		"""Open the GitHub release page in the browser"""
		try:
			webbrowser.open(release_url)
			return self._success_response("Release page opened in browser")
		except Exception as e:
			return self._error_response(f"Failed to open release page: {str(e)}")
	
	def force_refresh_cache(self):
		"""Force refresh the application cache (restarts the app)"""
		try:
			if getattr(sys, 'frozen', False):
				current_exe = sys.executable
				
				# Create batch script for restarting with cache clear
				batch_script = os.path.join(get_data_path(), "refresh.bat")
				
				with open(batch_script, 'w') as f:
					f.write(f'''@echo off
echo Refreshing application cache...
timeout /t 1 /nobreak > nul
taskkill /f /im "{os.path.basename(current_exe)}" > nul 2>&1
timeout /t 1 /nobreak > nul
start "" "{current_exe}" --clear-cache --force-reload
del "{batch_script}" > nul 2>&1
''')
				
				# Start the refresh process
				subprocess.Popen(['cmd', '/c', batch_script], creationflags=subprocess.CREATE_NO_WINDOW)
				
				# Schedule application exit
				import threading
				def delayed_exit():
					time.sleep(1)
					os._exit(0)
				
				threading.Thread(target=delayed_exit, daemon=True).start()
				
				return self._success_response("Refreshing application cache - restarting...")
			else:
				return self._error_response("Cache refresh only available in compiled version")
				
		except Exception as e:
			return self._error_response(f"Failed to refresh cache: {str(e)}")

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
	
	# Check for cache clearing flags (used after updates)
	clear_cache = "--clear-cache" in sys.argv
	force_reload = "--force-reload" in sys.argv
	
	# Get the HTML file URL with cache clearing parameter if needed
	html_url = get_html_file_url(html_file)
	if clear_cache or force_reload:
		html_url += "?clear-cache=true"
	
	webview.create_window(
		"Bad-Bandit IMS",
		url=html_url,
		width=1200,
		height=720,
		min_size=(1200, 125),
		resizable=True,
		js_api=api
	)
	
	# Use configuration to control caching
	webview_config = {
		'debug': False
	}
	
	# Use private mode when cache clearing is requested
	if clear_cache or force_reload:
		webview_config['private_mode'] = True
		if force_reload:
			print("Starting with forced resource reload after update")
		else:
			print("Starting with cache clearing enabled")
	
	webview.start(**webview_config)

if __name__ == "__main__":
	main()