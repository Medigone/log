# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def on_update_delivery_note(doc, method=None):
	"""
	Hook appelé lors de la mise à jour d'un Delivery Note.
	Gère les transferts de stock vers/entre entrepôts de véhicules.
	"""
	# Vérifier si le custom_statut a changé vers "Enlevé"
	handle_enleve_transition(doc)
	
	# Vérifier si le véhicule a changé après un transfert initial
	handle_vehicle_change(doc)


def handle_enleve_transition(doc):
	"""
	Gère la transition vers l'état "Enlevé" :
	- Crée un transfert de stock depuis l'entrepôt par défaut vers l'entrepôt du véhicule
	"""
	# Lire le statut actuel depuis le champ custom_statut
	current_status = doc.get("custom_statut")
	
	# Si le statut n'est pas "Enlevé", on ne fait rien
	if current_status != "Enlevé":
		return
	
	# Vérifier l'ancien statut pour détecter la transition vers "Enlevé"
	# Utiliser get_doc_before_save() car on est dans on_update (après sauvegarde)
	doc_before = doc.get_doc_before_save()
	if doc_before:
		previous_status = doc_before.get("custom_statut")
		# Si on était déjà à "Enlevé", on ne refait pas le transfert initial
		if previous_status == "Enlevé":
			return
	
	if doc.custom_stock_transferred:
		# Le transfert initial a déjà été effectué
		return
	
	if not doc.get("custom_véhicule"):
		frappe.msgprint(_("Aucun véhicule sélectionné. Le transfert de stock n'a pas été effectué."), indicator="orange")
		return
	
	# Récupérer l'entrepôt du véhicule
	vehicle_warehouse = frappe.db.get_value("Vehicule", doc.custom_véhicule, "warehouse")
	
	if not vehicle_warehouse:
		frappe.throw(_("Le véhicule {0} n'a pas d'entrepôt associé. Veuillez vérifier la configuration du véhicule.").format(doc.custom_véhicule))
	
	# Récupérer l'entrepôt source (entrepôt par défaut de la société)
	source_warehouse = get_default_company_warehouse(doc.company)
	
	if not source_warehouse:
		frappe.throw(_("Aucun entrepôt par défaut trouvé pour la société {0}").format(doc.company))
	
	if source_warehouse == vehicle_warehouse:
		frappe.msgprint(_("L'entrepôt source et destination sont identiques. Aucun transfert nécessaire."), indicator="orange")
		return
	
	# Créer le Stock Entry pour le transfert
	try:
		stock_entry = create_material_transfer(
			doc=doc,
			source_warehouse=source_warehouse,
			target_warehouse=vehicle_warehouse,
			purpose="Transfert vers véhicule"
		)
		
		# Marquer le transfert comme effectué
		frappe.db.set_value("Delivery Note", doc.name, {
			"custom_stock_transferred": 1,
			"custom_last_transfer_vehicle": doc.custom_véhicule
		}, update_modified=False)
		
		frappe.msgprint(
			_("Stock transféré vers l'entrepôt du véhicule. Stock Entry: {0}").format(
				frappe.utils.get_link_to_form("Stock Entry", stock_entry.name)
			),
			indicator="green"
		)
		
	except Exception as e:
		frappe.log_error(
			title=_("Erreur lors du transfert de stock - Delivery Note {0}").format(doc.name),
			message=str(e)
		)
		frappe.throw(_("Erreur lors du transfert de stock : {0}").format(str(e)))


def handle_vehicle_change(doc):
	"""
	Gère le changement de véhicule après un transfert initial :
	- Crée un transfert de l'ancien entrepôt véhicule vers le nouveau
	"""
	# Vérifier si un transfert initial a été effectué
	if not doc.custom_stock_transferred:
		return
	
	# Vérifier si le véhicule a changé
	if not doc.custom_last_transfer_vehicle:
		return
	
	current_vehicle = doc.get("custom_véhicule")
	last_transfer_vehicle = doc.custom_last_transfer_vehicle
	
	if current_vehicle == last_transfer_vehicle:
		# Pas de changement de véhicule
		return
	
	if not current_vehicle:
		frappe.msgprint(_("Le véhicule a été retiré. Aucun transfert effectué."), indicator="orange")
		return
	
	# Récupérer les entrepôts des deux véhicules
	old_vehicle_warehouse = frappe.db.get_value("Vehicule", last_transfer_vehicle, "warehouse")
	new_vehicle_warehouse = frappe.db.get_value("Vehicule", current_vehicle, "warehouse")
	
	if not old_vehicle_warehouse:
		frappe.throw(_("L'ancien véhicule {0} n'a pas d'entrepôt associé.").format(last_transfer_vehicle))
	
	if not new_vehicle_warehouse:
		frappe.throw(_("Le nouveau véhicule {0} n'a pas d'entrepôt associé.").format(current_vehicle))
	
	if old_vehicle_warehouse == new_vehicle_warehouse:
		frappe.msgprint(_("Les deux véhicules utilisent le même entrepôt. Aucun transfert nécessaire."), indicator="orange")
		return
	
	# Créer le transfert entre les entrepôts des véhicules
	try:
		stock_entry = create_material_transfer(
			doc=doc,
			source_warehouse=old_vehicle_warehouse,
			target_warehouse=new_vehicle_warehouse,
			purpose="Transfert entre véhicules"
		)
		
		# Mettre à jour le dernier véhicule transféré
		frappe.db.set_value("Delivery Note", doc.name, 
			"custom_last_transfer_vehicle", current_vehicle, 
			update_modified=False
		)
		
		frappe.msgprint(
			_("Stock transféré du véhicule {0} vers le véhicule {1}. Stock Entry: {2}").format(
				last_transfer_vehicle,
				current_vehicle,
				frappe.utils.get_link_to_form("Stock Entry", stock_entry.name)
			),
			indicator="green"
		)
		
	except Exception as e:
		frappe.log_error(
			title=_("Erreur lors du transfert entre véhicules - Delivery Note {0}").format(doc.name),
			message=str(e)
		)
		frappe.throw(_("Erreur lors du transfert de stock entre véhicules : {0}").format(str(e)))


def create_material_transfer(doc, source_warehouse, target_warehouse, purpose="Material Transfer"):
	"""
	Crée un Stock Entry de type Material Transfer.
	
	Args:
		doc: Le Delivery Note
		source_warehouse: Entrepôt source
		target_warehouse: Entrepôt destination
		purpose: Raison du transfert
	
	Returns:
		Le Stock Entry créé et soumis
	"""
	stock_entry = frappe.new_doc("Stock Entry")
	stock_entry.stock_entry_type = "Material Transfer"
	stock_entry.company = doc.company
	stock_entry.from_warehouse = source_warehouse
	stock_entry.to_warehouse = target_warehouse
	stock_entry.remarks = _("{0} - Delivery Note: {1}").format(purpose, doc.name)
	
	# Ajouter les articles du Delivery Note
	for item in doc.items:
		stock_entry.append("items", {
			"item_code": item.item_code,
			"qty": item.qty,
			"uom": item.uom,
			"stock_uom": item.stock_uom,
			"conversion_factor": item.conversion_factor or 1,
			"s_warehouse": source_warehouse,
			"t_warehouse": target_warehouse,
			"batch_no": item.batch_no if hasattr(item, "batch_no") else None,
			"serial_no": item.serial_no if hasattr(item, "serial_no") else None,
		})
	
	stock_entry.insert(ignore_permissions=True)
	stock_entry.submit()
	
	return stock_entry


def get_default_company_warehouse(company):
	"""
	Récupère l'entrepôt par défaut de la société pour les transferts sortants.
	
	Args:
		company: Nom de la société
	
	Returns:
		Le nom de l'entrepôt par défaut ou None
	"""
	# D'abord essayer l'entrepôt par défaut depuis les Paramètres du Stock
	try:
		default_warehouse = frappe.db.get_single_value("Stock Settings", "default_warehouse")
		if default_warehouse:
			# Vérifier que l'entrepôt appartient à la bonne société
			warehouse_company = frappe.db.get_value("Warehouse", default_warehouse, "company")
			if warehouse_company == company:
				return default_warehouse
	except Exception:
		pass
	
	# Sinon chercher un entrepôt non-groupe de la société
	warehouse = frappe.db.get_value(
		"Warehouse",
		{
			"company": company,
			"is_group": 0,
			"disabled": 0
		},
		"name",
		order_by="creation"
	)
	
	return warehouse


def validate_delivery_note(doc, method=None):
	"""
	Validation du Delivery Note avant sauvegarde.
	Vérifie que le véhicule sélectionné a un entrepôt associé.
	"""
	if doc.get("custom_véhicule"):
		vehicle_warehouse = frappe.db.get_value("Vehicule", doc.custom_véhicule, "warehouse")
		if not vehicle_warehouse:
			frappe.msgprint(
				_("Attention : Le véhicule {0} n'a pas d'entrepôt associé. Le transfert de stock ne pourra pas être effectué.").format(doc.custom_véhicule),
				indicator="orange",
				alert=True
			)

