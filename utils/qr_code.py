"""QR code generation backed by the third-party ``qrcode`` library.

The :func:`encode_qr` and :func:`qr_matrix_to_svg` functions wrap ``qrcode``
so callers keep a stable, simple API. The matrix produced by :func:`encode_qr`
excludes the quiet-zone border, which is added at render time by
:func:`qr_matrix_to_svg`.
"""

import qrcode

# Map our public error-correction level names to the qrcode library constants.
_ERROR_CORRECTION_MAP = {
    "L": qrcode.constants.ERROR_CORRECT_L,
    "M": qrcode.constants.ERROR_CORRECT_M,
    "Q": qrcode.constants.ERROR_CORRECT_Q,
    "H": qrcode.constants.ERROR_CORRECT_H,
}


def encode_qr(text, ecl="M", min_version=1, max_version=10):
    """Encode ``text`` as a QR code matrix.

    Returns a list of rows; each row is a list of booleans (True = dark
    module). The matrix is a square whose side length is chosen automatically
    to fit the payload (without a quiet-zone border, which is added at render
    time).
    """
    if not isinstance(text, str):
        text = str(text)

    error_correction = _ERROR_CORRECTION_MAP.get(
        ecl, qrcode.constants.ERROR_CORRECT_M
    )

    qr = qrcode.QRCode(
        version=None,  # auto-select the smallest version that fits
        error_correction=error_correction,
        box_size=1,
        border=0,  # quiet zone handled by qr_matrix_to_svg
    )
    qr.add_data(text)
    qr.make(fit=True)

    return [[bool(v) for v in row] for row in qr.get_matrix()]


def qr_matrix_to_svg(matrix, cell_size=8, margin=4):
    """Render a QR matrix (from :func:`encode_qr`) as an SVG string."""
    size = len(matrix)
    dimension = (size + margin * 2) * cell_size
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{dimension}" height="{dimension}" '
             f'viewBox="0 0 {dimension} {dimension}" shape-rendering="crispEdges">',
             f'<rect width="100%" height="100%" fill="#ffffff"/>']
    for y, row in enumerate(matrix):
        for x, dark in enumerate(row):
            if dark:
                parts.append(
                    f'<rect x="{(x + margin) * cell_size}" y="{(y + margin) * cell_size}" '
                    f'width="{cell_size}" height="{cell_size}" fill="#111111"/>'
                )
    parts.append('</svg>')
    return "".join(parts)
