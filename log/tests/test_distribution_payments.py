import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

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


if __name__ == "__main__":
	unittest.main()
