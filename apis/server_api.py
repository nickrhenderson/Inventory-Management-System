"""Live phone-server API methods exposed to the pywebview front end."""

import secrets

from utils.qr_code import encode_qr, qr_matrix_to_svg
from services.server_service import get_lan_ip, build_pairing_url


class ServerApiMixin:
	"""Live "Connect Phone" server methods callable from JavaScript."""

	def live_server_status(self):
		"""Return whether the live server is running, plus the LAN URL prefix and IP."""
		ip = get_lan_ip()
		return self._success_response(
			"Live server status retrieved",
			running=self.live_server.is_running(),
			ip=ip,
			port=self.live_server.port,
			url=f"http://{ip}:{self.live_server.port}/"
		)

	def live_server_start(self):
		"""Generate a fresh pairing token and start the local server, returning a QR-ready URL."""
		try:
			token = secrets.token_urlsafe(24)
			self.live_server.start(token)
			return self._success_response(
				"Live server started",
				running=True,
				url=build_pairing_url(token, self.live_server.port),
				token=token,
				ip=get_lan_ip(),
				port=self.live_server.port
			)
		except Exception as e:
			return self._error_response(f"Failed to start live server: {str(e)}")

	def live_server_qr_svg(self):
		"""Return the current pairing QR code as an SVG string (or null if not running)."""
		token = self.live_server.token_store.get_token()
		if not self.live_server.is_running() or not token:
			return self._success_response("Live server is not running", svg=None, url=None)
		url = build_pairing_url(token, self.live_server.port)
		try:
			matrix = encode_qr(url, ecl="M")
			# Large quiet zone (margin) and sizable modules make the code easy
			# for a phone camera to lock onto even when displayed on screen.
			return self._success_response(
				"QR code generated",
				svg=qr_matrix_to_svg(matrix, cell_size=10, margin=5),
				url=url, token=token
			)
		except Exception as e:
			return self._error_response(f"Failed to generate QR code: {str(e)}")

	def live_server_stop(self):
		"""Stop the live server (if running) and invalidate the pairing token."""
		self.live_server.stop()
		return self._success_response("Live server stopped", running=False)
