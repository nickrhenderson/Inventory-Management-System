"""Settings / app-info API methods exposed to the pywebview front end.

Note: The current app accesses settings (e.g. the persisted theme) internally
through :class:`settings.SettingsManager` in :class:`InventoryAPI.__init__`;
there are no per-key settings methods exposed to JavaScript yet.

Add future settings-related pywebview methods here (for example theme toggling
or a persisted Google Drive auto-backup toggle) rather than in the monolithic
main module.
"""


class SettingsApiMixin:
	"""Settings-related pywebview methods.

	The existing application reads settings internally via ``self.settings``
	(SettingsManager). Extend this mixin with new settings getters/setters as
	they are added to the front end.
	"""

	def get_app_version(self):
		"""Return the current application version for the UI version button."""
		return self._success_response(
			"App version retrieved", version=self._app_version
		)
