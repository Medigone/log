import unittest
from types import SimpleNamespace
from unittest.mock import patch

from log.services import distribution_driver_routes as routes


def _route(**kwargs):
	defaults = {
		"name": "LIV-OLD",
		"date_liv": "2026-08-20",
		"etat_planification": "Terminée",
		"nombre_bons_de_livraison": 2,
		"total_articles": 12,
		"depart_prevu": "2026-08-20 08:00:00",
	}
	defaults.update(kwargs)
	return defaults


def _child(parent="LIV-OLD", customer="CUST-1", commune="COM-1", wilaya="Alger", qty=6):
	return {
		"parent": parent,
		"customer": customer,
		"custom_commune": commune,
		"custom_wilaya": wilaya,
		"total_qty": qty,
	}


class TestDriverRouteBoard(unittest.TestCase):
	def test_customer_label_truncates_after_the_first_name(self):
		self.assertEqual(routes.customer_label(["Épicerie Nord"]), "Épicerie Nord")
		self.assertEqual(routes.customer_label(["Client A", "Client B", "Client A"]), "Client A · +1")
		self.assertEqual(routes.customer_label([]), "Client non renseigné")

	def test_location_label_joins_unique_commune_and_wilaya(self):
		self.assertEqual(routes.location_label(["Hydra"], ["Alger"]), "Hydra · Alger")
		self.assertEqual(routes.location_label(["Hydra", "El Biar"], ["Alger", "Alger"]), "Hydra, El Biar · Alger")
		self.assertEqual(routes.location_label([], ["Oran"]), "Oran")
		self.assertEqual(routes.location_label([], []), "")

	def test_history_window_covers_thirty_days_back(self):
		self.assertEqual(routes.history_start("2026-08-28"), "2026-07-29")

	def test_history_card_resolves_client_stops_articles_and_location(self):
		card = routes.serialize_history_card(
			_route(),
			[
				_child(customer="CUST-1", commune="COM-1", wilaya="Alger", qty=7),
				_child(customer="CUST-2", commune="COM-2", wilaya="Alger", qty=5),
			],
			{"CUST-1": "Épicerie Nord", "CUST-2": "Client B"},
			{"COM-1": "Hydra", "COM-2": "El Biar"},
		)
		self.assertEqual(card["name"], "LIV-OLD")
		self.assertEqual(card["lifecycle"], "Terminée")
		self.assertEqual(card["customerLabel"], "Épicerie Nord · +1")
		self.assertEqual(card["stopCount"], 2)
		self.assertEqual(card["totalArticles"], 12)
		self.assertEqual(card["locationLabel"], "Hydra, El Biar · Alger")

	def test_history_card_counts_unique_customers_as_stops(self):
		card = routes.serialize_history_card(
			_route(nombre_bons_de_livraison=2),
			[_child(customer="CUST-1", qty=3), _child(customer="CUST-1", qty=4)],
			{"CUST-1": "Client A"},
			{"COM-1": "Hydra"},
		)
		self.assertEqual(card["stopCount"], 1)

	def test_history_card_falls_back_to_child_quantities(self):
		card = routes.serialize_history_card(
			_route(total_articles=0, nombre_bons_de_livraison=0),
			[_child(qty=3), _child(customer="CUST-2", qty=4)],
			{"CUST-1": "Client A", "CUST-2": "Client B"},
			{"COM-1": "Hydra"},
		)
		self.assertEqual(card["stopCount"], 2)
		self.assertEqual(card["totalArticles"], 7)

	def test_board_splits_programmed_full_routes_and_history_cards(self):
		programmed_doc = SimpleNamespace(name="LIV-1")
		history_row = _route(name="LIV-OLD", date_liv="2026-08-01")
		children = [
			_child(parent="LIV-OLD", customer="CUST-1", commune="COM-1", wilaya="Alger", qty=12),
		]

		with (
			patch.object(routes, "_load_programmed", return_value=["LIV-1"]),
			patch.object(routes, "_load_history", return_value=[history_row]),
			patch.object(routes, "_load_children", return_value=children),
			patch.object(routes, "_load_customer_names", return_value={"CUST-1": "Épicerie Nord"}),
			patch.object(routes, "_load_commune_names", return_value={"COM-1": "Hydra"}),
			patch.object(routes.frappe, "get_doc", return_value=programmed_doc),
		):
			board = routes.build_driver_route_board(
				driver="DRV-1",
				date="2026-08-28",
				serialize_route=lambda doc: {"name": doc.name, "lifecycle": "En cours"},
			)

		self.assertEqual(board["programmedCount"], 1)
		self.assertEqual(board["programmed"][0]["name"], "LIV-1")
		self.assertEqual(board["history"][0]["name"], "LIV-OLD")
		self.assertEqual(board["history"][0]["customerLabel"], "Épicerie Nord")
		self.assertEqual(board["history"][0]["locationLabel"], "Hydra · Alger")
		self.assertNotIn("stops", board["history"][0])

	def test_board_is_empty_without_driver(self):
		self.assertEqual(
			routes.build_driver_route_board(driver=None, date="2026-08-28"),
			{"programmed": [], "history": [], "programmedCount": 0},
		)

	def test_history_loader_uses_thirty_day_window_and_terminal_states(self):
		with patch.object(routes.frappe, "get_all", return_value=[]) as get_all:
			routes._load_history("DRV-1", "2026-07-29", "2026-08-28")

		get_all.assert_called_once()
		_, kwargs = get_all.call_args
		self.assertEqual(kwargs["filters"]["livreur"], "DRV-1")
		self.assertEqual(kwargs["filters"]["etat_planification"], ["in", ["Contrôle caisse", "Terminée"]])
		self.assertEqual(kwargs["filters"]["date_liv"], ["between", ["2026-07-29", "2026-08-28"]])

	def test_programmed_loader_ignores_date_and_keeps_active_states(self):
		with patch.object(routes.frappe, "get_all", return_value=[]) as get_all:
			routes._load_programmed("DRV-1")

		_, kwargs = get_all.call_args
		self.assertNotIn("date_liv", kwargs["filters"])
		self.assertEqual(kwargs["filters"]["etat_planification"], ["in", ["Publiée", "En cours", "Retour dépôt"]])
