import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import frappe

from log.api import distribution
from log import paiement_hooks


class TestDistributionPaymentSummary(unittest.TestCase):
	def test_payment_summary_returns_total_and_auditable_rows(self):
		fake_frappe = SimpleNamespace(
			get_all=lambda *args, **kwargs: [
				{
					"name": "PAY-1",
					"date": "2026-08-25",
					"moyen_paiement": "Espèce",
					"montant": 1200,
					"date_encaissement": None,
				},
				{
					"name": "PAY-2",
					"date": "2026-08-25",
					"moyen_paiement": "Chèque",
					"montant": 800,
					"date_encaissement": "2026-08-30",
				},
			],
		)
		with patch.object(distribution, "frappe", fake_frappe):
			total, payments = distribution._payment_summary("DN-1")

		self.assertEqual(total, 2000)
		self.assertEqual(payments[0]["method"], "Espèce")
		self.assertEqual(payments[1]["collectionDate"], "2026-08-30")
		self.assertEqual(payments[1]["amount"], 800)

	def test_refresh_route_lifecycle_realigns_timestamp_before_save(self):
		route = SimpleNamespace(
			name="LIV-1",
			bons_de_livraison=[SimpleNamespace(bon_de_livraison="DN-1")],
			etat_planification="En cours",
			statut_chargement="Chargé",
			save=Mock(),
		)
		db = Mock()
		db.get_value.return_value = "Enlevé"
		with (
			patch.object(distribution, "frappe", SimpleNamespace(db=db)),
			patch.object(distribution, "_refresh_document_timestamp") as refresh,
		):
			distribution._refresh_route_lifecycle(route)
		refresh.assert_called_once_with(route)
		route.save.assert_called_once_with(ignore_permissions=True)

	def test_refresh_route_lifecycle_closes_empty_return_from_in_progress(self):
		route = SimpleNamespace(
			name="LIV-1",
			bons_de_livraison=[SimpleNamespace(bon_de_livraison="DN-1")],
			etat_planification="En cours",
			statut_chargement="Chargé",
			save=Mock(),
		)
		dn = SimpleNamespace(name="DN-1", docstatus=1)
		reloaded = SimpleNamespace(name="LIV-1")
		db = Mock()
		db.get_value.return_value = "Livré"

		def fake_get_doc(doctype, name):
			if doctype == "Delivery Note":
				return dn
			return reloaded

		with (
			patch.object(distribution, "frappe", SimpleNamespace(db=db, get_doc=fake_get_doc)),
			patch.object(distribution, "_refresh_document_timestamp"),
			patch.object(distribution, "_set_delivery_note_assignment"),
			patch(
				"log.services.distribution_fulfillment.complete_empty_route_return",
				return_value=True,
			) as complete,
			patch.object(distribution, "_try_complete_route") as try_complete,
		):
			distribution._refresh_route_lifecycle(route)
		complete.assert_called_once_with(route, persist=False)
		route.save.assert_called_once_with(ignore_permissions=True)
		try_complete.assert_called_once_with(reloaded)

	def test_refresh_route_lifecycle_declares_return_when_goods_remain(self):
		route = SimpleNamespace(
			name="LIV-1",
			bons_de_livraison=[SimpleNamespace(bon_de_livraison="DN-1")],
			etat_planification="En cours",
			statut_chargement="Chargé",
			save=Mock(),
		)
		dn = SimpleNamespace(name="DN-1", docstatus=1)
		db = Mock()
		db.get_value.return_value = "Partiellement Livré"

		def fake_get_doc(doctype, name):
			if doctype == "Delivery Note":
				return dn
			return route

		with (
			patch.object(distribution, "frappe", SimpleNamespace(db=db, get_doc=fake_get_doc)),
			patch.object(distribution, "_refresh_document_timestamp"),
			patch.object(distribution, "_set_delivery_note_assignment"),
			patch(
				"log.services.distribution_fulfillment.complete_empty_route_return",
				return_value=False,
			) as complete,
			patch(
				"log.services.distribution_fulfillment.declare_route_return",
			) as declare,
			patch.object(distribution, "_try_complete_route") as try_complete,
		):
			distribution._refresh_route_lifecycle(route)
		complete.assert_called_once_with(route, persist=False)
		declare.assert_called_once_with(route, persist=False)
		self.assertEqual(route.statut_chargement, "Chargé")
		route.save.assert_called_once_with(ignore_permissions=True)
		try_complete.assert_not_called()

	def test_try_complete_route_finishes_without_payments(self):
		route = SimpleNamespace(
			name="LIV-1",
			statut_chargement="Retourné",
			statut_caisse="Sans encaissement",
			etat_planification="Contrôle caisse",
			bons_de_livraison=[],
			date_fin=None,
			save=Mock(),
		)
		route.get = lambda key, default=None: getattr(route, key, default)
		db = Mock()
		db.count.return_value = 0
		with (
			patch.object(distribution, "frappe", SimpleNamespace(db=db)),
			patch.object(distribution, "_refresh_document_timestamp") as refresh,
			patch.object(distribution, "now_datetime", return_value="2026-08-28 23:58:00"),
		):
			distribution._try_complete_route(route)
		self.assertEqual(route.etat_planification, "Terminée")
		self.assertEqual(route.statut_caisse, "Sans encaissement")
		self.assertEqual(route.date_fin, "2026-08-28 23:58:00")
		refresh.assert_called_once_with(route)
		route.save.assert_called_once_with(ignore_permissions=True)

	def test_paiement_hook_updates_totals_without_saving_route(self):
		livraison = SimpleNamespace(
			nombre_bons_de_livraison=1,
			total_articles=2,
			total_montant_a_encaisser=1000,
			total_paiements=200,
			solde_restant=800,
			calculate_totals=Mock(),
			save=Mock(),
		)
		db = Mock()
		db.exists.return_value = True
		with patch.object(
			paiement_hooks,
			"frappe",
			SimpleNamespace(db=db, get_doc=lambda *args, **kwargs: livraison, get_traceback=lambda: ""),
		):
			paiement_hooks.update_livraison_totals_on_paiement_change(SimpleNamespace(livraison="LIV-1"))
		livraison.calculate_totals.assert_called_once()
		livraison.save.assert_not_called()
		db.set_value.assert_called_once()
		self.assertEqual(db.set_value.call_args.args[0], "Livraison")
		self.assertEqual(db.set_value.call_args.kwargs.get("update_modified"), False)

	def test_serialize_note_amounts_includes_taxes_and_grand_total(self):
		doc = frappe._dict(
			net_total=9600,
			grand_total=11232,
			rounded_total=11232,
			disable_rounded_total=0,
			taxes=[frappe._dict(description="VAT 17% @ 17.0", rate=17, tax_amount=1632, account_head="TVA")],
		)
		amounts = distribution._serialize_note_amounts(doc)
		self.assertEqual(amounts["netTotal"], 9600)
		self.assertEqual(amounts["grandTotal"], 11232)
		self.assertEqual(amounts["taxes"][0]["description"], "VAT 17% @ 17.0")
		self.assertEqual(amounts["taxes"][0]["taxAmount"], 1632)

	def test_serialize_note_amounts_uses_rounded_total_from_delivery_note(self):
		doc = frappe._dict(
			net_total=1000,
			grand_total=1190.4,
			rounded_total=1190,
			disable_rounded_total=0,
			taxes=[frappe._dict(description="TVA 19%", rate=19, tax_amount=190.4)],
		)
		self.assertEqual(distribution._serialize_note_amounts(doc)["grandTotal"], 1190)


if __name__ == "__main__":
	unittest.main()
