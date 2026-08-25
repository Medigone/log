import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from log.api import distribution


class TestCustomerGpsCapture(unittest.TestCase):
	def setUp(self):
		self.delivery_note = SimpleNamespace(customer="CUST-1", name="DN-1")
		self.evidence = {"latitude": 35.7, "longitude": -0.6, "accuracy": 25}

	def test_missing_customer_is_updated_with_audit(self):
		db = Mock()
		db.get_value.return_value = None
		db.has_column.return_value = True
		fake_frappe = SimpleNamespace(db=db, session=SimpleNamespace(user="driver@example.com"))
		with (
			patch.object(distribution, "frappe", fake_frappe),
			patch.object(distribution, "now_datetime", return_value="2026-08-25 10:00:00"),
		):
			updated = distribution._capture_missing_customer_location(
				self.delivery_note,
				self.evidence,
				outcome="delivered",
			)

		self.assertTrue(updated)
		values = db.set_value.call_args.args[2]
		self.assertEqual(values["custom_gps"], "35.70000000,-0.60000000")
		self.assertEqual(values["custom_gps_precision_m"], 25)
		self.assertEqual(values["custom_gps_capture_user"], "driver@example.com")
		self.assertEqual(values["custom_gps_source_bl"], "DN-1")

	def test_existing_customer_location_is_never_overwritten(self):
		db = Mock()
		db.get_value.return_value = "35.8,-0.7"
		with patch.object(distribution, "frappe", SimpleNamespace(db=db)):
			updated = distribution._capture_missing_customer_location(
				self.delivery_note,
				self.evidence,
				outcome="partial",
			)

		self.assertFalse(updated)
		db.set_value.assert_not_called()

	def test_failed_stop_does_not_update_customer(self):
		db = Mock()
		with patch.object(distribution, "frappe", SimpleNamespace(db=db)):
			updated = distribution._capture_missing_customer_location(
				self.delivery_note,
				self.evidence,
				outcome="failed",
			)

		self.assertFalse(updated)
		db.get_value.assert_not_called()
		db.set_value.assert_not_called()

	def test_delivery_completion_skips_full_erp_validation(self):
		doc = SimpleNamespace(flags=SimpleNamespace(), save=Mock())

		distribution._save_delivery_completion(doc)

		self.assertTrue(doc.flags.ignore_validate)
		self.assertTrue(doc.flags.ignore_validate_update_after_submit)
		doc.save.assert_called_once_with(ignore_permissions=True)

	def test_refresh_document_timestamp_copies_latest_modified(self):
		doc = SimpleNamespace(doctype="Livraison", name="LIV-1", modified="old", modified_by="old-user")
		db = Mock()
		db.get_value.return_value = SimpleNamespace(modified="new", modified_by="driver@example.com")
		with patch.object(distribution, "frappe", SimpleNamespace(db=db)):
			distribution._refresh_document_timestamp(doc)
		self.assertEqual(doc.modified, "new")
		self.assertEqual(doc.modified_by, "driver@example.com")


if __name__ == "__main__":
	unittest.main()
