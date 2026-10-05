"""Executable self-update service.

Extract the updater logic that used to sit in main.py's ``__main__`` block into
a small service so the main entry point stays lean. When the app is relaunched
with ``--updater <new_exe> <target_exe> [relaunch]`` it replaces the running
executable (retrying until the old process releases the file) and optionally
relaunches the new one.
"""

import os
import shutil
import subprocess
import time


def perform_update(new_exe, target_exe, relaunch=False):
	"""Replace the running executable with a newly downloaded one.

	Retries until the original process releases the file (the updater runs in a
	separate process while the main app is still shutting down).
	"""
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
