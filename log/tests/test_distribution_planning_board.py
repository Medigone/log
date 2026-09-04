import unittest
from datetime import date
from types import SimpleNamespace

from log.api.distribution import (
	_board_date_range,
	_unassigned_matches_board,
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


class TestUnassignedMatchesBoard(unittest.TestCase):
	def test_kanban_backlog_includes_all_unscheduled_dates(self):
		self.assertTrue(
			_unassigned_matches_board(
				date(2026, 12, 1),
				"Non planifié",
				date(2026, 9, 3),
				date(2026, 9, 3),
				include_backlog=True,
			)
		)
		self.assertTrue(
			_unassigned_matches_board(
				None,
				"Non planifié",
				date(2026, 9, 3),
				date(2026, 9, 3),
				include_backlog=True,
			)
		)
		self.assertTrue(
			_unassigned_matches_board(
				date(2026, 1, 1),
				"Non planifié",
				date(2026, 9, 3),
				date(2026, 9, 3),
				include_backlog=True,
			)
		)

	def test_table_view_windows_by_requested_date(self):
		self.assertTrue(
			_unassigned_matches_board(
				date(2026, 9, 3),
				"Non planifié",
				date(2026, 9, 3),
				date(2026, 9, 3),
			)
		)
		self.assertFalse(
			_unassigned_matches_board(
				date(2026, 12, 1),
				"Non planifié",
				date(2026, 9, 3),
				date(2026, 9, 3),
			)
		)
		self.assertFalse(
			_unassigned_matches_board(
				None,
				"Non planifié",
				date(2026, 9, 3),
				date(2026, 9, 3),
			)
		)

	def test_exception_statuses_appear_outside_window(self):
		self.assertTrue(
			_unassigned_matches_board(
				date(2026, 12, 1),
				"À revalider",
				date(2026, 9, 3),
				date(2026, 9, 3),
			)
		)

	def test_all_dates_includes_everything(self):
		self.assertTrue(_unassigned_matches_board(None, "Non planifié", None, None))

	def test_bl_date_window_is_independent_of_route_date(self):
		self.assertTrue(
			_unassigned_matches_board(
				date(2026, 9, 6),
				"Non planifié",
				date(2026, 9, 7),
				date(2026, 9, 7),
				requested_start=date(2026, 9, 6),
				requested_end=date(2026, 9, 6),
			)
		)
		self.assertFalse(
			_unassigned_matches_board(
				date(2026, 9, 5),
				"Non planifié",
				date(2026, 9, 7),
				date(2026, 9, 7),
				requested_start=date(2026, 9, 6),
				requested_end=date(2026, 9, 6),
			)
		)

	def test_include_backlog_does_not_override_bl_date_window(self):
		self.assertFalse(
			_unassigned_matches_board(
				date(2026, 9, 5),
				"Non planifié",
				date(2026, 9, 7),
				date(2026, 9, 7),
				include_backlog=True,
				requested_start=date(2026, 9, 6),
				requested_end=date(2026, 9, 6),
			)
		)
		self.assertTrue(
			_unassigned_matches_board(
				date(2026, 9, 6),
				"Non planifié",
				date(2026, 9, 7),
				date(2026, 9, 7),
				include_backlog=True,
				requested_start=date(2026, 9, 6),
				requested_end=date(2026, 9, 6),
			)
		)

	def test_exception_statuses_appear_outside_bl_date_window(self):
		self.assertTrue(
			_unassigned_matches_board(
				date(2026, 9, 5),
				"À revalider",
				date(2026, 9, 7),
				date(2026, 9, 7),
				requested_start=date(2026, 9, 6),
				requested_end=date(2026, 9, 6),
			)
		)


class TestBoardLoadsSeparateBlDateWindow(unittest.TestCase):
	def test_planning_board_reads_bl_date_filters(self):
		import inspect
		from log.api import distribution

		source = inspect.getsource(distribution.get_planning_board)
		self.assertIn("blDateFrom", source)
		self.assertIn("blDateTo", source)
		self.assertIn("requested_start", source)
		self.assertIn("requested_end", source)
		self.assertLess(source.index("date_liv"), source.index("blDateFrom"))


class TestBoardDateRangeBacklog(unittest.TestCase):
	"""Backlog date range: the date range logic is used by the board loader."""

	def test_single_date_range(self):
		start, end = _board_date_range(date="2026-09-03")
		self.assertEqual(str(start), "2026-09-03")
		self.assertEqual(str(end), "2026-09-03")

	def test_date_from_only(self):
		start, end = _board_date_range(date_from="2026-09-01")
		self.assertEqual(str(start), "2026-09-01")
		self.assertEqual(str(end), "2026-09-01")

	def test_date_range(self):
		start, end = _board_date_range(date_from="2026-09-01", date_to="2026-09-05")
		self.assertEqual(str(start), "2026-09-01")
		self.assertEqual(str(end), "2026-09-05")


class TestUnassignHistoryAction(unittest.TestCase):
	def test_history_action_is_retrait(self):
		import inspect
		from log.api import distribution

		source = inspect.getsource(distribution.unassign_delivery_note)
		self.assertIn('"Retrait"', source)
		self.assertNotIn('"Désaffectation"', source)


class TestScheduleDeliveryNotesFlow(unittest.TestCase):
	def test_reuses_compatible_route_and_inserts_after_stops(self):
		import inspect
		from log.api import distribution

		source = inspect.getsource(distribution.schedule_delivery_notes)
		self.assertIn("_compatible_route", source)
		self.assertLess(source.index("_append_delivery_note"), source.index("target.insert"))

	def test_force_new_skips_compatible_match(self):
		import inspect
		from log.api import distribution

		source = inspect.getsource(distribution._compatible_route)
		self.assertIn('forceNew', source)
		self.assertLess(source.index("forceNew"), source.index("candidates"))
		self.assertIn("_new_draft_route", source)
		self.assertIn("next_free_slot", source)

	def test_force_new_moves_already_assigned_notes(self):
		import inspect
		from log.api import distribution

		source = inspect.getsource(distribution.schedule_delivery_notes)
		self.assertIn('forceNew', source)
		self.assertIn("_active_assignment", source)
		self.assertLess(source.index("forceNew"), source.index("_compatible_route"))

	def test_force_new_skips_in_place_reassign(self):
		import inspect
		from log.api import distribution

		source = inspect.getsource(distribution.reassign_delivery_note)
		self.assertIn("forceNew", source)
		self.assertLess(source.index("forceNew"), source.index("should_update_source_in_place"))


class TestDeleteDraftRouteFlow(unittest.TestCase):
	def test_delete_uses_force_and_ignore_permissions(self):
		import inspect
		from log.api import distribution

		source = inspect.getsource(distribution.delete_draft_route)
		self.assertIn("draft_route_delete_error", source)
		self.assertIn("_lock_route", source)
		self.assertIn("revision_matches", source)
		self.assertIn("frappe.delete_doc", source)
		self.assertIn("ignore_permissions=True", source)
		self.assertIn("force=True", source)


class TestPlanningDisplayStatusOverdue(unittest.TestCase):
	"""Extended overdue tests for kanban day navigation."""

	def test_unplanned_past_date_is_overdue(self):
		self.assertEqual(
			planning_display_status(
				{"planningStatus": "Non planifié", "status": "Préparé", "requestedDate": "2026-09-01"},
				"2026-09-03",
			),
			"En retard",
		)

	def test_planned_same_day_is_not_overdue(self):
		self.assertEqual(
			planning_display_status(
				{"planningStatus": "Planifié", "status": "Préparé", "requestedDate": "2026-09-03"},
				"2026-09-03",
			),
			"Planifié",
		)

	def test_delivered_past_date_is_not_overdue(self):
		self.assertEqual(
			planning_display_status(
				{"planningStatus": "Planifié", "status": "Livré", "requestedDate": "2026-09-01"},
				"2026-09-03",
			),
			"Planifié",
		)
