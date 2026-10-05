"""Google Drive backup API methods exposed to the pywebview front end."""


class BackupApiMixin:
	"""Google Drive backup / restore methods callable from JavaScript."""

	def get_google_drive_status(self):
		"""Return the current Google Drive connection state."""
		return self.google_drive.get_status()

	def connect_google_drive(self):
		"""Link the app to a Google account and store Drive credentials."""
		return self.google_drive.connect()

	def disconnect_google_drive(self):
		"""Remove the stored Google Drive credentials."""
		return self.google_drive.disconnect()

	def backup_database_to_google_drive(self):
		"""Upload a consistent snapshot of the local database to Google Drive."""
		return self.google_drive.backup_database()

	def download_latest_google_drive_backup(self):
		"""Download the latest Google Drive backup and restore it locally."""
		return self.google_drive.download_latest_backup()

	def get_database_revision(self):
		"""Return a marker used to detect committed database changes."""
		return self._success_response("Database revision retrieved", revision=self.db_manager.get_database_revision())
