import unittest
from unittest.mock import patch

from log.compat import desk_home_route, desk_path, desk_root, frappe_major_version, home_path


class TestFrappeCompat(unittest.TestCase):
	def test_major_version_parsing(self):
		self.assertEqual(frappe_major_version("15.76.0"), 15)
		self.assertEqual(frappe_major_version("16.0.0-dev"), 16)
		self.assertEqual(frappe_major_version("not-a-version"), 15)

	def test_desk_root_follows_frappe_major(self):
		self.assertEqual(desk_root("15.76.0"), "/app")
		self.assertEqual(desk_root("16.2.1"), "/desk")
		self.assertEqual(desk_home_route("15.76.0"), "app")
		self.assertEqual(desk_home_route("16.0.0"), "desk")

	def test_desk_path_joins_doctype_routes(self):
		self.assertEqual(desk_path("sales-order", "SO-001", version="15.0.0"), "/app/sales-order/SO-001")
		self.assertEqual(desk_path("sales-order", "SO-001", version="16.0.0"), "/desk/sales-order/SO-001")

	def test_home_path_aliases_app_and_desk(self):
		self.assertEqual(home_path("desk", version="15.76.0"), "/app")
		self.assertEqual(home_path("app", version="16.0.0"), "/desk")
		self.assertEqual(home_path("distribution", version="15.0.0"), "/distribution")

	def test_bootinfo_exposes_desk_path(self):
		from log.compat import extend_bootinfo

		boot = {}
		with patch("log.compat.frappe_major_version", return_value=16):
			extend_bootinfo(boot)
		self.assertEqual(boot["desk_path"], "/desk")
