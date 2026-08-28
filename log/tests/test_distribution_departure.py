import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from log.api import distribution


def _raise_throw(message, *args, **kwargs):
	raise Exception(str(message))


class TestDistributionDepartureWorkflow(unittest.TestCase):
	def _route(self, **overrides):
		doc = SimpleNamespace(
			name="LIV-1",
			etat_planification="Publiée",
			revision=1,
			revision_acceptee=1,
			revision_publiee=1,
			stock_entry_chargement=None,
			statut_chargement="À charger",
			last_start_request_id=None,
			status="Prête",
			date_depart=None,
			livreur="DRV-1",
			meta=SimpleNamespace(has_field=lambda name: True),
			save=Mock(),
		)
		doc.bons_de_livraison = [SimpleNamespace(bon_de_livraison="DN-1"), SimpleNamespace(bon_de_livraison="DN-2")]
		for key, value in overrides.items():
			setattr(doc, key, value)
		doc.get = lambda key, default=None: getattr(doc, key, default)
		return doc

	def _rpc(self, route, extra=None):
		patches = {
			"_require": patch.object(distribution, "_require"),
			"_require_schema": patch.object(distribution, "_require_schema"),
			"_lock_route": patch.object(distribution, "_lock_route"),
			"_lock_delivery_note": patch.object(distribution, "_lock_delivery_note"),
			"_assert_driver_route": patch.object(distribution, "_assert_driver_route"),
			"_refresh_document_timestamp": patch.object(distribution, "_refresh_document_timestamp"),
			"_serialize_route": patch.object(distribution, "_serialize_route", return_value={"name": route.name}),
			"get_doc": patch.object(distribution.frappe, "get_doc", return_value=route),
			"throw": patch.object(distribution.frappe, "throw", side_effect=_raise_throw),
			"translate": patch.object(distribution, "_", side_effect=lambda message, *args: message),
		}
		patches.update(extra or {})
		return patches

	def _enter(self, patches):
		return {name: item.start() for name, item in patches.items()}

	def _stop(self, patches):
		for item in patches.values():
			item.stop()

	def test_load_route_transfers_stock_without_starting(self):
		route = self._route()
		patches = self._rpc(
			route,
			{"load_stock": patch("log.services.distribution_fulfillment.load_route_stock")},
		)
		started = self._enter(patches)
		try:
			distribution.load_route("LIV-1", 1, ["DN-1", "DN-2"], "req-load")
		finally:
			self._stop(patches)

		started["load_stock"].assert_called_once_with(route)
		self.assertEqual(route.etat_planification, "Publiée")
		route.save.assert_called_once_with(ignore_permissions=True)

	def test_start_route_throws_without_load(self):
		route = self._route()
		patches = self._rpc(route)
		self._enter(patches)
		try:
			with self.assertRaises(Exception) as raised:
				distribution.start_route("LIV-1", 1, "req-start")
		finally:
			self._stop(patches)

		self.assertIn("Chargez", str(raised.exception))
		self.assertEqual(route.etat_planification, "Publiée")
		route.save.assert_not_called()

	def test_start_route_starts_after_load(self):
		route = self._route(statut_chargement="Chargé", stock_entry_chargement="STE-1")
		patches = self._rpc(
			route,
			{
				"now": patch.object(distribution, "now_datetime", return_value="2026-08-28 08:00:00"),
				"status": patch("log.livraison_hooks.calculate_livraison_status_from_bls", return_value="En cours"),
				"assign": patch.object(distribution, "_set_delivery_note_assignment"),
			},
		)
		self._enter(patches)
		try:
			distribution.start_route("LIV-1", 1, "req-start")
		finally:
			self._stop(patches)

		self.assertEqual(route.etat_planification, "En cours")
		self.assertEqual(route.date_depart, "2026-08-28 08:00:00")
		route.save.assert_called_once_with(ignore_permissions=True)

	def test_complete_delivery_stop_throws_on_prepared_note(self):
		route = self._route(
			etat_planification="En cours",
			statut_chargement="Chargé",
			stock_entry_chargement="STE-1",
		)
		note = SimpleNamespace(custom_statut="Préparé", custom_last_delivery_request_id=None, get=lambda key, default=None: getattr(note, key, default))

		def get_doc(doctype, name=None):
			return route if doctype == "Livraison" else note

		patches = self._rpc(route, {"get_doc": patch.object(distribution.frappe, "get_doc", side_effect=get_doc)})
		self._enter(patches)
		try:
			with self.assertRaises(Exception) as raised:
				distribution.complete_delivery_stop(
					{
						"requestId": "req-stop",
						"routeId": "LIV-1",
						"routeRevision": 1,
						"deliveryNote": "DN-1",
					}
				)
		finally:
			self._stop(patches)

		self.assertIn("chargé", str(raised.exception))
		route.save.assert_not_called()


if __name__ == "__main__":
	unittest.main()
