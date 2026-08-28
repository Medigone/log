import unittest
from types import SimpleNamespace

from log.api.distribution import (
	_board_date_range,
	planning_display_status,
	should_update_source_in_place,
)


def _solo_route(**kwargs):
	defaults = {
		"name": "LIV-26-08-00002",
		"date_liv": "2026-08-26",
		"livreur": "DRV-1",
		"vehicule": "VEH-1",
		"depart_prevu": "2026-08-26 12:00:00",
		"fin_prevue": "2026-08-26 14:00:00",
		"bons_de_livraison": [SimpleNamespace(bon_de_livraison="MAT-DN-2026-00003")],
	}
	defaults.update(kwargs)
	return SimpleNamespace(**defaults)


class TestPlanningBoardDates(unittest.TestCase):
	def test_all_dates_has_no_bounds(self):
		self.assertEqual(_board_date_range(all_dates=True), (None, None))

	def test_empty_dates_have_no_bounds(self):
		self.assertEqual(_board_date_range(), (None, None))
		self.assertEqual(_board_date_range(date_from="", date_to=""), (None, None))

	def test_single_date_is_that_day(self):
		start, end = _board_date_range(date_from="2026-08-26")
		self.assertEqual(str(start), "2026-08-26")
		self.assertEqual(str(end), "2026-08-26")


class TestPlanningDisplayStatus(unittest.TestCase):
	def test_published_past_date_is_overdue(self):
		self.assertEqual(
			planning_display_status(
				{"planningStatus": "Publié", "status": "Préparé", "requestedDate": "2026-08-26"},
				"2026-08-28",
			),
			"En retard",
		)

	def test_keeps_published_when_still_due(self):
		self.assertEqual(
			planning_display_status(
				{"planningStatus": "Publié", "status": "Préparé", "requestedDate": "2026-08-28"},
				"2026-08-28",
			),
			"Publié",
		)

	def test_does_not_override_finished_or_in_progress(self):
		self.assertEqual(
			planning_display_status(
				{"planningStatus": "Terminé", "status": "Livré", "requestedDate": "2026-08-26"},
				"2026-08-28",
			),
			"Terminé",
		)
		self.assertEqual(
			planning_display_status(
				{"planningStatus": "En cours", "status": "Enlevé", "requestedDate": "2026-08-26"},
				"2026-08-28",
			),
			"En cours",
		)
		self.assertEqual(
			planning_display_status(
				{"planningStatus": "Publié", "status": "Livré", "requestedDate": "2026-08-26"},
				"2026-08-28",
			),
			"Publié",
		)


class TestRescheduleInPlace(unittest.TestCase):
	def test_solo_stop_date_change_updates_same_route(self):
		self.assertTrue(
			should_update_source_in_place(
				_solo_route(),
				{"plannedDate": "2026-08-28", "plannedStart": "2026-08-28T12:00:00", "plannedEnd": "2026-08-28T14:00:00", "driver": "DRV-1", "vehicle": "VEH-1"},
				"MAT-DN-2026-00003",
			)
		)

	def test_explicit_other_route_is_not_in_place(self):
		self.assertFalse(
			should_update_source_in_place(
				_solo_route(),
				{
					"targetRouteId": "LIV-OTHER",
					"plannedDate": "2026-08-28",
					"driver": "DRV-1",
					"vehicle": "VEH-1",
				},
				"MAT-DN-2026-00003",
			)
		)

	def test_shared_route_is_not_in_place(self):
		route = _solo_route(
			bons_de_livraison=[
				SimpleNamespace(bon_de_livraison="MAT-DN-2026-00003"),
				SimpleNamespace(bon_de_livraison="MAT-DN-2026-00004"),
			]
		)
		self.assertFalse(
			should_update_source_in_place(
				route,
				{"plannedDate": "2026-08-28", "driver": "DRV-2", "vehicle": "VEH-1"},
				"MAT-DN-2026-00003",
			)
		)

	def test_unchanged_slot_is_not_in_place(self):
		self.assertFalse(
			should_update_source_in_place(
				_solo_route(),
				{
					"plannedDate": "2026-08-26",
					"plannedStart": "2026-08-26 12:00:00",
					"plannedEnd": "2026-08-26 14:00:00",
					"driver": "DRV-1",
					"vehicle": "VEH-1",
				},
				"MAT-DN-2026-00003",
			)
		)
