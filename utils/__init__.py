"""Utility modules shared across the application.

These are pure helpers imported by one or more app packages (they do not
depend on the database or services layers):

    - barcode  - BarcodeManager: generate barcode IDs / PDF labels
    - qr_code  - encode QR matrices and render them as SVG

Import with ``from utils.barcode import BarcodeManager`` etc.
"""
