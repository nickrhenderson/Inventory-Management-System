"""Local live server that lets a phone on the same LAN adjust inventory.

The server is started on demand from the desktop app ("Connect Phone" menu
item). It binds to 0.0.0.0 so any device on the LAN can reach it, and the
pairing QR code embeds a random, single-use token. Every write request must
carry that token - anyone on the LAN without it gets rejected.

The mobile page mirrors the desktop Product tab: each product name shows its
combined on-hand total with +/- steppers and a numeric input. Changes call
the JSON API below, which writes straight into the same SQLite database the
desktop app uses (via the shared DatabaseManager), so the desktop UI picks
the change up on its next refresh.
"""

import html
import ipaddress
import json
import os
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# --------------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------------
DEFAULT_PORT = 8765
WRITE_PATHS = {"/api/products/set", "/api/products/adjust", "/api/products/image"}
MAX_TOKEN_AGE_SECONDS = 60 * 60 * 8  # 8 hours


# --------------------------------------------------------------------------
# Thread-safe token store
# --------------------------------------------------------------------------
class TokenStore:
    """Holds the current pairing token with a small amount of state."""

    def __init__(self):
        self._lock = threading.Lock()
        self._token = None

    def set_token(self, token):
        with self._lock:
            self._token = token

    def get_token(self):
        with self._lock:
            return self._token

    def clear(self):
        with self._lock:
            self._token = None


# --------------------------------------------------------------------------
# Mobile HTML (renders the desktop Product tab's left box as the page)
# --------------------------------------------------------------------------
MOBILE_CSS = """
* { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  /* Mirrors the desktop app's theme variables */
  --color-primary: #007acc;
  --color-success: #28a745;
  --color-danger: #dc3545;
  --color-light: #f8f9fa;
  --color-lighter: #e9ecef;
  --color-dark: #0a0c10;
  --color-white: #fff;
  --color-gray: #6c757d;
  --border-gray: #bbb;
  --border-light-gray: #ddd;
  --border-table: #eee;
  --text-primary: #333;
  --text-gray: var(--color-gray);
  --shadow-medium: rgba(0, 0, 0, 0.15);
  --loading-accent: var(--color-primary);
  --font-size-sm: 0.9em;
  --font-size-13px: 13px;
  --border-radius-sm: 4px;
  --border-radius-md: 6px;
  --spacing-xs: 4px;
}
html[data-theme="dark"] {
  --color-primary: #66b3ff;
  --color-light: #0f1115;
  --color-lighter: #141821;
  --color-dark: #0a0c10;
  --color-white: #0f1218;
  --color-gray: #aab6c9;
  --border-gray: #2a3242;
  --border-light-gray: #2a3242;
  --border-table: #262e3d;
  --text-primary: #e7eef9;
  --text-gray: #aab6c9;
  --shadow-medium: rgba(0, 0, 0, 0.35);
  --loading-accent: #66b3ff;
}
html, body { height: 100%; }
body {
  font-family: Arial, sans-serif;
  background: var(--color-white);
  color: var(--text-primary);
  -webkit-tap-highlight-color: transparent;
  overflow: hidden;
  /* Desktop .box.left: subtle shadow, 12px radius except top-left corner */
  border: none;
  border-radius: 12px;
  border-top-left-radius: 0;
  box-shadow: 0 2px 12px var(--shadow-medium);
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 200px;
}

/* Desktop .products-container */
.products-container {
  padding: 0;
  height: 100%;
  width: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* Desktop #productsList */
#productList {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0;
  box-sizing: border-box;
}

/* Desktop .product-list / .product-card */
.product-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  padding: 0 0 24px;
  box-sizing: border-box;
}
.product-card {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-items: center;
  gap: 12px 20px;
  width: 100%;
  min-height: 112px;
  padding: 16px;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
  border-radius: 0 8px 8px 0;
  background: var(--color-light);
}
.product-card::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 4px;
  border-radius: 8px 0 0 8px;
  background: var(--loading-accent);
}
.product-image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 80px;
  border: 1px solid var(--border-light-gray);
  border-radius: 8px;
  background: var(--color-lighter);
  color: var(--text-gray);
  font-size: var(--font-size-sm);
  font-weight: 600;
  position: relative;
  overflow: hidden;
  cursor: pointer;
  background-size: cover;
  background-position: center;
  touch-action: manipulation;
}
.product-image-placeholder img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.product-image-placeholder .image-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}
.product-image-placeholder .image-overlay svg {
  width: 22px;
  height: 22px;
  fill: #fff;
}
.product-image-placeholder:hover .image-overlay,
.product-image-placeholder:active .image-overlay {
  opacity: 1;
}
.product-card-name {
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 1.3em;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.product-amount-controls {
  grid-column: 1 / -1;
  grid-row: 2;
  min-width: 0;
}
.amount-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}
.amount-button {
  background: transparent;
  border: none;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  padding: 0;
  margin: 0;
  border-radius: var(--border-radius-sm);
  touch-action: manipulation;
}
.amount-button:hover:not(:disabled) {
  transform: scale(1.1);
  background: rgba(0, 0, 0, 0.05);
}
.amount-button:active:not(:disabled) { transform: scale(0.95); }
.amount-button:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }
.amount-button .amount-icon { display: inline-flex; }
.amount-button .amount-icon svg {
  width: 20px;
  height: 20px;
  stroke: var(--text-primary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
  opacity: 0.6;
  transition: opacity 0.2s ease;
}
.amount-button:hover:not(:disabled) .amount-icon svg { opacity: 1; }
.amount-input {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  text-align: center;
  font-weight: bold;
  font-size: 1.1em;
  color: var(--text-primary);
  border: 1px solid var(--border-light-gray);
  border-radius: var(--border-radius-sm);
  padding: var(--spacing-sm);
  background: var(--color-white);
  outline: none;
  transition: all 0.2s ease;
  appearance: textfield;
  -moz-appearance: textfield;
}
.amount-input::-webkit-outer-spin-button,
.amount-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.amount-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}
.empty { text-align: center; color: var(--text-gray); padding: 48px 20px; }
.empty h2 { margin-bottom: 6px; color: var(--text-primary); }

/* Floating status toast (replaces the old header/footer feedback) */
#statusStrip {
  display: none;
  position: fixed;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
}
#statusStrip.ok { display: block; background: var(--color-success); color: #fff; }
#statusStrip.err { display: block; background: var(--color-danger); color: #fff; }
#statusStrip.info { display: block; background: var(--color-primary); color: #fff; }

/* Floating batched-edit confirm bar (bottom center) */
.confirm-bar {
  position: fixed;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px 10px 20px;
  background: var(--color-white);
  border: 1px solid var(--border-gray);
  border-radius: 12px;
  box-shadow: 0 4px 16px var(--shadow-medium);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  max-width: calc(100vw - 32px);
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.confirm-bar[hidden] {
  display: none;
}
.confirm-bar-count {
  color: var(--text-gray);
  font-weight: 600;
  white-space: nowrap;
}
.confirm-bar-actions {
  display: flex;
  gap: 8px;
}
.confirm-button {
  border: none;
  border-radius: 8px;
  padding: 9px 18px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
}
.confirm-button.apply {
  background: var(--color-success);
  color: #fff;
}
.confirm-button.apply:active {
  transform: scale(0.97);
}
.confirm-button.cancel {
  background: transparent;
  color: var(--text-gray);
  border: 1px solid var(--border-gray);
}
.confirm-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Event memo prompt modal (phone) */
.memo-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  padding: 16px;
  box-sizing: border-box;
}
.memo-modal-backdrop.open {
  display: flex;
}
.memo-modal {
  width: 100%;
  max-width: 360px;
  background: var(--color-white);
  border: 1px solid var(--border-gray);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 6px 24px var(--shadow-medium);
  box-sizing: border-box;
}
.memo-modal h3 {
  margin: 0 0 6px 0;
  color: var(--text-primary);
  font-size: 1.15em;
}
.memo-modal-hint {
  margin: 0 0 14px 0;
  color: var(--text-gray);
  font-size: 13px;
  line-height: 1.45;
}
.memo-modal textarea {
  width: 100%;
  min-height: 72px;
  padding: 10px 12px;
  border: 1px solid var(--border-gray);
  border-radius: 8px;
  font-size: 15px;
  font-family: inherit;
  box-sizing: border-box;
  resize: vertical;
  background: var(--color-white);
  color: var(--text-primary);
}
.memo-modal textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}
.memo-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
.memo-modal-button {
  border: none;
  border-radius: 8px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
}
.memo-modal-button.cancel {
  background: transparent;
  color: var(--text-gray);
  border: 1px solid var(--border-gray);
}
.memo-modal-button.apply {
  background: var(--color-success);
  color: #fff;
}
.memo-modal-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Desktop small-viewport tweak (640px media query) */
@media (max-width: 640px) {
  body { padding: 20px 16px; }
  .product-card {
    gap: 10px 14px;
    min-height: 0;
  }
  .product-image-placeholder {
    width: 64px;
    height: 64px;
  }
  .product-card-name {
    font-size: 1.2em;
  }
}"""

MOBILE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Inventory - Live</title>
<style>{css}</style>
<script>
  // Apply the desktop app's saved theme before first paint so there's no flash
  (function () {
    var theme = '{theme}';
    if (theme !== 'dark' && theme !== 'light') theme = 'light';
    document.documentElement.dataset.theme = theme;
  })();
</script>
</head>
<body>
<section class="products-container" aria-label="Products view">
  <div id="productList"></div>
  <div id="statusStrip"></div>
</section>
<!-- Floating batched-edit confirm bar -->
<div id="confirmBar" class="confirm-bar" hidden>
  <span class="confirm-bar-count"></span>
  <div class="confirm-bar-actions">
    <button type="button" id="confirmCancel" class="confirm-button cancel">Cancel</button>
    <button type="button" id="confirmApply" class="confirm-button apply">Confirm</button>
  </div>
</div>
<!-- Event memo prompt (shown when confirming a batch) -->
<div id="memoModalBackdrop" class="memo-modal-backdrop">
  <div class="memo-modal" role="dialog" aria-modal="true" aria-labelledby="memoModalTitle">
    <h3 id="memoModalTitle">Event Memo</h3>
    <p class="memo-modal-hint">Add a memo to record what this manual adjustment was for. It is attached to each changed product.</p>
    <textarea id="memoInput" rows="3" placeholder="e.g. 'Restocking for weekend market'"></textarea>
    <div class="memo-modal-actions">
      <button type="button" id="memoCancel" class="memo-modal-button cancel">Cancel</button>
      <button type="button" id="memoApply" class="memo-modal-button apply">Confirm Changes</button>
    </div>
  </div>
</div>
<script>
(function () {
  var params = new URLSearchParams(window.location.search);
  var token = params.get('token') || '';

  var list = document.getElementById('productList');
  var strip = document.getElementById('statusStrip');

  // Bumped whenever an image changes so the browser reloads it (avoids showing
  // a cached old photo after an upload).
  var imageVersion = Date.now();

  // --- Batched edits -------------------------------------------------------
  // Holds uncommitted amount changes: { product_name: newValue }.
  var pendingChanges = {};
  // Holds the max allowed amount per product (units_created) for validation.
  var pendingMax = {};
  var confirmBar = document.getElementById('confirmBar');
  var confirmCount = confirmBar.querySelector('.confirm-bar-count');
  var confirmApplyBtn = document.getElementById('confirmApply');
  var confirmCancelBtn = document.getElementById('confirmCancel');

  // Event memo prompt modal.
  var memoModalBackdrop = document.getElementById('memoModalBackdrop');
  var memoInput = document.getElementById('memoInput');
  var memoCancelBtn = document.getElementById('memoCancel');
  var memoApplyBtn = document.getElementById('memoApply');

  function openMemoModal() {
    memoInput.value = '';
    memoModalBackdrop.classList.add('open');
    memoApplyBtn.disabled = false;
    memoCancelBtn.disabled = false;
    setTimeout(function () { memoInput.focus(); }, 60);
  }

  function closeMemoModal() {
    memoModalBackdrop.classList.remove('open');
  }

  function refreshConfirmBar() {
    var keys = Object.keys(pendingChanges);
    confirmBar.hidden = keys.length === 0;
    if (keys.length === 1) {
      confirmCount.textContent = '1 change';
    } else {
      confirmCount.textContent = keys.length + ' changes';
    }
  }

  function showStatus(type, msg) {
    strip.className = type;
    strip.textContent = msg;
  }

  function clearStatus() {
    strip.className = '';
    strip.textContent = '';
  }

  function fetchJson(url, options) {
    var headers = options && options.headers ? options.headers : {};
    headers['X-Auth-Token'] = token;
    return fetch(url, Object.assign({}, options, { headers: headers }))
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok || body.success === false) {
            var err = new Error(body.error || body.message || ('Request failed (' + res.status + ')'));
            err.status = res.status;
            throw err;
          }
          return body;
        });
      });
  }

  // Downscale a data-URL image onto a canvas so the base64 payload sent to the
  // server stays small. iPhone camera shots can be several MB; shrinking helps
  // them upload reliably over the LAN. Falls back to the original data URL if
  // the browser can't draw it (e.g. an unsupported image type).
  function downscaleImage(dataUrl, done) {
    var img = new Image();
    img.onload = function () {
      try {
        var MAX = 1200; // longest edge in px
        var scale = Math.min(1, MAX / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        // JPEG at 0.82 quality: good detail with a much smaller payload.
        done(canvas.toDataURL('image/jpeg', 0.82));
      } catch (e) {
        done(dataUrl); // fall back to the original
      }
    };
    img.onerror = function () {
      done(dataUrl); // can't decode locally -> use the original
    };
    img.src = dataUrl;
  }

  function renderProducts(products) {
    if (!products.length) {
      list.innerHTML = '<div class="empty"><h2>No Products</h2><p>Create a batch on the desktop app to see it here.</p></div>';
      return;
    }
    list.innerHTML = '<div class="product-list"></div>';
    var productList = list.querySelector('.product-list');
    products.forEach(function (product) {
      var card = document.createElement('article');
      card.className = 'product-card';
      card.dataset.name = product.product_name;

      var image = document.createElement('div');
      image.className = 'product-image-placeholder';
      image.setAttribute('aria-label', 'Tap to set product image for ' + product.product_name);
      image.setAttribute('role', 'button');
      image.setAttribute('tabindex', '0');

      // If a stored image exists, show it via the /img/ route.
      if (product.image_path) {
        var img = document.createElement('img');
        img.src = '/img/' + encodeURIComponent(product.image_path) + '?token=' + encodeURIComponent(token) + '&v=' + imageVersion;
        img.alt = '';
        image.appendChild(img);
      } else {
        image.textContent = 'IMG';
      }

      // Hover / tap overlay with the edit (pencil) icon.
      var overlay = document.createElement('div');
      overlay.className = 'image-overlay';
      overlay.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="m3.99 16.854-1.314 3.504a.75.75 0 0 0 .966.965l3.503-1.314a3 3 0 0 0 1.068-.687L18.36 9.175s-.354-1.061-1.414-2.122c-1.06-1.06-2.122-1.414-2.122-1.414L4.677 15.786a3 3 0 0 0-.687 1.068zm12.249-12.63 1.383-1.383c.248-.248.579-.406.925-.348.487.08 1.232.322 1.934 1.025.703.703.945 1.447 1.025 1.934.058.346-.1.677-.348.925L19.774 7.76s-.353-1.06-1.414-2.12c-1.06-1.062-2.121-1.415-2.121-1.415z"/></svg>';
      image.appendChild(overlay);

      // Hidden file input to choose/take a photo.
      var fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.display = 'none';
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        // iOS camera shots are often huge (multi-MB). Read + downscale on a
        // canvas before uploading so the base64 JSON body stays small and
        // reliably reaches the server. Photographed VS library images both
        // go through the same path here.
        var reader = new FileReader();
        reader.onload = function () {
          downscaleImage(reader.result, function (smallDataUrl) {
            uploadProductImage(product.product_name, smallDataUrl);
          });
        };
        reader.onerror = function () {
          showStatus('err', 'Could not read the photo. Try choosing one from your library.');
          setTimeout(clearStatus, 3000);
        };
        reader.readAsDataURL(file);
        // Reset on a timeout so iOS doesn't drop the freshly-captured photo.
        setTimeout(function () { fileInput.value = ''; }, 100);
      });
      image.appendChild(fileInput);

      image.addEventListener('click', function () {
        fileInput.click();
      });
      image.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileInput.click();
        }
      });

      var name = document.createElement('div');
      name.className = 'product-card-name';
      name.textContent = product.product_name;
      name.title = product.product_name;

      var controls = document.createElement('div');
      controls.className = 'amount-controls product-amount-controls';

      var minus = document.createElement('button');
      minus.type = 'button';
      minus.className = 'amount-button minus';
      minus.setAttribute('aria-label', 'Decrease ' + product.product_name);
      minus.innerHTML = '<div class="amount-icon"><svg viewBox="0 0 24 24"><path d="M6 12L18 12"/></svg></div>';

      var input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      // Reflect any pending (unconfirmed) edit for this product so a polling
      // re-render doesn't wipe the user's in-progress changes.
      input.value = (product.product_name in pendingChanges) ? pendingChanges[product.product_name] : product.amount_on_hand;
      input.className = 'amount-input';
      input.setAttribute('aria-label', 'Amount on hand for ' + product.product_name);

      var plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'amount-button plus';
      plus.setAttribute('aria-label', 'Increase ' + product.product_name);
      plus.innerHTML = '<div class="amount-icon"><svg viewBox="0 0 24 24"><path d="M6 12H18M12 6V18"/></svg></div>';

      controls.appendChild(minus);
      controls.appendChild(input);
      controls.appendChild(plus);
      card.appendChild(image);
      card.appendChild(name);
      card.appendChild(controls);
      productList.appendChild(card);

      // Batched edit: changes are collected locally and submitted together when
      // the user taps the floating Confirm button.
      function stageAmountChange(nextValue) {
        nextValue = Math.max(0, Math.round(Number(nextValue) || 0));
        var maximum = Number(product.units_created) || 0;
        if (nextValue > maximum) {
          showStatus('err', 'Cannot exceed ' + maximum + ' units created');
          input.value = pendingChanges.hasOwnProperty(product.product_name)
            ? pendingChanges[product.product_name]
            : product.amount_on_hand;
          setTimeout(clearStatus, 2500);
          return;
        }
        var base = product.amount_on_hand;
        if (nextValue === base) {
          // Reverting to the server value -> drop any pending edit for it.
          delete pendingChanges[product.product_name];
          delete pendingMax[product.product_name];
        } else {
          pendingChanges[product.product_name] = nextValue;
          pendingMax[product.product_name] = maximum;
        }
        input.value = nextValue;
        refreshConfirmBar();
      }

      minus.addEventListener('click', function () {
        stageAmountChange(Number(input.value) - 1);
      });
      plus.addEventListener('click', function () {
        stageAmountChange(Number(input.value) + 1);
      });
      input.addEventListener('change', function () {
        stageAmountChange(input.value);
      });
    });
  }

  // Confirming the batched edits first asks for an event memo so the
  // adjustment is coded as discrete events (one per changed product) carrying
  // that memo instead of all being lumped into the same title/memo.
  function applyPendingChanges() {
    var keys = Object.keys(pendingChanges);
    if (!keys.length) return Promise.resolve();
    openMemoModal();
  }

  // Actually submit every staged amount change with the given memo attached.
  function submitPendingChanges(memo) {
    var keys = Object.keys(pendingChanges);
    if (!keys.length) return Promise.resolve();

    confirmApplyBtn.disabled = true;
    confirmCancelBtn.disabled = true;
    memoApplyBtn.disabled = true;
    memoCancelBtn.disabled = true;
    showStatus('info', 'Saving ' + keys.length + ' change(s)...');

    // Chain the requests so they apply in order.
    var chain = Promise.resolve();
    keys.forEach(function (name) {
      chain = chain.then(function () {
        return fetchJson('/api/products/set', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_name: name, amount_on_hand: pendingChanges[name], memo: memo })
        });
      });
    });

    return chain
      .then(function () {
        pendingChanges = {};
        pendingMax = {};
        refreshConfirmBar();
        closeMemoModal();
        showStatus('ok', 'Saved');
        setTimeout(clearStatus, 1600);
        loadProducts();
      })
      .catch(function (err) {
        closeMemoModal();
        if (err.status === 403 || err.status === 401) {
          showStatus('err', 'Session expired. Scan the QR code again.');
        } else {
          showStatus('err', err.message || 'Failed to save changes');
          setTimeout(clearStatus, 3000);
        }
        // Keep the pending map so the user can retry after fixing the issue.
        refreshConfirmBar();
      })
      .then(function () {
        confirmApplyBtn.disabled = false;
        confirmCancelBtn.disabled = false;
      });
  }

  function discardPendingChanges() {
    pendingChanges = {};
    pendingMax = {};
    refreshConfirmBar();
    loadProducts(); // re-render to reset the inputs to server values
  }

  confirmApplyBtn.addEventListener('click', applyPendingChanges);
  confirmCancelBtn.addEventListener('click', discardPendingChanges);
  memoCancelBtn.addEventListener('click', closeMemoModal);
  memoApplyBtn.addEventListener('click', function () {
    var memo = (memoInput.value || '').trim();
    submitPendingChanges(memo);
  });

  function uploadProductImage(productName, dataUrl) {
    showStatus('info', 'Uploading image...');
    fetchJson('/api/products/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_name: productName, image: dataUrl })
    })
      .then(function (result) {
        showStatus('ok', 'Image saved');
        setTimeout(clearStatus, 1600);
        if (result && result.image_path) {
          // Force the browser to fetch the fresh image instead of cache.
          imageVersion = Date.now();
        }
        loadProducts();
      })
      .catch(function (err) {
        if (err.status === 403 || err.status === 401) {
          showStatus('err', 'Session expired. Scan the QR code again.');
        } else {
          showStatus('err', err.message || 'Failed to upload image');
          setTimeout(clearStatus, 3000);
        }
      });
  }

  function applyTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') return;
    var current = document.documentElement.dataset.theme;
    if (current !== theme) {
      document.documentElement.dataset.theme = theme;
    }
  }

  function loadProducts() {
    return fetchJson('/api/products')
      .then(function (body) {
        applyTheme(body.theme);
        renderProducts(body.products || []);
      })
      .catch(function (err) {
        if (err.status === 401 || err.status === 403) {
          showStatus('err', 'Invalid or expired pairing. Re-open Connect Phone and scan the new QR code.');
        } else {
          showStatus('err', err.message);
        }
        list.innerHTML = '<div class="empty"><h2>Cannot connect</h2><p>' + err.message + '</p></div>';
      });
  }

  loadProducts();
  setInterval(loadProducts, 10000);
})();
</script>
</body>
</html>
"""


# --------------------------------------------------------------------------
# HTTP handler
# --------------------------------------------------------------------------
class LiveServerHandler(BaseHTTPRequestHandler):
    """Serves the mobile page and a small JSON API, gated by the token."""

    # Silence default logging to keep the console clean
    def log_message(self, fmt, *args):
        pass

    @property
    def token_store(self):
        return self.server.token_store  # assigned in LiveServer

    @property
    def theme(self):
        """Current theme read live from the desktop settings file."""
        provider = getattr(self.server, "theme_provider", None)
        if provider is None:
            return "light"
        theme = provider()
        return theme if theme in ("light", "dark") else "light"

    def _extract_token_from_path(self):
        """Pull the token out of ``?token=...`` when present."""
        if "?" not in self.path:
            return ""
        try:
            from urllib.parse import urlparse, parse_qs
            qs = parse_qs(urlparse(self.path).query)
            return (qs.get("token") or [""])[0]
        except Exception:
            return ""

    def _check_token(self):
        provided = self.headers.get("X-Auth-Token", "") or self._extract_token_from_path()
        expected = self.token_store.get_token()
        if not expected:
            return False
        return provided == expected

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_html(self, body):
        encoded = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return {}

    def _images_dir(self):
        """Return (and create if needed) the writable product-images directory."""
        from database import get_data_path
        images_dir = os.path.join(get_data_path(), "product_images")
        os.makedirs(images_dir, exist_ok=True)
        return images_dir

    def _save_product_image(self, product_name, image_b64):
        """Decode and persist a base64 image for a product, returning the stored filename."""
        import base64
        import re
        if "," in image_b64[:64] and image_b64.startswith("data:"):
            image_b64 = image_b64.split(",", 1)[1]
        raw = base64.b64decode(image_b64)
        if not raw:
            return None, "Could not decode image data"

        ext = ".png"
        if raw[:8] == b"\x89PNG\r\n\x1a\n":
            ext = ".png"
        elif raw[:2] == b"\xff\xd8":
            ext = ".jpg"
        elif raw[:6] in (b"GIF87a", b"GIF89a"):
            ext = ".gif"
        elif raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
            ext = ".webp"

        safe = re.sub(r'[^A-Za-z0-9._-]+', '_', str(product_name)).strip('._') or 'product'
        filename = f"{safe}{ext}"
        images_dir = self._images_dir()
        dest = os.path.join(images_dir, filename)

        # If the file exists but belongs to a different product, add a counter suffix.
        counter = 1
        while os.path.exists(dest) and not self._file_belongs_to_product(filename, product_name):
            filename = f"{safe}_{counter}{ext}"
            dest = os.path.join(images_dir, filename)
            counter += 1

        with open(dest, "wb") as f:
            f.write(raw)

        # Remove any older image for the same product whose filename differs.
        self._remove_old_image(product_name, filename)
        result = self.server.db_manager.set_product_image(product_name, filename)
        if not result.get("success"):
            return None, result.get("message", "Failed to save image")
        return filename, None

    def _file_belongs_to_product(self, filename, product_name):
        try:
            totals = self.server.db_manager.get_product_totals()
            for p in totals:
                if p.get("product_name") == product_name:
                    return p.get("image_path") == filename
            return False
        except Exception:
            return False

    def _remove_old_image(self, product_name, new_filename):
        try:
            totals = self.server.db_manager.get_product_totals()
            old = None
            for p in totals:
                if p.get("product_name") == product_name:
                    old = p.get("image_path")
                    break
            if old and old != new_filename:
                old_path = os.path.join(self._images_dir(), old)
                if os.path.exists(old_path):
                    try:
                        os.remove(old_path)
                    except OSError:
                        pass
        except Exception:
            pass

    def do_GET(self):
        token_ok = self._check_token()
        if self.path == "/" or self.path.startswith("/?"):
            if not token_ok:
                self._send_json(403, {"success": False, "error": "Invalid or missing pairing token"})
                return
            body = MOBILE_HTML.replace("{css}", MOBILE_CSS).replace("{theme}", self.theme)
            self._send_html(body)
            return

        if self.path == "/api/products":
            if not token_ok:
                self._send_json(403, {"success": False, "error": "Invalid or missing pairing token"})
                return
            try:
                products = self.server.db_manager.get_product_totals()
                self._send_json(200, {
                    "success": True,
                    "products": products,
                    "theme": self.theme,  # lets the page live-update its theme
                })
            except Exception as exc:
                self._send_json(500, {"success": False, "error": str(exc)})
            return

        # Serve a stored product image: /img/<filename>
        if self.path.startswith("/img/"):
            if not token_ok:
                self._send_json(403, {"success": False, "error": "Invalid or missing pairing token"})
                return
            filename = os.path.basename(self.path.split("?", 1)[0][len("/img/"):])
            if not filename:
                self._send_json(404, {"success": False, "error": "Not found"})
                return
            images_dir = self._images_dir()
            file_path = os.path.join(images_dir, filename)
            # Prevent path traversal
            if not os.path.normpath(file_path).startswith(os.path.normpath(images_dir)) or not os.path.isfile(file_path):
                self._send_json(404, {"success": False, "error": "Not found"})
                return
            try:
                with open(file_path, "rb") as f:
                    data = f.read()
                content_type = "image/png"
                if filename.lower().endswith(".jpg") or filename.lower().endswith(".jpeg"):
                    content_type = "image/jpeg"
                elif filename.lower().endswith(".gif"):
                    content_type = "image/gif"
                elif filename.lower().endswith(".webp"):
                    content_type = "image/webp"
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(data)
            except OSError as exc:
                self._send_json(500, {"success": False, "error": str(exc)})
            return

        self._send_json(404, {"success": False, "error": "Not found"})

    def do_POST(self):
        if self.path not in WRITE_PATHS:
            self._send_json(404, {"success": False, "error": "Not found"})
            return

        if not self._check_token():
            self._send_json(403, {"success": False, "error": "Invalid or missing pairing token"})
            return

        body = self._read_json_body()

        if self.path == "/api/products/set":
            product_name = body.get("product_name")
            amount = body.get("amount_on_hand")
            memo = body.get("memo")
            if not product_name:
                self._send_json(400, {"success": False, "error": "product_name is required"})
                return
            try:
                result = self.server.db_manager.update_product_total(product_name, int(amount), memo=memo)
            except (TypeError, ValueError):
                self._send_json(400, {"success": False, "error": "amount_on_hand must be a number"})
                return
            if not result.get("success"):
                self._send_json(400, {"success": False, "error": result.get("message", "Update failed")})
                return
            self._send_json(200, {"success": True, "amount_on_hand": result.get("amount_on_hand", int(amount))})
            return

        if self.path == "/api/products/adjust":
            product_name = body.get("product_name")
            delta = body.get("delta")
            memo = body.get("memo")
            if not product_name:
                self._send_json(400, {"success": False, "error": "product_name is required"})
                return
            try:
                delta = int(delta)
            except (TypeError, ValueError):
                self._send_json(400, {"success": False, "error": "delta must be a number"})
                return
            if delta == 0:
                self._send_json(400, {"success": False, "error": "delta cannot be zero"})
                return

            totals = self.server.db_manager.get_product_totals()
            current = next((p for p in totals if p["product_name"] == product_name), None)
            if current is None:
                self._send_json(404, {"success": False, "error": "Product not found"})
                return
            result = self.server.db_manager.update_product_total(
                product_name, int(current["amount_on_hand"]) + delta, memo=memo
            )
            if not result.get("success"):
                self._send_json(400, {"success": False, "error": result.get("message", "Update failed")})
                return
            self._send_json(200, {"success": True, "amount_on_hand": result.get("amount_on_hand")})
            return

        if self.path == "/api/products/image":
            product_name = body.get("product_name")
            image_b64 = body.get("image")
            if not product_name:
                self._send_json(400, {"success": False, "error": "product_name is required"})
                return
            if not image_b64:
                self._send_json(400, {"success": False, "error": "image is required"})
                return
            try:
                filename, err = self._save_product_image(product_name, image_b64)
                if err:
                    self._send_json(400, {"success": False, "error": err})
                    return
                self._send_json(200, {"success": True, "image_path": filename})
            except Exception as exc:
                self._send_json(400, {"success": False, "error": str(exc)})
            return

        self._send_json(405, {"success": False, "error": "Method not allowed"})


# --------------------------------------------------------------------------
# Server wrapper
# --------------------------------------------------------------------------
class LiveServer:
    """Thin wrapper that owns the HTTP thread and the pairing token."""

    def __init__(self, db_manager, port=DEFAULT_PORT, theme_provider=None):
        self.db_manager = db_manager
        self.port = port
        # Optional callable returning the current theme ("light"/"dark") from
        # the desktop settings. Falls back to light when not provided.
        self.theme_provider = theme_provider
        self.token_store = TokenStore()
        self.httpd = None
        self.thread = None
        self._lock = threading.Lock()

    def _make_httpd(self):
        server = ThreadingHTTPServer(("0.0.0.0", self.port), LiveServerHandler)
        server.token_store = self.token_store
        server.db_manager = self.db_manager
        server.theme_provider = self.theme_provider
        server.daemon_threads = True
        return server

    def start(self, token):
        """Bind the socket (if needed) and begin serving on a daemon thread."""
        self.token_store.set_token(token)
        with self._lock:
            if self.httpd is None:
                self.httpd = self._make_httpd()
                self.thread = threading.Thread(
                    target=self.httpd.serve_forever,
                    kwargs={"poll_interval": 0.5},
                    daemon=True,
                    name="inventory-live-server",
                )
                self.thread.start()
        return self

    def stop(self):
        """Shut down the HTTP server and clear the pairing token."""
        with self._lock:
            if self.httpd is not None:
                try:
                    self.httpd.shutdown()
                    self.httpd.server_close()
                except Exception:
                    pass
                self.httpd = None
            self.thread = None
        self.token_store.clear()

    def is_running(self):
        return self.httpd is not None


# --------------------------------------------------------------------------
# Helpers used by the desktop API
# --------------------------------------------------------------------------
def _is_private_lan(ip_str):
    """True if the address belongs to a private LAN range the phone can reach."""
    try:
        addr = ipaddress.ip_address(ip_str)
        return addr.is_private and not addr.is_loopback and not addr.is_link_local
    except ValueError:
        return False


def get_lan_ips():
    """Return a list of this machine's LAN IPv4 addresses, stable ordering.

    The list is ordered from "most likely to be reachable by a phone on the
    same network" to least likely. Private addresses (192.168.x, 10.x,
    172.16-31.x) are listed before public ones, and loopback / link-local
    (169.254.x) addresses are excluded entirely.
    """
    candidates = []

    # 1) The interface used to route to the internet (default gateway). This
    #    is the single most reliable signal for "which NIC is on the LAN".
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(1.0)
        sock.connect(("8.8.8.8", 80))  # no packets sent; picks the route NIC
        default_route_ip = sock.getsockname()[0]
        sock.close()
        if default_route_ip and not default_route_ip.startswith("127."):
            candidates.append(default_route_ip)
    except OSError:
        pass

    # 2) Every IPv4 address bound to this host (catches adapters that don't
    #    carry the default route, e.g. a second NIC on the LAN).
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and ip not in candidates:
                candidates.append(ip)
    except OSError:
        pass

    # 3) Fallback enumeration via getaddrinfo on an empty host (some Windows
    #    configurations return the hostname list above as 127.0.0.1 only).
    try:
        for info in socket.getaddrinfo(None, None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and ip not in candidates:
                candidates.append(ip)
    except OSError:
        pass

    # Order: private LAN first, then other non-loopback addresses. De-dupe
    # while preserving the original order within each bucket.
    private = [c for c in candidates if _is_private_lan(c)]
    other = [c for c in candidates if not _is_private_lan(c)]
    return private + other


def get_lan_ip():
    """Return the most likely LAN IPv4 address of this machine.

    Prefers a private LAN address that a phone on the same network can reach.
    Falls back to the default-route interface, then to loopback as a last
    resort (which will not be reachable from a phone, but avoids a crash).
    """
    ips = get_lan_ips()
    if ips:
        return ips[0]
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(1.0)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except OSError:
        return "127.0.0.1"


def build_pairing_url(token, port=DEFAULT_PORT):
    """Build the URL that the phone will open; also used as the QR payload."""
    ip = get_lan_ip()
    return f"http://{ip}:{port}/?token={token}"