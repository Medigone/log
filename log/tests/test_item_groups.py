import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import frappe

from log.setup.brands import BRANDS, ensure_brands
from log.setup.item_groups import (
	CANONICAL_LEAF_GROUPS,
	DEFAULT_FEATURED_GROUPS,
	ITEM_GROUPS,
	PARENT_NUTRITION,
	PARENT_PARA,
	effective_featured_groups,
	effective_store_groups,
	ensure_item_groups,
)
from log.setup.seed_parapharmacie import ARTICLES
from log.services import portal_merchandising as merchandising


APP_ROOT = Path(__file__).resolve().parents[1]


class TestItemGroupTree(unittest.TestCase):
	def test_parents_are_declared_before_leaves(self):
		self.assertEqual(
			[row["item_group_name"] for row in ITEM_GROUPS[:2]],
			[PARENT_NUTRITION, PARENT_PARA],
		)
		self.assertTrue(ITEM_GROUPS[0]["is_group"])
		self.assertTrue(ITEM_GROUPS[1]["is_group"])
		self.assertIsNone(ITEM_GROUPS[0]["parent_item_group"])
		self.assertIsNone(ITEM_GROUPS[1]["parent_item_group"])
		for row in ITEM_GROUPS[2:]:
			self.assertEqual(row["is_group"], 0)
			self.assertIn(row["parent_item_group"], {PARENT_NUTRITION, PARENT_PARA})

	def test_canonical_lists_are_derived_from_item_groups(self):
		self.assertEqual(
			CANONICAL_LEAF_GROUPS,
			tuple(row["item_group_name"] for row in ITEM_GROUPS if not row["is_group"]),
		)
		self.assertEqual(
			DEFAULT_FEATURED_GROUPS,
			tuple(row["item_group_name"] for row in ITEM_GROUPS if row.get("featured")),
		)
		self.assertTrue(set(DEFAULT_FEATURED_GROUPS).issubset(CANONICAL_LEAF_GROUPS))
		self.assertEqual(
			DEFAULT_FEATURED_GROUPS,
			(
				"Laits infantiles",
				"Compotes & gourdes",
				"Bébé & maman",
				"Visage & dermocosmétique",
				"Protection solaire",
				"Compléments alimentaires",
			),
		)

	def test_no_json_fixtures_for_item_group_or_brand(self):
		fixtures = APP_ROOT / "fixtures"
		self.assertFalse((fixtures / "item_group.json").exists())
		self.assertFalse((fixtures / "brand.json").exists())
		hooks = (APP_ROOT / "hooks.py").read_text(encoding="utf-8")
		self.assertNotIn('"dt": "Item Group"', hooks)
		self.assertNotIn('"dt": "Brand"', hooks)


class TestEnsureItemGroups(unittest.TestCase):
	def test_ensure_creates_missing_groups_under_the_site_root(self):
		created = []
		existing = {"Item Group"}

		def exists(doctype, name=None):
			if name is None:
				return doctype in existing
			return name in existing

		def get_doc(arg, _name=None):
			if not isinstance(arg, dict):
				raise AssertionError(f"unexpected get_doc({arg!r})")
			created.append(arg)
			existing.add(arg["item_group_name"])
			return Mock()

		fake_db = Mock()
		fake_db.exists.side_effect = exists
		with (
			patch("log.setup.item_groups.frappe.db", fake_db),
			patch("log.setup.item_groups.get_root_of", return_value="Tous les Groupes d'Articles"),
			patch("log.setup.item_groups.frappe.get_doc", side_effect=get_doc),
		):
			ensure_item_groups()

		self.assertEqual(created[0]["item_group_name"], PARENT_NUTRITION)
		self.assertEqual(created[0]["parent_item_group"], "Tous les Groupes d'Articles")
		self.assertEqual(created[0]["is_group"], 1)
		self.assertEqual(created[1]["item_group_name"], PARENT_PARA)
		self.assertEqual(created[2]["parent_item_group"], PARENT_NUTRITION)
		self.assertEqual(created[2]["is_group"], 0)
		self.assertEqual(created[-1]["item_group_name"], "Parfums & senteurs")
		self.assertEqual(created[-1]["parent_item_group"], PARENT_PARA)
		self.assertEqual(len(created), len(ITEM_GROUPS))
		self.assertTrue(all(set(row).issubset({"doctype", "item_group_name", "is_group", "parent_item_group"}) for row in created))

	def test_ensure_repairs_parent_and_is_group_only(self):
		doc = Mock(is_group=0, parent_item_group="Wrong", description="enrichi")
		existing = {"Item Group", PARENT_NUTRITION}

		def exists(doctype, name=None):
			if name is None:
				return True
			return name in existing

		def get_doc(arg, name=None):
			if isinstance(arg, dict):
				existing.add(arg["item_group_name"])
				return Mock()
			self.assertEqual(arg, "Item Group")
			self.assertEqual(name, PARENT_NUTRITION)
			return doc

		fake_db = Mock()
		fake_db.exists.side_effect = exists
		with (
			patch("log.setup.item_groups.frappe.db", fake_db),
			patch("log.setup.item_groups.get_root_of", return_value="Tous les Groupes d'Articles"),
			patch("log.setup.item_groups.frappe.get_doc", side_effect=get_doc),
		):
			ensure_item_groups()

		self.assertEqual(doc.is_group, 1)
		self.assertEqual(doc.parent_item_group, "Tous les Groupes d'Articles")
		doc.save.assert_called_once_with(ignore_permissions=True)

	def test_ensure_does_not_save_when_tree_fields_already_match(self):
		saves = []

		def make_doc(name):
			row = next(item for item in ITEM_GROUPS if item["item_group_name"] == name)
			doc = Mock()
			doc.is_group = 1 if row["is_group"] else 0
			doc.parent_item_group = row["parent_item_group"] or "Tous les Groupes d'Articles"
			doc.description = "enrichi"
			doc.save = Mock(side_effect=lambda **_kwargs: saves.append(name))
			return doc

		existing = {"Item Group"} | {row["item_group_name"] for row in ITEM_GROUPS}

		def exists(doctype, name=None):
			if name is None:
				return True
			return name in existing

		def get_doc(arg, name=None):
			if isinstance(arg, dict):
				raise AssertionError("must not insert existing groups")
			return make_doc(name)

		fake_db = Mock()
		fake_db.exists.side_effect = exists
		with (
			patch("log.setup.item_groups.frappe.db", fake_db),
			patch("log.setup.item_groups.get_root_of", return_value="Tous les Groupes d'Articles"),
			patch("log.setup.item_groups.frappe.get_doc", side_effect=get_doc),
		):
			ensure_item_groups()

		self.assertEqual(saves, [])


class TestEnsureBrands(unittest.TestCase):
	def test_brands_are_product_marks_only(self):
		self.assertNotIn("COPIAM", BRANDS)
		self.assertNotIn("SAFFEC", BRANDS)
		self.assertIn("COTIFLEX", BRANDS)
		self.assertIn("BIOMIL", BRANDS)

	def test_ensure_creates_missing_brands_only(self):
		created = []
		existing = {"Brand", "BIOMIL"}
		get_doc_calls = []

		def exists(doctype, name=None):
			if name is None:
				return doctype in existing
			return name in existing

		def get_doc(arg, name=None):
			get_doc_calls.append((arg, name))
			if not isinstance(arg, dict):
				raise AssertionError("existing brands must not be loaded")
			created.append(arg["brand"])
			existing.add(arg["brand"])
			return Mock()

		fake_db = Mock()
		fake_db.exists.side_effect = exists
		with (
			patch("log.setup.brands.frappe.db", fake_db),
			patch("log.setup.brands.frappe.get_doc", side_effect=get_doc),
		):
			ensure_brands()

		self.assertNotIn("BIOMIL", created)
		self.assertEqual(created, [name for name in BRANDS if name != "BIOMIL"])
		self.assertTrue(all(isinstance(arg, dict) and name is None for arg, name in get_doc_calls))


class TestStoreGroupResolution(unittest.TestCase):
	def test_empty_config_falls_back_to_canonical_lists(self):
		self.assertEqual(effective_store_groups(None), list(CANONICAL_LEAF_GROUPS))
		self.assertEqual(effective_store_groups([]), list(CANONICAL_LEAF_GROUPS))
		self.assertEqual(effective_featured_groups(None), list(DEFAULT_FEATURED_GROUPS))
		self.assertEqual(effective_featured_groups([]), list(DEFAULT_FEATURED_GROUPS))

	def test_configured_store_groups_win(self):
		configured = ["Protection solaire", "Bébé & maman"]
		self.assertEqual(effective_store_groups(configured), configured)

	def test_featured_defaults_intersect_effective_store_groups(self):
		store = ["Bébé & maman", "Hygiène & toilette", "Protection solaire"]
		self.assertEqual(
			effective_featured_groups(None, store_groups=store),
			["Bébé & maman", "Protection solaire"],
		)

	def test_featured_outside_store_groups_are_excluded(self):
		store = ["Laits infantiles", "Bébé & maman"]
		self.assertEqual(
			effective_featured_groups(
				["Soins du visage", "Bébé & maman", "Laits infantiles"],
				store_groups=store,
			),
			["Bébé & maman", "Laits infantiles"],
		)

	def test_catalog_groups_never_include_legacy_erp_leaves(self):
		settings = frappe._dict(store_groups=[], featured_groups=[])
		with patch.object(merchandising, "get_store_settings", return_value=settings):
			groups = merchandising.store_catalog_groups()
			featured = merchandising.store_featured_groups()
		self.assertEqual(groups, list(CANONICAL_LEAF_GROUPS))
		self.assertNotIn("Soins du visage", groups)
		self.assertNotIn("AVENE", groups)
		self.assertEqual(featured, list(DEFAULT_FEATURED_GROUPS))

	def test_storefront_categories_use_featured_groups(self):
		settings = frappe._dict(
			store_groups=[{"item_group": "Bébé & maman"}, {"item_group": "Protection solaire"}],
			featured_groups=[{"item_group": "Protection solaire"}],
		)
		with patch.object(merchandising, "get_store_settings", return_value=settings):
			self.assertEqual(merchandising.store_catalog_groups(), ["Bébé & maman", "Protection solaire"])
			self.assertEqual(merchandising.store_featured_groups(), ["Protection solaire"])
		self.assertEqual(
			[{"name": name} for name in merchandising.store_featured_groups(settings)],
			[{"name": "Protection solaire"}],
		)

	def test_catalog_groups_api_uses_store_catalog_groups(self):
		from log.api import client_portal

		with patch("log.services.portal_merchandising.store_catalog_groups", return_value=["Visage & dermocosmétique"]):
			self.assertEqual(client_portal._catalog_groups(), ["Visage & dermocosmétique"])
		self.assertNotIn("Soins du visage", client_portal._catalog_groups())


class TestDemoSeedAlignment(unittest.TestCase):
	def test_demo_articles_use_canonical_leaves_only(self):
		for row in ARTICLES:
			self.assertIn(row[2], CANONICAL_LEAF_GROUPS)

	def test_seed_module_has_no_parallel_group_lists(self):
		import log.setup.seed_parapharmacie as seed

		self.assertFalse(hasattr(seed, "CATEGORIES"))
		self.assertFalse(hasattr(seed, "FEATURED_GROUPS"))
		self.assertFalse(hasattr(seed, "ROOT_GROUP"))


if __name__ == "__main__":
	unittest.main()
