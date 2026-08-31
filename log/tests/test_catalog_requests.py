import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import frappe

from log.services import catalog_requests as service


def _raise(message, exc=frappe.ValidationError, **_kwargs):
	raise exc(message)


class TestCatalogRequests(unittest.TestCase):
	def test_line_requires_designation_and_positive_qty(self):
		with patch.object(service, "_", lambda value: value), patch.object(
			service.frappe, "throw", side_effect=_raise
		):
			with self.assertRaises(frappe.ValidationError):
				service._normalise_line({"designation": "", "quantity": 1})
			with self.assertRaises(frappe.ValidationError):
				service._normalise_line({"designation": "Crème", "quantity": 0})

	def test_line_strips_html_and_keeps_optional_fields(self):
		row = service._normalise_line(
			{
				"designation": "<b>Crème solaire</b>",
				"quantity": 2,
				"reference": "EAN-1",
				"notes": "Boîte bleue",
			}
		)
		self.assertEqual(row["designation"], "Crème solaire")
		self.assertEqual(row["quantite"], 2.0)
		self.assertEqual(row["reference"], "EAN-1")
		self.assertEqual(row["notes"], "Boîte bleue")
		self.assertIsNone(row["photo"])

	def test_rejects_more_than_twenty_lines(self):
		with patch.object(service, "_", lambda value: value), patch.object(
			service.frappe, "throw", side_effect=_raise
		), self.assertRaises(frappe.ValidationError):
			service._normalise_lines([{"designation": "A", "quantity": 1}] * 21)

	def test_invalid_photo_is_rejected(self):
		with patch.object(service, "_", lambda value: value), patch.object(
			service.frappe, "throw", side_effect=_raise
		):
			with self.assertRaises(frappe.ValidationError):
				service._normalise_line(
					{"designation": "Crème", "quantity": 1, "photo": {"filename": "x.exe", "imageData": "aaaa"}}
				)

	def test_owned_request_rejects_another_customer(self):
		doc = frappe._dict(client="CUST-OTHER", name="DHC-1")
		fake = SimpleNamespace(
			db=SimpleNamespace(exists=lambda *_args: True),
			get_doc=lambda *_args: doc,
			throw=_raise,
			PermissionError=frappe.PermissionError,
			DoesNotExistError=frappe.DoesNotExistError,
		)
		with patch.object(service, "frappe", fake), patch.object(service, "_", lambda value: value), self.assertRaises(
			frappe.PermissionError
		):
			service.owned_request("DHC-1", "CUST-1")

	def test_cancel_only_when_open(self):
		doc = frappe._dict(client="CUST-1", name="DHC-1", statut="En cours")
		with patch.object(service, "owned_request", return_value=doc), patch.object(
			service, "_", lambda value: value
		), patch.object(service.frappe, "throw", side_effect=_raise), self.assertRaises(frappe.ValidationError):
			service.cancel_request("CUST-1", "DHC-1")

	def test_cancel_deletes_open_request(self):
		doc = frappe._dict(client="CUST-1", name="DHC-1", statut="Ouverte")
		with patch.object(service, "owned_request", return_value=doc), patch.object(
			service.frappe, "delete_doc"
		) as delete:
			result = service.cancel_request("CUST-1", "DHC-1")
		delete.assert_called_once_with(service.DOCTYPE, "DHC-1", ignore_permissions=True)
		self.assertEqual(result["name"], "DHC-1")

	def test_open_request_limit_blocks_create(self):
		with patch.object(service, "_open_request_count", return_value=10), patch.object(
			service, "_", lambda value: value
		), patch.object(service.frappe, "throw", side_effect=_raise), self.assertRaises(frappe.ValidationError):
			service.create_request("CUST-1", "client@example.com", {"items": [{"designation": "A", "quantity": 1}]})

	def test_mapped_lines_require_item_links(self):
		doc = frappe._dict(articles=[frappe._dict(designation="Crème", article=None, quantite=1)])
		with patch.object(service, "_", lambda value: value), patch.object(
			service.frappe, "throw", side_effect=_raise
		), self.assertRaises(frappe.ValidationError):
			service._mapped_order_lines(doc)

	def test_mapped_lines_reject_disabled_item(self):
		doc = frappe._dict(articles=[frappe._dict(designation="Crème", article="ART-1", quantite=2)])
		fake = SimpleNamespace(
			get_all=Mock(return_value=[frappe._dict(name="ART-1", stock_uom="Unité", disabled=1, is_sales_item=1)]),
			throw=_raise,
		)
		with patch.object(service, "frappe", fake), patch.object(service, "_", lambda value: value), patch.object(
			service, "cint", frappe.utils.cint
		), patch.object(service, "flt", frappe.utils.flt), self.assertRaises(frappe.ValidationError):
			service._mapped_order_lines(doc)

	def test_conversion_requires_desk_role(self):
		fake = SimpleNamespace(
			get_roles=lambda: ["Customer"],
			throw=_raise,
			PermissionError=frappe.PermissionError,
			DoesNotExistError=frappe.DoesNotExistError,
		)
		with patch.object(service, "frappe", fake), patch.object(service, "_", lambda value: value), self.assertRaises(
			frappe.PermissionError
		):
			service.create_sales_order("DHC-1")

	def test_conversion_creates_sales_order_and_closes_request(self):
		doc = frappe._dict(
			name="DHC-1",
			client="CUST-1",
			utilisateur_portail="client@example.com",
			statut="Ouverte",
			commande=None,
			date_livraison_souhaitee="2026-09-01",
			commentaire_client=None,
			motif_refus=None,
			modified="2026-08-31",
			creation="2026-08-31",
			articles=[
				frappe._dict(
					name="row-1",
					designation="Crème",
					quantite=2,
					reference=None,
					notes=None,
					photo=None,
					article="ART-1",
				)
			],
		)
		doc.flags = SimpleNamespace(ignore_permissions=False)
		doc.save = Mock()
		order = SimpleNamespace(
			name="SO-1",
			meta=SimpleNamespace(has_field=lambda field: field in {"custom_demande_hors_catalogue", "custom_origine_commande"}),
			insert=Mock(),
		)

		class DummyCM:
			def __enter__(self):
				return self

			def __exit__(self, *_args):
				return False

		with patch.object(service, "desk_request", return_value=doc), patch.object(
			service, "_mapped_order_lines", return_value=[{"item_code": "ART-1", "qty": 2, "uom": "Unité"}]
		), patch("log.api.client_portal._new_sales_order", return_value=order) as new_order, patch(
			"log.api.client_portal._portal_order_write", return_value=DummyCM()
		), patch("log.api.client_portal._serialize_order", return_value={"name": "SO-1"}):
			result = service.create_sales_order("DHC-1")
		new_order.assert_called_once()
		self.assertEqual(order.custom_demande_hors_catalogue, "DHC-1")
		self.assertEqual(order.custom_origine_commande, "Portail client")
		self.assertEqual(doc.statut, "Commande créée")
		self.assertEqual(doc.commande, "SO-1")
		doc.save.assert_called_once()
		self.assertEqual(result["order"]["name"], "SO-1")
		self.assertEqual(result["request"]["status"], "Commande créée")

	def test_refuse_requires_reason_and_open_status(self):
		closed = frappe._dict(statut="Commande créée")
		with patch.object(service, "desk_request", return_value=closed), patch.object(
			service, "_", lambda value: value
		), patch.object(service.frappe, "throw", side_effect=_raise), self.assertRaises(frappe.ValidationError):
			service.refuse_request("DHC-1", "Plus au catalogue")

		open_doc = frappe._dict(
			name="DHC-1",
			statut="Ouverte",
			client="CUST-1",
			date_livraison_souhaitee="2026-09-01",
			commentaire_client=None,
			motif_refus=None,
			commande=None,
			modified="now",
			creation="now",
			articles=[],
		)
		open_doc.flags = SimpleNamespace(ignore_permissions=False)
		open_doc.save = Mock()
		with patch.object(service, "desk_request", return_value=open_doc):
			result = service.refuse_request("DHC-1", "Plus au catalogue")
		self.assertEqual(open_doc.statut, "Refusée")
		self.assertEqual(open_doc.motif_refus, "Plus au catalogue")
		self.assertEqual(result["status"], "Refusée")

	def test_status_transitions(self):
		from log.log.doctype.demande_hors_catalogue.demande_hors_catalogue import ALLOWED_TRANSITIONS

		self.assertIn("Commande créée", ALLOWED_TRANSITIONS["Ouverte"])
		self.assertIn("Refusée", ALLOWED_TRANSITIONS["En cours"])
		self.assertNotIn("Ouverte", ALLOWED_TRANSITIONS["Refusée"])
		self.assertEqual(ALLOWED_TRANSITIONS["Commande créée"], frozenset({"Commande créée"}))

	def test_list_requests_applies_search_dates_and_sort(self):
		captured = {}

		def fake_get_all(_doctype, **kwargs):
			captured.update(kwargs)
			return []

		fake = SimpleNamespace(get_all=fake_get_all, get_doc=lambda *_args: None)
		with patch.object(service, "frappe", fake):
			result = service.list_requests(
				"CUST-1",
				page=1,
				page_length=20,
				status="Ouverte",
				search="DHC-2026",
				from_date="2026-08-01",
				to_date="2026-08-31",
				order_by="delivery_asc",
			)
		self.assertEqual(captured["filters"]["client"], "CUST-1")
		self.assertEqual(captured["filters"]["statut"], "Ouverte")
		self.assertEqual(captured["or_filters"], [["name", "like", "%DHC-2026%"]])
		self.assertEqual(captured["filters"]["creation"], ["between", ["2026-08-01", "2026-08-31 23:59:59"]])
		self.assertIn("date_livraison_souhaitee asc", captured["order_by"])
		self.assertEqual(result["items"], [])
		self.assertFalse(result["hasNext"])
