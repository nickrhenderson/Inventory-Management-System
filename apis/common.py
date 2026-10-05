"""Shared response helpers and any logic common to all API mixins."""


class ResponseMixin:
	"""Standardized success / error response builders for the pywebview API."""

	def _success_response(self, message, **kwargs):
		"""Create a standardized success response"""
		response = {"success": True, "message": message}
		response.update(kwargs)
		return response

	def _error_response(self, error):
		"""Create a standardized error response"""
		return {"success": False, "message": str(error)}
