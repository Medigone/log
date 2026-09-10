import json
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from log.setup.customer_groups import CUSTOMER_GROUPS, ensure_customer_groups


FIXTURE_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "customer_group.json"


class TestCustomerGroupFixtures(unittest.TestCase):
	def test_parents_are_declared_before_leaves(self):
		names = [row["customer_group_name"] for row in CUSTOMER_GROUPS]
		self.assertEqual(names[:2], ["Gros", "D.D"])
		for row in CUSTOMER_GROUPS[2:]:
			self.assertIn(row["parent_customer_group"], {"Gros", "D.D"})
			self.assertEqual(row["is_group"], 0)

	def test_json_fixture_matches_the_python_tree(self):
		payload = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
		self.assertEqual([row["name"] for row in payload], [row["customer_group_name"] for row in CUSTOMER_GROUPS])
		self.assertEqual(payload[0]["is_group"], 1)
		self.assertEqual(payload[1]["is_group"], 1)
		self.assertNotIn("parent_customer_group", payload[0])
		self.assertNotIn("parent_customer_group", payload[1])
		self.assertEqual(payload[2]["parent_customer_group"], "Gros")
		self.assertEqual(payload[-1]["parent_customer_group"], "D.D")

	def test_ensure_creates_missing_groups_under_the_site_root(self):
		created = []
		existing = {"Customer Group"}

		def exists(doctype, name=None):
			if name is None:
				return doctype in existing
			return name in existing

		def get_doc(arg, _name=None):
			if not isinstance(arg, dict):
				raise AssertionError(f"unexpected get_doc({arg!r})")
			created.append(arg)
			existing.add(arg["customer_group_name"])
			return Mock()

		fake_db = Mock()
		fake_db.exists.side_effect = exists
		with (
			patch("log.setup.customer_groups.frappe.db", fake_db),
			patch("log.setup.customer_groups.get_root_of", return_value="Tous les Groupes Client"),
			patch("log.setup.customer_groups.frappe.get_doc", side_effect=get_doc),
		):
			ensure_customer_groups()

		self.assertEqual(created[0]["customer_group_name"], "Gros")
		self.assertEqual(created[0]["parent_customer_group"], "Tous les Groupes Client")
		self.assertEqual(created[0]["is_group"], 1)
		self.assertEqual(created[1]["customer_group_name"], "D.D")
		self.assertEqual(created[2]["parent_customer_group"], "Gros")
		self.assertEqual(created[-1]["customer_group_name"], "Pharmacie")
		self.assertEqual(created[-1]["parent_customer_group"], "D.D")
		self.assertEqual(len(created), len(CUSTOMER_GROUPS))
