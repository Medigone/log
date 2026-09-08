import json
import unittest
from pathlib import Path

from PIL import Image

APP_ROOT = Path(__file__).resolve().parents[1]
PWA_DIR = APP_ROOT / "public" / "pwa"


class TestPwaIcons(unittest.TestCase):
	def test_icons_use_modern_pharma_mark_not_intrapro(self):
		specs = {
			"icon-192.png": (192, 192, "RGBA"),
			"icon-512.png": (512, 512, "RGBA"),
			"icon-192-maskable.png": (192, 192, "RGBA"),
			"icon-512-maskable.png": (512, 512, "RGBA"),
			"apple-touch-icon.png": (180, 180, "RGB"),
		}
		for name, (width, height, mode) in specs.items():
			path = PWA_DIR / name
			image = Image.open(path)
			self.assertEqual(image.size, (width, height), name)
			self.assertEqual(image.mode, mode, name)
			extrema = image.convert("RGBA").getextrema()
			# Ancien picto IntraPro : min RGB ~ (35, 31, 32). Le monogramme MP est noir sur blanc.
			self.assertEqual(extrema[0][0], 0, name)
			self.assertEqual(extrema[0][1], 255, name)
			self.assertEqual(extrema[1][0], 0, name)
			self.assertEqual(extrema[1][1], 255, name)

	def test_manifest_icons_are_cache_busted(self):
		manifest = json.loads((PWA_DIR / "manifest.webmanifest").read_text())
		self.assertEqual(manifest["name"], "Modern Pharma")
		srcs = [icon["src"] for icon in manifest["icons"]]
		self.assertTrue(srcs)
		for src in srcs:
			self.assertTrue(src.startswith("/assets/log/pwa/"))
			self.assertIn("v=2", src)

		html = (APP_ROOT / "www" / "client.html").read_text()
		self.assertIn("/assets/log/pwa/manifest.webmanifest?v=2", html)
		self.assertIn("/assets/log/pwa/apple-touch-icon.png?v=2", html)
