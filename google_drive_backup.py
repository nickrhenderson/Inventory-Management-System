import json
import io
import os
import sys
from datetime import datetime, timezone

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload
from settings import SettingsManager


SCOPES = ["https://www.googleapis.com/auth/drive.file"]
BACKUP_FOLDER_NAME = "InventorySystem Backups"
BACKUP_PREFIX = "inventory_backup_"
BACKUP_MIME_TYPE = "application/x-sqlite3"
GOOGLE_OAUTH_CONFIG_FILENAME = "google_oauth_client.json"

def _load_google_auth_config(data_dir):
	config_paths = [os.path.join(data_dir, GOOGLE_OAUTH_CONFIG_FILENAME)]
	if getattr(sys, "frozen", False):
		config_paths.append(os.path.join(sys._MEIPASS, GOOGLE_OAUTH_CONFIG_FILENAME))

	for config_path in config_paths:
		try:
			with open(config_path, "r", encoding="utf-8") as config_file:
				config = json.load(config_file)
			installed = config.get("installed", {})
			if installed.get("client_id") and installed.get("client_secret"):
				return config
		except (OSError, json.JSONDecodeError):
			continue

	client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
	client_secret = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET")
	if client_id and client_secret:
		return {
			"installed": {
				"client_id": client_id,
				"client_secret": client_secret,
				"auth_uri": "https://accounts.google.com/o/oauth2/auth",
				"token_uri": "https://oauth2.googleapis.com/token",
				"redirect_uris": ["http://localhost"],
			}
		}
	return None


class GoogleDriveBackupService:
	def __init__(self, database_manager, data_dir):
		self.database_manager = database_manager
		self.data_dir = data_dir
		self.settings = SettingsManager(data_dir)
		self.oauth_config = _load_google_auth_config(data_dir)
		self._migrate_legacy_token()

	def _migrate_legacy_token(self):
		if self.settings.get("google_drive"):
			return

		legacy_token_paths = [
			os.path.join(self.data_dir, "google_drive", "token.json"),
			os.path.join(os.environ.get("APPDATA", ""), "InventorySystem", "google_drive", "token.json"),
		]
		for legacy_token_path in legacy_token_paths:
			if not legacy_token_path or not os.path.exists(legacy_token_path):
				continue
			try:
				with open(legacy_token_path, "r", encoding="utf-8") as token_file:
					self.settings.set("google_drive", {"token": json.load(token_file)})
				os.remove(legacy_token_path)
				try:
					os.rmdir(os.path.dirname(legacy_token_path))
				except OSError:
					pass
				return
			except (OSError, json.JSONDecodeError):
				continue

	def _success_response(self, message, **kwargs):
		response = {"success": True, "message": message}
		response.update(kwargs)
		return response

	def _error_response(self, error):
		return {"success": False, "message": str(error)}

	def _handle_drive_http_error(self, error):
		"""Return a clearer message for common Drive API configuration failures."""
		if isinstance(error, HttpError):
			try:
				payload = error.content.decode("utf-8") if isinstance(error.content, (bytes, bytearray)) else str(error.content)
			except Exception:
				payload = str(error)

			if error.resp is not None and getattr(error.resp, "status", None) == 403 and "accessNotConfigured" in payload:
				return self._error_response(
					"Google Drive API is not enabled for this Google Cloud project. Open the Google Cloud Console for the OAuth project, enable the Google Drive API, wait a few minutes for it to propagate, and try Backup again."
				)
		return self._error_response(error)

	def _load_credentials(self):
		google_drive_settings = self.settings.get("google_drive", {})
		token_data = google_drive_settings.get("token") if isinstance(google_drive_settings, dict) else None
		if not isinstance(token_data, dict):
			return None

		try:
			credentials = Credentials.from_authorized_user_info(token_data, SCOPES)
			if credentials and credentials.expired and credentials.refresh_token:
				credentials.refresh(Request())
				self._save_credentials(credentials)
			return credentials if credentials and credentials.valid else None
		except Exception:
			return None

	def _save_credentials(self, credentials):
		self.settings.set("google_drive", {"token": json.loads(credentials.to_json())})

	def _build_service(self):
		credentials = self._load_credentials()
		if not credentials:
			raise RuntimeError("Google Drive is not connected")
		return build("drive", "v3", credentials=credentials, cache_discovery=False)

	def get_status(self):
		credentials = self._load_credentials()
		client_config_ready = bool(self.oauth_config)
		latest_backup = None
		if credentials:
			try:
				service = self._build_service()
				backup_folder_id = self._get_or_create_backup_folder(service)
				query = (
					f"'{backup_folder_id}' in parents and trashed=false and name contains '{BACKUP_PREFIX}'"
				)
				response = service.files().list(
					q=query,
					spaces="drive",
					fields="files(id, name, createdTime, modifiedTime)",
					orderBy="createdTime desc",
					pageSize=1
				).execute()
				files = response.get("files", [])
				if files:
					latest_file = files[0]
					latest_backup = {
						"file_id": latest_file.get("id"),
						"file_name": latest_file.get("name"),
						"created_time": latest_file.get("createdTime"),
						"modified_time": latest_file.get("modifiedTime"),
					}
			except Exception:
				latest_backup = None
		return self._success_response(
			"Google Drive status retrieved",
			connected=bool(credentials),
			configured=client_config_ready,
			backup_folder_name=BACKUP_FOLDER_NAME,
			backup_prefix=BACKUP_PREFIX,
			latest_backup=latest_backup
		)

	def connect(self):
		try:
			if not self.oauth_config:
				return self._error_response(
					f"Google OAuth is not configured. Save {GOOGLE_OAUTH_CONFIG_FILENAME} beside inventory.db and try again."
				)

			flow = InstalledAppFlow.from_client_config(self.oauth_config, SCOPES)
			credentials = flow.run_local_server(port=0, access_type="offline", prompt="consent")
			self._save_credentials(credentials)
			return self._success_response("Google Drive connected successfully", connected=True)
		except Exception as e:
			return self._error_response(e)

	def disconnect(self):
		try:
			self.settings.remove("google_drive")
			return self._success_response("Google Drive disconnected", connected=False)
		except Exception as e:
			return self._error_response(e)

	def _get_or_create_backup_folder(self, service):
		query = (
			f"mimeType='application/vnd.google-apps.folder' and name='{BACKUP_FOLDER_NAME}' and trashed=false"
		)
		response = service.files().list(
			q=query,
			spaces="drive",
			fields="files(id, name)",
			pageSize=10
		).execute()
		folders = response.get("files", [])
		if folders:
			return folders[0]["id"]

		folder_metadata = {
			"name": BACKUP_FOLDER_NAME,
			"mimeType": "application/vnd.google-apps.folder",
		}
		folder = service.files().create(body=folder_metadata, fields="id").execute()
		return folder["id"]

	def _generate_backup_name(self):
		return f"{BACKUP_PREFIX}{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.db"

	def _get_latest_backup_file(self, service, backup_folder_id):
		query = (
			f"'{backup_folder_id}' in parents and trashed=false and name contains '{BACKUP_PREFIX}'"
		)
		response = service.files().list(
			q=query,
			spaces="drive",
			fields="files(id, name, createdTime, modifiedTime, size)",
			orderBy="createdTime desc",
			pageSize=1
		).execute()
		files = response.get("files", [])
		return files[0] if files else None

	def backup_database(self):
		try:
			service = self._build_service()
			backup_folder_id = self._get_or_create_backup_folder(service)
			snapshot_bytes = self.database_manager.create_database_snapshot_bytes()
			if not snapshot_bytes:
				return self._error_response("Failed to create database snapshot")

			file_name = self._generate_backup_name()

			media = MediaIoBaseUpload(io.BytesIO(snapshot_bytes), mimetype=BACKUP_MIME_TYPE, resumable=False)
			file_metadata = {
				"name": file_name,
				"parents": [backup_folder_id],
				"mimeType": BACKUP_MIME_TYPE,
			}
			latest_file = self._get_latest_backup_file(service, backup_folder_id)
			if latest_file:
				updated_file = service.files().update(
					fileId=latest_file["id"],
					body={"name": file_name, "mimeType": BACKUP_MIME_TYPE},
					media_body=media,
					fields="id, name, createdTime, modifiedTime"
				).execute()
				file_response = updated_file
			else:
				created_file = service.files().create(
					body=file_metadata,
					media_body=media,
					fields="id, name, createdTime"
				).execute()
				file_response = created_file

			return self._success_response(
				"Database backed up to Google Drive",
				file_name=file_response.get("name", file_name),
				file_id=file_response.get("id"),
				created_time=file_response.get("createdTime"),
				modified_time=file_response.get("modifiedTime")
			)
		except Exception as e:
			return self._handle_drive_http_error(e)

	def download_latest_backup(self):
		try:
			service = self._build_service()
			backup_folder_id = self._get_or_create_backup_folder(service)
			query = (
				f"'{backup_folder_id}' in parents and trashed=false and name contains '{BACKUP_PREFIX}'"
			)
			response = service.files().list(
				q=query,
				spaces="drive",
				fields="files(id, name, createdTime, modifiedTime, size)",
				orderBy="createdTime desc",
				pageSize=1
			).execute()
			files = response.get("files", [])
			if not files:
				return self._error_response("No Google Drive database backups were found")

			latest_file = files[0]
			request = service.files().get_media(fileId=latest_file["id"])
			buffer = io.BytesIO()
			downloader = MediaIoBaseDownload(buffer, request)
			done = False
			while not done:
				status, done = downloader.next_chunk()

			restore_result = self.database_manager.restore_database_from_snapshot_bytes(buffer.getvalue())
			if not restore_result.get("success"):
				return restore_result

			return self._success_response(
				"Latest Google Drive backup downloaded and restored",
				file_name=latest_file.get("name"),
				file_id=latest_file.get("id"),
				created_time=latest_file.get("createdTime")
			)
		except Exception as e:
			return self._handle_drive_http_error(e)
