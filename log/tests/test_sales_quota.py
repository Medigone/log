import unittest
from unittest.mock import patch

import frappe

from log.services import sales_quota
from log.services.sales_quota import check_quotas, row_quota, validate_quota_settings


class QuotaError(Exception):
	pass


def _throw(message, *args, **kwargs):
	raise QuotaError(message)


@patch("log.services.sales_quota.frappe.throw", side_effect=_throw)
@patch("log.services.sales_quota.frappe.db.get_value", return_value="Lait")
@patch("log.services.sales_quota.item_quotas", return_value={"A": 5})
class TestCheckQuotas(unittest.TestCase):
	def test_commercial_is_blocked_above_quota(self, *_):
		with self.assertRaisesRegex(QuotaError, "maximum 5 par commande"):
			check_quotas([{"item_code": "A", "qty": 6}])

	def test_quantities_of_same_item_are_summed(self, *_):
		with self.assertRaises(QuotaError):
			check_quotas([{"item_code": "A", "qty": 3}, {"item_code": "A", "qty": 3}])

	def test_quota_reached_is_allowed(self, *_):
		check_quotas([{"item_code": "A", "qty": 5}, {"item_code": "B", "qty": 100}])

	def test_manager_can_exceed(self, *_):
		check_quotas([{"item_code": "A", "qty": 50}], allow_override=True)

	def test_saved_quantity_can_be_kept_but_not_raised(self, *_):
		check_quotas([{"item_code": "A", "qty": 8}], previous={"A": 8})
		check_quotas([{"item_code": "A", "qty": 7}], previous={"A": 8})
		with self.assertRaises(QuotaError):
			check_quotas([{"item_code": "A", "qty": 9}], previous={"A": 8})


class TestQuotaSettings(unittest.TestCase):
	def test_row_quota_only_when_enabled(self):
		self.assertEqual(row_quota(frappe._dict({sales_quota.QUOTA_FIELD: 1, sales_quota.QUOTA_MAX_FIELD: 4})), 4)
		self.assertIsNone(row_quota(frappe._dict({sales_quota.QUOTA_FIELD: 0, sales_quota.QUOTA_MAX_FIELD: 4})))
		self.assertIsNone(row_quota(frappe._dict({sales_quota.QUOTA_FIELD: 1, sales_quota.QUOTA_MAX_FIELD: 0})))

	@patch("log.services.sales_quota.frappe.throw", side_effect=_throw)
	def test_enabled_quota_requires_positive_max(self, _throw_mock):
		with self.assertRaises(QuotaError):
			validate_quota_settings(1, 0)
		validate_quota_settings(1, 3)
		validate_quota_settings(0, 0)


@patch("log.api.client_portal.frappe.throw", side_effect=_throw)
@patch("log.services.sales_quota.frappe.throw", side_effect=_throw)
@patch("log.services.sales_quota.frappe.db.get_value", return_value="Lait")
@patch("log.services.sales_quota.item_quotas", return_value={"A": 5})
class TestPortalQuota(unittest.TestCase):
	def test_portal_cart_is_blocked_above_quota(self, *_):
		from log.api import client_portal

		rows = [frappe._dict(name="A", stock_uom="N°")]
		with patch.object(client_portal.frappe, "get_all", return_value=rows), patch.object(
			client_portal, "_catalog_item_filters", return_value={}
		):
			with self.assertRaises(QuotaError):
				client_portal._normalise_lines([{"itemCode": "A", "quantity": 4}, {"itemCode": "A", "quantity": 2}])
			lines = client_portal._normalise_lines([{"itemCode": "A", "quantity": 5}])
		self.assertEqual(lines[0]["qty"], 5)
