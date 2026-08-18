import json
import os
import tempfile


DEFAULT_SETTINGS = {
	"google_drive_auto_backup": False,
	"theme": "light",
}


class SettingsManager:
	"""Persist application preferences beside the inventory database."""
	def __init__(self, data_dir):
		self.path = os.path.join(data_dir, "settings.json")
		os.makedirs(data_dir, exist_ok=True)
		if not os.path.exists(self.path):
			self._write(DEFAULT_SETTINGS.copy())
		else:
			self._ensure_defaults()

	def _ensure_defaults(self):
		settings = self._read()
		updated = False
		for key, value in DEFAULT_SETTINGS.items():
			if key not in settings:
				settings[key] = value
				updated = True
		if updated:
			self._write(settings)

	def _read(self):
		try:
			with open(self.path, "r", encoding="utf-8") as settings_file:
				settings = json.load(settings_file)
			return settings if isinstance(settings, dict) else {}
		except (OSError, json.JSONDecodeError):
			return {}

	def _write(self, settings):
		with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=os.path.dirname(self.path), delete=False) as settings_file:
			json.dump(settings, settings_file, indent=2, sort_keys=True)
			settings_file.write("\n")
			temporary_path = settings_file.name
		os.replace(temporary_path, self.path)

	def get(self, key, default=None):
		return self._read().get(key, default)

	def set(self, key, value):
		settings = self._read()
		settings[key] = value
		self._write(settings)

	def remove(self, key):
		settings = self._read()
		if key in settings:
			del settings[key]
			self._write(settings)