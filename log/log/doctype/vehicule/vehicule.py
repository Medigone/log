# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class Vehicule(Document):
	def validate(self):
		"""Validation avant sauvegarde"""
		if not self.immatriculation and not self.nom:
			frappe.throw(_("Veuillez renseigner au moins l'immatriculation ou le nom du véhicule"))

	def after_insert(self):
		"""Créer automatiquement un entrepôt pour ce véhicule après création"""
		self.create_vehicle_warehouse()
		self._sync_fleet_assignment(is_insert=True)

	def on_update(self):
		if getattr(self.flags, "fleet_assignment_sync", False):
			return
		if not self.has_value_changed("chauffeur"):
			return
		self._sync_fleet_assignment()

	def _sync_fleet_assignment(self, *, is_insert: bool = False):
		if getattr(self.flags, "fleet_assignment_sync", False):
			return
		if is_insert and not self.chauffeur:
			return
		from log.services.distribution_fleet import _driver_for_user, assign_vehicle_driver

		if self.chauffeur:
			driver = _driver_for_user(self.chauffeur)
			if not driver:
				frappe.throw(_("Aucun livreur n'est lié à ce compte."))
			assign_vehicle_driver(self.name, driver, source="Desk")
		else:
			assign_vehicle_driver(self.name, None, source="Desk")

	def create_vehicle_warehouse(self):
		"""Créer un entrepôt dédié pour ce véhicule"""
		if self.warehouse:
			# L'entrepôt existe déjà
			return

		if not self.company:
			frappe.throw(_("Veuillez sélectionner une société avant de créer le véhicule"))

		# Récupérer l'entrepôt racine par défaut de la société
		parent_warehouse = self.get_default_warehouse()

		# Créer le nom de l'entrepôt basé sur l'immatriculation
		warehouse_name = f"{self.immatriculation or self.nom} - VEH"

		# Vérifier si l'entrepôt existe déjà
		if frappe.db.exists("Warehouse", {"warehouse_name": warehouse_name, "company": self.company}):
			existing_warehouse = frappe.db.get_value(
				"Warehouse",
				{"warehouse_name": warehouse_name, "company": self.company},
				"name"
			)
			frappe.db.set_value("Vehicule", self.name, "warehouse", existing_warehouse)
			frappe.msgprint(_("Entrepôt existant '{0}' associé au véhicule").format(existing_warehouse))
			return

		# Créer le nouvel entrepôt
		warehouse = frappe.get_doc({
			"doctype": "Warehouse",
			"warehouse_name": warehouse_name,
			"company": self.company,
			"parent_warehouse": parent_warehouse,
			"is_group": 0,
			"warehouse_type": "Transit"
		})
		warehouse.insert(ignore_permissions=True)

		# Mettre à jour le véhicule avec le nouvel entrepôt
		frappe.db.set_value("Vehicule", self.name, "warehouse", warehouse.name)
		frappe.msgprint(_("Entrepôt '{0}' créé pour le véhicule '{1}'").format(warehouse.name, self.name))

	def get_default_warehouse(self):
		"""Récupérer l'entrepôt racine par défaut de la société"""
		# Essayer d'abord l'entrepôt par défaut de la société (si le champ existe)
		try:
			default_warehouse = frappe.db.get_value(
				"Company",
				self.company,
				"default_warehouse"
			)
			if default_warehouse:
				# Retourner le parent de l'entrepôt par défaut s'il existe
				parent = frappe.db.get_value("Warehouse", default_warehouse, "parent_warehouse")
				return parent or default_warehouse
		except Exception:
			# Le champ default_warehouse n'existe pas, continuer avec la méthode alternative
			pass

		# Chercher l'entrepôt racine de la société (entrepôt groupe sans parent)
		root_warehouse = frappe.db.get_value(
			"Warehouse",
			{"company": self.company, "is_group": 1, "parent_warehouse": ["is", "not set"]},
			"name"
		)

		if not root_warehouse:
			# Chercher n'importe quel entrepôt groupe de la société
			root_warehouse = frappe.db.get_value(
				"Warehouse",
				{"company": self.company, "is_group": 1},
				"name"
			)

		if not root_warehouse:
			# En dernier recours, chercher n'importe quel entrepôt de la société
			root_warehouse = frappe.db.get_value(
				"Warehouse",
				{"company": self.company, "disabled": 0},
				"name"
			)

		if not root_warehouse:
			frappe.throw(_("Aucun entrepôt trouvé pour la société {0}. Veuillez créer un entrepôt d'abord.").format(self.company))

		return root_warehouse


@frappe.whitelist()
def get_vehicle_warehouse(vehicle_name):
	"""
	Récupère l'entrepôt associé à un véhicule.
	
	Args:
		vehicle_name: Nom du véhicule
	
	Returns:
		Dict avec warehouse et nom du véhicule
	"""
	if not vehicle_name:
		return None
	
	return frappe.db.get_value(
		"Vehicule",
		vehicle_name,
		["warehouse", "nom"],
		as_dict=True
	)


@frappe.whitelist()
def create_warehouses_for_existing_vehicles():
	"""
	Crée les entrepôts pour tous les véhicules existants qui n'en ont pas.
	Fonction utilitaire à exécuter après la migration.
	"""
	vehicles = frappe.get_all(
		"Vehicule",
		filters={"warehouse": ["is", "not set"]},
		fields=["name", "company", "immatriculation", "nom"]
	)
	
	created_count = 0
	errors = []
	
	for vehicle_data in vehicles:
		try:
			vehicle = frappe.get_doc("Vehicule", vehicle_data.name)
			if vehicle.company:
				vehicle.create_vehicle_warehouse()
				created_count += 1
			else:
				errors.append(_("Véhicule {0} : société non renseignée").format(vehicle_data.name))
		except Exception as e:
			errors.append(_("Véhicule {0} : {1}").format(vehicle_data.name, str(e)))
	
	message = _("{0} entrepôt(s) créé(s)").format(created_count)
	if errors:
		message += "\n\n" + _("Erreurs :") + "\n" + "\n".join(errors)
	
	return {
		"created": created_count,
		"errors": errors,
		"message": message
	}
