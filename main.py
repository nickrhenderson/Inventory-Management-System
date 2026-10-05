"""Bad-Bandit IMS - application entry point.

This module is intentionally thin: it wires together the collaborators
(database, settings, services) and hands the assembled :class:`InventoryAPI`
to pywebview. All other logic lives in the ``apis/``, ``services/`` and
``database/`` packages.
"""

import os
import sys

import webview

from database import DatabaseManager, get_data_path
from settings import SettingsManager
from services.backup_service import GoogleDriveBackupService
from services.server_service import LiveServer
from services.image_service import ProductImageService
from services.updater_service import perform_update
from apis import InventoryAPI

# Application version
APP_VERSION = "0.9.0"

# Windows-specific import for taskbar icon
try:
	import ctypes
	myappid = 'inventorysystem.app.1.0'  # arbitrary string
	ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except ImportError:
	pass  # Not on Windows or ctypes not available


def create_api():
	"""Build and wire the complete pywebview API surface."""
	db_manager = DatabaseManager(APP_VERSION)
	settings = SettingsManager(get_data_path())
	google_drive = GoogleDriveBackupService(db_manager, get_data_path())
	# Live "Connect Phone" server (started lazily on demand)
	live_server = LiveServer(
		db_manager,
		theme_provider=lambda: settings.get("theme", "light"),
	)
	image_service = ProductImageService(db_manager, get_data_path())

	return InventoryAPI(
		db_manager=db_manager,
		settings=settings,
		google_drive=google_drive,
		live_server=live_server,
		image_service=image_service,
		app_version=APP_VERSION,
	)


def get_resource_path(relative_path):
	"""Get absolute path to resource, works for dev and for PyInstaller"""
	try:
		# PyInstaller creates a temp folder and stores path in _MEIPASS
		base_path = sys._MEIPASS
	except Exception:
		base_path = os.path.abspath(".")
	return os.path.join(base_path, relative_path)


def get_html_file_url(html_file_path):
	"""Return the file URL for the HTML file"""
	return f'file:///{html_file_path.replace(os.sep, "/")}'


def main():
	# Initialize API
	api = create_api()

	# Use resource path function to handle both development and compiled versions
	html_file = get_resource_path(os.path.join("static", "index.html"))

	# Pass the persisted theme into the first document load so its loading screen
	# can use the correct palette before the JavaScript bridge is available.
	theme = api.settings.get("theme")
	theme = theme if theme in ("light", "dark") else "light"
	html_url = f"{get_html_file_url(html_file)}#theme={theme}"

	window = webview.create_window(
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
		perform_update(new_exe, target_exe, relaunch)
		sys.exit(0)

	# Normal app start
	main()
