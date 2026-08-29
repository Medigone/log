import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import frappe

from log.api.distribution import FLEET_ROLES, FLEET_WRITE_ROLES, PLANNING_ROLES
from log.api.distribution_rules import has_any_role
from log.services import distribution_fleet as fleet


def _driver(**kwargs):
	defaults = {
		"name": "DRV-1",
		"label": "Karim",
		"status": "Actif",
		"active": True,
		"vehicle": "VEH-1",
		"license": {"alert": "valid"},
		"cashBalance": 0,
	}
	defaults.update(kwargs)
	return defaults


def _vehicle(**kwargs):
	defaults = {
		"name": "VEH-1",
		"status": "Disponible",
		"active": True,
		"driver": "DRV-1",
		"documents": [{"alert": "valid"}],
		"maintenanceAlert": None,
	}
	defaults.update(kwargs)
	return defaults


class TestFleetAlerts(unittest.TestCase):
	def test_document_alert_expired_expiring_valid(self):
		self.assertEqual(fleet.document_alert("2026-08-01", today_value="2026-08-29"), "expired")
		self.assertEqual(fleet.document_alert("2026-09-10", today_value="2026-08-29"), "expiring")
		self.assertEqual(fleet.document_alert("2026-12-01", today_value="2026-08-29"), "valid")
		self.assertIsNone(fleet.document_alert(None, today_value="2026-08-29"))

	def test_maintenance_alert_maps_expiry_vocabulary(self):
		self.assertEqual(fleet.maintenance_alert("2026-08-01", today_value="2026-08-29"), "due")
		self.assertEqual(fleet.maintenance_alert("2026-09-10", today_value="2026-08-29"), "upcoming")
		self.assertIsNone(fleet.maintenance_alert("2026-12-01", today_value="2026-08-29"))

	def test_serialize_document_marks_missing_file(self):
		row = SimpleNamespace(permis=None, valable=None)
		payload = fleet.serialize_document(fleet.DRIVER_DOCUMENTS["permis"], row, today_value="2026-08-29")
		self.assertEqual(payload["alert"], "missing")
		self.assertEqual(payload["key"], "permis")


class TestFleetKpis(unittest.TestCase):
	def test_driver_kpis_count_status_vehicle_license_and_cash(self):
		stats = fleet.summarize_driver_kpis(
			[
				_driver(cashBalance=1200),
				_driver(name="DRV-2", status="En congé", vehicle=None, license={"alert": "expired"}, cashBalance=0),
				_driver(name="DRV-3", status="Indisponible", active=False, vehicle=None, license={"alert": "expiring"}),
				_driver(name="DRV-4", vehicle=None, cashBalance=0),
			]
		)
		self.assertEqual(stats["total"], 4)
		self.assertEqual(stats["active"], 2)
		self.assertEqual(stats["onLeave"], 1)
		self.assertEqual(stats["unavailable"], 1)
		self.assertEqual(stats["withoutVehicle"], 2)
		self.assertEqual(stats["licenseAlerts"], 2)
		self.assertEqual(stats["cashToHandover"], 1)

	def test_vehicle_kpis_ignore_missing_documents_without_expiry(self):
		stats = fleet.summarize_vehicle_kpis(
			[
				_vehicle(),
				_vehicle(name="VEH-2", status="En maintenance", driver=None, documents=[{"alert": "missing"}]),
				_vehicle(name="VEH-3", status="Hors service", documents=[{"alert": "expired"}], maintenanceAlert="due"),
				_vehicle(name="VEH-4", driver=None, documents=[{"alert": "expiring"}], maintenanceAlert="upcoming"),
			]
		)
		self.assertEqual(stats["available"], 2)
		self.assertEqual(stats["maintenance"], 1)
		self.assertEqual(stats["outOfService"], 1)
		self.assertEqual(stats["withoutDriver"], 2)
		self.assertEqual(stats["documentAlerts"], 2)
		self.assertEqual(stats["maintenanceDue"], 2)

	def test_vehicle_label_joins_name_and_plate(self):
		self.assertEqual(fleet.vehicle_label("Camion A", "12345-123-16", "VEH-1"), "Camion A · 12345-123-16")
		self.assertEqual(fleet.vehicle_label(None, None, "VEH-1"), "VEH-1")

	def test_list_options_exposes_current_assignments(self):
		livreur = SimpleNamespace(name="DRV-1", nom="Karim", id_utilisateur="karim@test", vehicule="VEH-1", active=1)
		vehicle = SimpleNamespace(
			name="VEH-1",
			nom="Camion A",
			immatriculation="16-001",
			chauffeur="karim@test",
			nom_chauffeur="Karim",
			status="Disponible",
			active=1,
		)

		def fake_get_all(doctype, **kwargs):
			if doctype == "Livreur":
				return [livreur]
			if doctype == "Vehicule":
				return [vehicle]
			if doctype == "Has Role":
				return []
			if doctype == "Company":
				return []
			return []

		with patch.object(fleet.frappe, "get_all", side_effect=fake_get_all):
			payload = fleet.list_options()

		self.assertEqual(payload["vehicles"][0]["driverName"], "Karim")
		self.assertEqual(payload["vehicles"][0]["driver"], "DRV-1")
		self.assertEqual(payload["drivers"][0]["vehicleLabel"], "Camion A · 16-001")
		self.assertEqual(payload["drivers"][0]["vehicle"], "VEH-1")

	def test_driver_row_includes_live_vehicle_status(self):
		row = SimpleNamespace(
			name="DRV-1",
			nom="Karim",
			id_utilisateur="karim@test",
			status="Actif",
			active=1,
			vehicule="VEH-1",
			permis=None,
			valable=None,
		)
		db = Mock()
		db.get_value.return_value = {
			"nom": "Camion A",
			"immatriculation": "16-001",
			"status": "En maintenance",
			"active": 1,
		}
		with patch.object(fleet.frappe, "db", db):
			payload = fleet._serialize_driver_row(row, cash=None, vehicle_cache={}, today_value="2026-08-29")
		self.assertEqual(payload["vehicleLabel"], "Camion A · 16-001")
		self.assertEqual(payload["vehicleStatus"], "En maintenance")
		self.assertTrue(payload["vehicleActive"])


class TestFleetPermissions(unittest.TestCase):
	def test_planificateur_can_read_fleet_but_cannot_write(self):
		self.assertTrue(has_any_role({"Planificateur"}, FLEET_ROLES))
		self.assertTrue(has_any_role({"Planificateur"}, PLANNING_ROLES))
		self.assertFalse(has_any_role({"Planificateur"}, FLEET_WRITE_ROLES))
		self.assertTrue(has_any_role({"Responsable"}, FLEET_WRITE_ROLES))


class TestFleetMutations(unittest.TestCase):
	def test_create_driver_requires_identity(self):
		with (
			patch.object(fleet, "_", side_effect=lambda message, *args: message),
			patch.object(fleet.frappe, "throw", side_effect=frappe.ValidationError),
		):
			with self.assertRaises(frappe.ValidationError):
				fleet.create_driver({})

	def test_password_must_be_long_enough(self):
		with (
			patch.object(fleet, "_", side_effect=lambda message, *args: message),
			patch.object(fleet.frappe, "throw", side_effect=frappe.ValidationError),
			patch.object(fleet, "normalise_email", return_value="karim@example.com"),
			patch.object(fleet, "_existing_user_name", return_value=None),
		):
			with self.assertRaises(frappe.ValidationError):
				fleet.resolve_driver_user({"email": "karim@example.com", "firstName": "Karim", "password": "short"})

	def test_create_driver_creates_system_user_with_livreur_role(self):
		created: dict[str, dict] = {}
		db = Mock()
		db.get_value.return_value = None
		db.exists.return_value = False

		def fake_get_doc(payload, *args):
			if isinstance(payload, dict) and payload.get("doctype") == "User":
				doc = SimpleNamespace(name=payload["email"], flags=SimpleNamespace(), insert=Mock())
				created["user"] = payload
				return doc
			if isinstance(payload, dict) and payload.get("doctype") == "Livreur":
				doc = SimpleNamespace(name="DRV-NEW", insert=Mock())
				created["livreur"] = payload
				return doc
			raise AssertionError(payload)

		with (
			patch.object(fleet, "normalise_email", return_value="karim@example.com"),
			patch.object(fleet.frappe, "db", db),
			patch.object(fleet.frappe, "get_doc", side_effect=fake_get_doc),
			patch.object(fleet, "get_driver", return_value={"name": "DRV-NEW", "user": "karim@example.com"}),
		):
			result = fleet.create_driver(
				{"email": "karim@example.com", "firstName": "Karim", "lastName": "Bensaid", "password": "Secret123"}
			)

		self.assertEqual(created["user"]["user_type"], "System User")
		self.assertEqual(created["user"]["send_welcome_email"], 0)
		self.assertEqual(created["user"]["new_password"], "Secret123")
		self.assertEqual(created["user"]["roles"], [{"role": "Livreur"}])
		self.assertEqual(created["livreur"]["id_utilisateur"], "karim@example.com")
		self.assertEqual(result["name"], "DRV-NEW")

	def test_create_driver_rejects_email_already_linked(self):
		db = Mock()
		db.get_value.return_value = "karim@example.com"
		db.exists.return_value = True
		user_doc = SimpleNamespace(name="karim@example.com", enabled=1)

		with (
			patch.object(fleet, "normalise_email", return_value="karim@example.com"),
			patch.object(fleet.frappe, "db", db),
			patch.object(fleet.frappe, "get_doc", return_value=user_doc),
			patch.object(fleet, "_", side_effect=lambda message, *args: message),
			patch.object(fleet.frappe, "throw", side_effect=frappe.ValidationError),
		):
			with self.assertRaises(frappe.ValidationError):
				fleet.resolve_driver_user({"email": "karim@example.com", "firstName": "Karim", "password": "Secret123"})

	def test_create_driver_links_existing_user_and_adds_role(self):
		db = Mock()
		db.get_value.return_value = "karim@example.com"
		db.exists.return_value = False
		user_doc = SimpleNamespace(name="karim@example.com", enabled=1, roles=[], append=Mock(), save=Mock())
		user_doc.get = lambda key, default=None: [] if key == "roles" else default

		with (
			patch.object(fleet, "normalise_email", return_value="karim@example.com"),
			patch.object(fleet.frappe, "db", db),
			patch.object(fleet.frappe, "get_doc", return_value=user_doc),
		):
			name = fleet.resolve_driver_user({"email": "karim@example.com", "firstName": "Karim"})

		self.assertEqual(name, "karim@example.com")
		user_doc.append.assert_called_once_with("roles", {"role": "Livreur"})
		user_doc.save.assert_called_once()

	def test_assign_driver_vehicle_rejects_unknown_driver(self):
		db = Mock()
		db.exists.return_value = False
		with (
			patch.object(fleet.frappe, "db", db),
			patch.object(fleet, "_", side_effect=lambda message, *args: message),
			patch.object(fleet.frappe, "throw", side_effect=frappe.ValidationError),
		):
			with self.assertRaises(frappe.ValidationError):
				fleet.assign_driver_vehicle("DRV-X", "VEH-1")

	def test_assign_driver_vehicle_syncs_both_sides(self):
		driver = SimpleNamespace(name="DRV-1", id_utilisateur="karim@test", vehicule="VEH-OLD", save=Mock())
		old_vehicle = SimpleNamespace(name="VEH-OLD", chauffeur="karim@test", nom_chauffeur="Karim", save=Mock())
		new_vehicle = SimpleNamespace(name="VEH-NEW", chauffeur="nadir@test", nom_chauffeur="Nadir", save=Mock())
		db = Mock()
		db.exists.return_value = True

		def fake_get_doc(doctype, name):
			if doctype == "Livreur" and name == "DRV-1":
				return driver
			if doctype == "Vehicule" and name == "VEH-OLD":
				return old_vehicle
			if doctype == "Vehicule" and name == "VEH-NEW":
				return new_vehicle
			raise AssertionError((doctype, name))

		def fake_get_all(doctype, filters=None, pluck=None, **kwargs):
			if doctype == "Vehicule":
				return ["VEH-OLD"] if (filters or {}).get("chauffeur") == "karim@test" else []
			if doctype == "Livreur":
				return ["DRV-2"]
			return []

		with (
			patch.object(fleet.frappe, "db", db),
			patch.object(fleet.frappe, "get_doc", side_effect=fake_get_doc),
			patch.object(fleet.frappe, "get_all", side_effect=fake_get_all),
			patch.object(fleet, "_clear_driver_vehicle") as clear_other,
			patch.object(fleet, "_driver_for_user", return_value="DRV-2"),
			patch.object(fleet, "_commit_fleet_assignment_history"),
			patch.object(fleet, "get_driver", return_value={"name": "DRV-1", "vehicle": "VEH-NEW"}) as get_driver,
		):
			payload = fleet.assign_driver_vehicle("DRV-1", "VEH-NEW")

		self.assertEqual(old_vehicle.chauffeur, None)
		self.assertEqual(old_vehicle.nom_chauffeur, None)
		old_vehicle.save.assert_called_once()
		self.assertEqual(new_vehicle.chauffeur, "karim@test")
		new_vehicle.save.assert_called_once()
		self.assertEqual(driver.vehicule, "VEH-NEW")
		driver.save.assert_called()
		clear_other.assert_any_call("DRV-2")
		get_driver.assert_called_once_with("DRV-1")
		self.assertEqual(payload["vehicle"], "VEH-NEW")

	def test_assign_vehicle_driver_releases_livreur_previous_vehicle(self):
		driver = SimpleNamespace(name="DRV-1", id_utilisateur="karim@test", vehicule="VEH-OLD", save=Mock())
		old_vehicle = SimpleNamespace(name="VEH-OLD", chauffeur="karim@test", nom_chauffeur="Karim", save=Mock())
		new_vehicle = SimpleNamespace(name="VEH-NEW", chauffeur=None, nom_chauffeur=None, save=Mock())
		db = Mock()
		db.exists.return_value = True

		def fake_get_doc(doctype, name):
			if doctype == "Livreur" and name == "DRV-1":
				return driver
			if doctype == "Vehicule" and name == "VEH-OLD":
				return old_vehicle
			if doctype == "Vehicule" and name == "VEH-NEW":
				return new_vehicle
			raise AssertionError((doctype, name))

		def fake_get_all(doctype, filters=None, pluck=None, **kwargs):
			if doctype == "Vehicule":
				return ["VEH-OLD"] if (filters or {}).get("chauffeur") == "karim@test" else []
			if doctype == "Livreur":
				return []
			return []

		with (
			patch.object(fleet.frappe, "db", db),
			patch.object(fleet.frappe, "get_doc", side_effect=fake_get_doc),
			patch.object(fleet.frappe, "get_all", side_effect=fake_get_all),
			patch.object(fleet, "_driver_for_user", return_value=None),
			patch.object(fleet, "_commit_fleet_assignment_history"),
			patch.object(fleet, "get_driver", return_value={"name": "DRV-1", "vehicle": "VEH-NEW"}),
			patch.object(fleet, "get_vehicle", return_value={"name": "VEH-NEW", "driver": "DRV-1"}) as get_vehicle,
		):
			payload = fleet.assign_vehicle_driver("VEH-NEW", "DRV-1")

		self.assertEqual(old_vehicle.chauffeur, None)
		self.assertEqual(old_vehicle.nom_chauffeur, None)
		self.assertEqual(new_vehicle.chauffeur, "karim@test")
		self.assertEqual(driver.vehicule, "VEH-NEW")
		get_vehicle.assert_called_once_with("VEH-NEW")
		self.assertEqual(payload["driver"], "DRV-1")

	def test_assign_releases_vehicle_still_holding_chauffeur(self):
		driver = SimpleNamespace(name="DRV-1", id_utilisateur="karim@test", vehicule=None, save=Mock())
		old_vehicle = SimpleNamespace(name="VEH-OLD", chauffeur="karim@test", nom_chauffeur="Karim", save=Mock())
		new_vehicle = SimpleNamespace(name="VEH-NEW", chauffeur=None, nom_chauffeur=None, save=Mock())
		db = Mock()
		db.exists.return_value = True

		def fake_get_doc(doctype, name):
			if doctype == "Livreur" and name == "DRV-1":
				return driver
			if doctype == "Vehicule" and name == "VEH-OLD":
				return old_vehicle
			if doctype == "Vehicule" and name == "VEH-NEW":
				return new_vehicle
			raise AssertionError((doctype, name))

		def fake_get_all(doctype, filters=None, pluck=None, **kwargs):
			if doctype == "Vehicule" and (filters or {}).get("chauffeur") == "karim@test":
				return ["VEH-OLD"]
			return []

		with (
			patch.object(fleet.frappe, "db", db),
			patch.object(fleet.frappe, "get_doc", side_effect=fake_get_doc),
			patch.object(fleet.frappe, "get_all", side_effect=fake_get_all),
			patch.object(fleet, "_driver_for_user", return_value=None),
			patch.object(fleet, "_commit_fleet_assignment_history"),
			patch.object(fleet, "get_driver", return_value={"name": "DRV-1", "vehicle": "VEH-NEW"}),
		):
			fleet.assign_driver_vehicle("DRV-1", "VEH-NEW")

		self.assertEqual(old_vehicle.chauffeur, None)
		self.assertEqual(old_vehicle.nom_chauffeur, None)
		self.assertEqual(new_vehicle.chauffeur, "karim@test")
		self.assertEqual(driver.vehicule, "VEH-NEW")

	def test_vehicle_row_hides_stale_driver_name_without_chauffeur(self):
		row = SimpleNamespace(
			name="VEH-1",
			nom="Camion A",
			immatriculation="16-001",
			status="Disponible",
			active=1,
			chauffeur=None,
			nom_chauffeur="Karim",
			company="C1",
			warehouse=None,
			type_carb="Diesel",
			km=0,
			capacite_max_articles=None,
			cout_km=0,
			date_dernier_entretien=None,
			pdate_rochain_entretien=None,
			carte_grise=None,
			vignette=None,
			assurance=None,
			controle_technique=None,
			date_exp_assurance=None,
			date_exp_cont_tech=None,
		)
		payload = fleet._serialize_vehicle_row(row, drivers_by_user={}, today_value="2026-08-29")
		self.assertIsNone(payload["driver"])
		self.assertIsNone(payload["driverName"])
		self.assertIsNone(payload["imageUrl"])
		self.assertEqual(payload["nom"], "Camion A")
		self.assertEqual(payload["registration"], "16-001")

	def test_vehicle_row_exposes_image_url(self):
		row = SimpleNamespace(
			name="VEH-1",
			nom="Camion A",
			immatriculation="16-001",
			status="Disponible",
			active=1,
			chauffeur=None,
			nom_chauffeur=None,
			company="C1",
			warehouse=None,
			type_carb="Diesel",
			km=0,
			capacite_max_articles=None,
			cout_km=0,
			date_dernier_entretien=None,
			pdate_rochain_entretien=None,
			carte_grise=None,
			vignette=None,
			assurance=None,
			controle_technique=None,
			date_exp_assurance=None,
			date_exp_cont_tech=None,
			image="/files/van.png",
		)
		payload = fleet._serialize_vehicle_row(row, drivers_by_user={}, today_value="2026-08-29")
		self.assertEqual(payload["imageUrl"], "/files/van.png")

	def test_attach_document_accepts_vehicle_image(self):
		inserted = SimpleNamespace(file_url="/files/van.png")
		file_doc = SimpleNamespace(insert=Mock(return_value=inserted))
		db = Mock()
		db.exists.return_value = True
		with (
			patch.object(fleet.frappe, "db", db),
			patch.object(fleet.frappe, "get_doc", return_value=file_doc),
			patch.object(fleet, "get_vehicle", return_value={"name": "VEH-1", "imageUrl": "/files/van.png"}),
		):
			result = fleet.attach_document(
				doctype="Vehicule",
				name="VEH-1",
				field="image",
				filename="van.png",
				content=b"img",
			)
		db.set_value.assert_called_once_with("Vehicule", "VEH-1", {"image": "/files/van.png"})
		self.assertEqual(result["imageUrl"], "/files/van.png")

	def test_update_vehicle_applies_identity_fields(self):
		doc = SimpleNamespace(
			nom="Old",
			immatriculation="00",
			company="C0",
			status="Disponible",
			active=1,
			type_carb="Diesel",
			capacite_max_articles=10,
			km=1,
			cout_km=0,
			save=Mock(),
		)
		db = Mock()
		db.exists.return_value = True
		with (
			patch.object(fleet.frappe, "db", db),
			patch.object(fleet.frappe, "get_doc", return_value=doc),
			patch.object(fleet, "get_vehicle", return_value={"name": "VEH-1", "nom": "Van"}),
		):
			fleet.update_vehicle(
				{
					"name": "VEH-1",
					"label": "Van",
					"registration": "16-001",
					"company": "C1",
					"fuelType": "Essence",
					"capacity": 40,
					"km": 1200,
					"costPerKm": 12.5,
					"status": "En maintenance",
				}
			)
		self.assertEqual(doc.nom, "Van")
		self.assertEqual(doc.immatriculation, "16-001")
		self.assertEqual(doc.company, "C1")
		self.assertEqual(doc.type_carb, "Essence")
		self.assertEqual(doc.capacite_max_articles, 40)
		self.assertEqual(doc.km, 1200)
		self.assertEqual(doc.cout_km, 12.5)
		self.assertEqual(doc.status, "En maintenance")
		doc.save.assert_called_once()

	def test_create_entretien_rejects_unknown_vehicle(self):
		db = Mock()
		db.exists.side_effect = lambda doctype, name=None: doctype == "DocType"
		with (
			patch.object(fleet.frappe, "db", db),
			patch.object(fleet, "_", side_effect=lambda message, *args: message),
			patch.object(fleet.frappe, "throw", side_effect=frappe.ValidationError),
		):
			with self.assertRaises(frappe.ValidationError):
				fleet.create_entretien({"vehicle": "VEH-X", "status": "Programmé"})

	def test_create_entretien_planned_sets_next_maintenance(self):
		created: dict[str, dict] = {}
		entretien = SimpleNamespace(insert=Mock())
		vehicle_doc = SimpleNamespace(date_dernier_entretien=None, pdate_rochain_entretien=None, save=Mock())
		db = Mock()
		db.exists.return_value = True

		def fake_get_doc(*args, **kwargs):
			payload = args[0] if args else None
			if isinstance(payload, dict) and payload.get("doctype") == "Entretien Vehicule":
				created["entretien"] = payload
				return entretien
			if payload == "Vehicule":
				return vehicle_doc
			raise AssertionError(args)

		with (
			patch.object(fleet.frappe, "db", db),
			patch.object(fleet.frappe, "get_doc", side_effect=fake_get_doc),
			patch.object(fleet, "get_vehicle", return_value={"name": "VEH-1", "nextMaintenance": "2026-10-01"}) as get_vehicle,
		):
			result = fleet.create_entretien(
				{
					"vehicle": "VEH-1",
					"status": "Programmé",
					"type": "Préventif",
					"date": "2026-09-15",
					"nextMaintenance": "2026-10-01",
				}
			)

		self.assertEqual(created["entretien"]["vehicule"], "VEH-1")
		self.assertEqual(created["entretien"]["status"], "Programmé")
		entretien.insert.assert_called_once()
		self.assertEqual(vehicle_doc.pdate_rochain_entretien, "2026-10-01")
		vehicle_doc.save.assert_called_once()
		get_vehicle.assert_called_once_with("VEH-1")
		self.assertEqual(result["name"], "VEH-1")

	def test_create_entretien_completed_sets_last_maintenance(self):
		entretien = SimpleNamespace(insert=Mock())
		vehicle_doc = SimpleNamespace(date_dernier_entretien=None, pdate_rochain_entretien=None, save=Mock())
		db = Mock()
		db.exists.return_value = True

		def fake_get_doc(*args, **kwargs):
			payload = args[0] if args else None
			if isinstance(payload, dict):
				return entretien
			if payload == "Vehicule":
				return vehicle_doc
			raise AssertionError(args)

		with (
			patch.object(fleet.frappe, "db", db),
			patch.object(fleet.frappe, "get_doc", side_effect=fake_get_doc),
			patch.object(fleet, "get_vehicle", return_value={"name": "VEH-1"}),
		):
			fleet.create_entretien(
				{
					"vehicle": "VEH-1",
					"status": "Terminé",
					"type": "Correctif",
					"date": "2026-08-29",
					"dateEntretien": "2026-08-29",
					"km": 12500,
					"repairs": "Vidange",
				}
			)

		self.assertEqual(vehicle_doc.date_dernier_entretien, "2026-08-29")
		self.assertIsNone(vehicle_doc.pdate_rochain_entretien)
		vehicle_doc.save.assert_called_once()
		entretien.insert.assert_called_once()


class TestFleetAssignmentHistory(unittest.TestCase):
	def _assign_setup(self, *, previous_vehicle="VEH-OLD", target_chauffeur="nadir@test", other_drivers=None):
		driver = SimpleNamespace(name="DRV-1", id_utilisateur="karim@test", vehicule=previous_vehicle, save=Mock())
		old_vehicle = SimpleNamespace(name="VEH-OLD", chauffeur="karim@test", nom_chauffeur="Karim", save=Mock())
		new_vehicle = SimpleNamespace(name="VEH-NEW", chauffeur=target_chauffeur, nom_chauffeur="Nadir", save=Mock())
		db = Mock()
		db.exists.return_value = True
		held = ["VEH-OLD"] if previous_vehicle == "VEH-OLD" else []

		def fake_get_doc(doctype, name):
			if doctype == "Livreur" and name == "DRV-1":
				return driver
			if doctype == "Vehicule" and name == "VEH-OLD":
				return old_vehicle
			if doctype == "Vehicule" and name == "VEH-NEW":
				return new_vehicle
			raise AssertionError((doctype, name))

		def fake_get_all(doctype, filters=None, pluck=None, **kwargs):
			if doctype == "Vehicule":
				return held if (filters or {}).get("chauffeur") == "karim@test" else []
			if doctype == "Livreur":
				return list(other_drivers or [])
			return []

		return driver, old_vehicle, new_vehicle, db, fake_get_doc, fake_get_all

	def test_reassignment_records_release_displaced_and_new_pair(self):
		driver, old_vehicle, new_vehicle, db, fake_get_doc, fake_get_all = self._assign_setup(other_drivers=["DRV-2"])
		with (
			patch.object(fleet.frappe, "db", db),
			patch.object(fleet.frappe, "get_doc", side_effect=fake_get_doc),
			patch.object(fleet.frappe, "get_all", side_effect=fake_get_all),
			patch.object(fleet, "_driver_for_user", return_value="DRV-2"),
			patch.object(fleet, "_commit_fleet_assignment_history") as commit,
			patch.object(fleet, "get_driver", return_value={"name": "DRV-1"}),
		):
			fleet.assign_driver_vehicle("DRV-1", "VEH-NEW", motif="Rotation")

		events = commit.call_args.args[0]
		self.assertEqual([row["action"] for row in events], ["Désaffectation", "Désaffectation", "Réaffectation"])
		self.assertEqual(events[0]["livreur"], "DRV-1")
		self.assertEqual(events[0]["vehicule"], "VEH-OLD")
		self.assertEqual(events[1]["livreur"], "DRV-2")
		self.assertEqual(events[1]["vehicule"], "VEH-NEW")
		self.assertEqual(events[2]["livreur"], "DRV-1")
		self.assertEqual(events[2]["vehicule"], "VEH-NEW")
		self.assertEqual(events[2]["vehicule_avant"], "VEH-OLD")
		self.assertEqual(commit.call_args.kwargs["motif"], "Rotation")
		self.assertEqual(commit.call_args.kwargs["source"], "Distribution")
		self.assertEqual(old_vehicle.chauffeur, None)
		self.assertEqual(new_vehicle.chauffeur, "karim@test")
		self.assertEqual(driver.vehicule, "VEH-NEW")

	def test_first_assignment_records_affectation(self):
		driver, _old, new_vehicle, db, fake_get_doc, fake_get_all = self._assign_setup(
			previous_vehicle=None, target_chauffeur=None, other_drivers=[]
		)
		driver.vehicule = None
		new_vehicle.chauffeur = None
		new_vehicle.nom_chauffeur = None

		def fake_get_all(doctype, filters=None, pluck=None, **kwargs):
			return []

		with (
			patch.object(fleet.frappe, "db", db),
			patch.object(fleet.frappe, "get_doc", side_effect=fake_get_doc),
			patch.object(fleet.frappe, "get_all", side_effect=fake_get_all),
			patch.object(fleet, "_driver_for_user", return_value=None),
			patch.object(fleet, "_commit_fleet_assignment_history") as commit,
			patch.object(fleet, "get_driver", return_value={"name": "DRV-1"}),
		):
			fleet.assign_driver_vehicle("DRV-1", "VEH-NEW")

		events = commit.call_args.args[0]
		self.assertEqual(len(events), 1)
		self.assertEqual(events[0]["action"], "Affectation")
		self.assertIsNone(events[0]["vehicule_avant"])
		self.assertEqual(events[0]["vehicule_apres"], "VEH-NEW")

	def test_unassign_records_desaffectation(self):
		driver, old_vehicle, _new, db, fake_get_doc, fake_get_all = self._assign_setup(other_drivers=[])
		with (
			patch.object(fleet.frappe, "db", db),
			patch.object(fleet.frappe, "get_doc", side_effect=fake_get_doc),
			patch.object(fleet.frappe, "get_all", side_effect=fake_get_all),
			patch.object(fleet, "_commit_fleet_assignment_history") as commit,
			patch.object(fleet, "get_driver", return_value={"name": "DRV-1", "vehicle": None}),
		):
			fleet.assign_driver_vehicle("DRV-1", None)

		events = commit.call_args.args[0]
		self.assertEqual(len(events), 1)
		self.assertEqual(events[0]["action"], "Désaffectation")
		self.assertEqual(events[0]["vehicule"], "VEH-OLD")
		self.assertIsNone(events[0]["vehicule_apres"])
		self.assertIsNone(driver.vehicule)
		self.assertIsNone(old_vehicle.chauffeur)

	def test_same_assignment_does_not_record_history(self):
		driver, _old, new_vehicle, db, fake_get_doc, _fake_get_all = self._assign_setup(
			previous_vehicle="VEH-NEW", target_chauffeur="karim@test", other_drivers=[]
		)
		driver.vehicule = "VEH-NEW"
		new_vehicle.chauffeur = "karim@test"

		def fake_get_all(doctype, filters=None, pluck=None, **kwargs):
			if doctype == "Vehicule" and (filters or {}).get("chauffeur") == "karim@test":
				return ["VEH-NEW"]
			return []

		with (
			patch.object(fleet.frappe, "db", db),
			patch.object(fleet.frappe, "get_doc", side_effect=fake_get_doc),
			patch.object(fleet.frappe, "get_all", side_effect=fake_get_all),
			patch.object(fleet, "_driver_for_user", return_value=None),
			patch.object(fleet, "_commit_fleet_assignment_history") as commit,
			patch.object(fleet, "get_driver", return_value={"name": "DRV-1", "vehicle": "VEH-NEW"}),
		):
			fleet.assign_driver_vehicle("DRV-1", "VEH-NEW")

		commit.assert_called_once()
		self.assertEqual(commit.call_args.args[0], [])
		new_vehicle.save.assert_not_called()
		driver.save.assert_not_called()

	def test_commit_history_inserts_immutable_rows(self):
		inserted = []

		def fake_get_doc(payload, *args, **kwargs):
			self.assertEqual(payload["doctype"], "Historique Affectation Flotte")
			doc = SimpleNamespace(insert=Mock())
			inserted.append(payload)
			return doc

		db = Mock()
		db.exists.return_value = True
		with (
			patch.object(fleet.frappe, "db", db),
			patch.object(fleet.frappe, "get_doc", side_effect=fake_get_doc),
			patch.object(fleet.frappe, "session", SimpleNamespace(user="admin@test")),
			patch.object(fleet.frappe.utils, "now_datetime", return_value="2026-08-29 21:00:00"),
		):
			fleet._commit_fleet_assignment_history(
				[
					{
						"action": "Affectation",
						"livreur": "DRV-1",
						"vehicule": "VEH-1",
						"livreur_avant": None,
						"vehicule_avant": None,
						"livreur_apres": "DRV-1",
						"vehicule_apres": "VEH-1",
					}
				],
				motif="Audit",
				source="Desk",
			)

		self.assertEqual(len(inserted), 1)
		self.assertEqual(inserted[0]["utilisateur"], "admin@test")
		self.assertEqual(inserted[0]["source"], "Desk")
		self.assertEqual(inserted[0]["motif"], "Audit")
		self.assertEqual(inserted[0]["date_evenement"], "2026-08-29 21:00:00")

	def test_seed_current_assignments_skips_existing(self):
		db = Mock()

		def fake_exists(doctype, name=None):
			if doctype == "DocType":
				return True
			if doctype == fleet.FLEET_ASSIGNMENT_HISTORY and isinstance(name, dict):
				return name.get("livreur") == "DRV-EXISTS"
			return False

		db.exists.side_effect = fake_exists
		with (
			patch.object(fleet.frappe, "db", db),
			patch.object(
				fleet.frappe,
				"get_all",
				return_value=[
					SimpleNamespace(name="DRV-EXISTS", vehicule="VEH-1"),
					SimpleNamespace(name="DRV-NEW", vehicule="VEH-2"),
				],
			),
			patch.object(fleet, "_commit_fleet_assignment_history") as commit,
			patch.object(fleet.frappe.utils, "now_datetime", return_value="2026-08-29 21:00:00"),
		):
			created = fleet.seed_current_fleet_assignments()

		self.assertEqual(created, 1)
		commit.assert_called_once()
		self.assertEqual(commit.call_args.args[0][0]["livreur"], "DRV-NEW")
		self.assertEqual(commit.call_args.kwargs["source"], "Initialisation")

	def test_livreur_desk_hook_forwards_previous_vehicle(self):
		from log.log.doctype.livreur.livreur import Livreur

		doc = object.__new__(Livreur)
		doc.name = "DRV-1"
		doc.vehicule = "VEH-2"
		doc.flags = frappe._dict()
		with (
			patch.object(Livreur, "has_value_changed", return_value=True),
			patch.object(Livreur, "get_doc_before_save", return_value=SimpleNamespace(vehicule="VEH-1")),
			patch("log.services.distribution_fleet.assign_driver_vehicle") as assign,
		):
			doc.on_update()
		assign.assert_called_once_with("DRV-1", "VEH-2", source="Desk", previous_vehicle="VEH-1")

	def test_livreur_desk_hook_skips_when_sync_flag_set(self):
		from log.log.doctype.livreur.livreur import Livreur

		doc = object.__new__(Livreur)
		doc.name = "DRV-1"
		doc.vehicule = "VEH-2"
		doc.flags = frappe._dict(fleet_assignment_sync=True)
		with patch("log.services.distribution_fleet.assign_driver_vehicle") as assign:
			doc.on_update()
		assign.assert_not_called()

	def test_vehicule_desk_hook_assigns_resolved_driver(self):
		from log.log.doctype.vehicule.vehicule import Vehicule

		doc = object.__new__(Vehicule)
		doc.name = "VEH-1"
		doc.chauffeur = "karim@test"
		doc.flags = frappe._dict()
		with (
			patch.object(Vehicule, "has_value_changed", return_value=True),
			patch("log.services.distribution_fleet._driver_for_user", return_value="DRV-1"),
			patch("log.services.distribution_fleet.assign_vehicle_driver") as assign,
		):
			doc.on_update()
		assign.assert_called_once_with("VEH-1", "DRV-1", source="Desk")

	def test_assignment_history_payload_maps_labels(self):
		row = SimpleNamespace(
			name="HIST-AFF-00001",
			action="Affectation",
			date_evenement="2026-08-29 21:00:00",
			utilisateur="admin@test",
			source="Distribution",
			motif="Rotation",
			livreur="DRV-1",
			vehicule="VEH-1",
			livreur_avant=None,
			vehicule_avant=None,
			livreur_apres="DRV-1",
			vehicule_apres="VEH-1",
		)
		db = Mock()
		db.exists.return_value = True
		db.get_value.side_effect = lambda doctype, name, field: "Karim" if doctype == "Livreur" else None
		with (
			patch.object(fleet.frappe, "db", db),
			patch.object(fleet.frappe, "get_all", return_value=[row]),
			patch.object(fleet.frappe.utils, "get_fullname", return_value="Admin"),
			patch.object(fleet, "_vehicle_label_from_name", return_value="Camion A · 16-001"),
		):
			payload = fleet.assignment_history(driver="DRV-1")
		self.assertEqual(payload[0]["action"], "Affectation")
		self.assertEqual(payload[0]["driverLabel"], "Karim")
		self.assertEqual(payload[0]["userLabel"], "Admin")
		self.assertEqual(payload[0]["vehicleLabel"], "Camion A · 16-001")
		self.assertEqual(payload[0]["reason"], "Rotation")
