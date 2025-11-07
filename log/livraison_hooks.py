# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def update_livraisons_on_delivery_note_change(doc, method):
	"""Update Livraisons when a Delivery Note's custom_date_de_livraison changes."""
	# Vérifier si la date de livraison a changé
	if not doc.get("__islocal") and doc.has_value_changed("custom_date_de_livraison"):
		old_date = doc.get_db_value("custom_date_de_livraison")
		new_date = doc.custom_date_de_livraison
		
		# Si l'ancienne date existe, retirer le bon de livraison des livraisons de cette date
		if old_date:
			retirer_bon_de_livraison_des_livraisons(doc.name, old_date)
		
		# Si la nouvelle date existe, ajouter le bon de livraison aux livraisons de cette date
		if new_date:
			ajouter_bon_de_livraison_aux_livraisons(doc.name, new_date)


def retirer_bon_de_livraison_des_livraisons(bon_de_livraison_name, date_livraison):
	"""Retire un bon de livraison de toutes les livraisons d'une date donnée."""
	livraisons = frappe.get_all("Livraison",
		filters={"date_liv": date_livraison, "docstatus": 0},
		fields=["name", "batch_id"]
	)
	
	for livraison in livraisons:
		# Ne pas modifier les livraisons créées automatiquement
		if livraison.batch_id:
			continue
			
		try:
			livraison_doc = frappe.get_doc("Livraison", livraison.name)
			
			# Retirer le bon de livraison
			livraison_doc.bons_de_livraison = [
				row for row in livraison_doc.bons_de_livraison 
				if row.bon_de_livraison != bon_de_livraison_name
			]
			
			# Mettre à jour les colis et totaux
			livraison_doc.sync_colis_from_bons_de_livraison()
			livraison_doc.calculate_totals()
			livraison_doc.save()
			
		except Exception as e:
			frappe.log_error(f"Erreur lors de la suppression du bon {bon_de_livraison_name} de la livraison {livraison.name}: {str(e)}")


def ajouter_bon_de_livraison_aux_livraisons(bon_de_livraison_name, date_livraison):
	"""Ajoute un bon de livraison aux livraisons d'une date donnée."""
	# Récupérer les informations du bon de livraison
	bon_info = frappe.get_doc("Delivery Note", bon_de_livraison_name)
	
	# Trouver les livraisons existantes pour cette date
	livraisons = frappe.get_all("Livraison",
		filters={"date_liv": date_livraison, "docstatus": 0},
		fields=["name", "batch_id"]
	)
	
	# Si aucune livraison n'existe, ne rien faire (l'utilisateur devra en créer une)
	if not livraisons:
		return
	
	# Ajouter le bon de livraison à toutes les livraisons de cette date
	for livraison in livraisons:
		# Ne pas modifier les livraisons créées automatiquement
		if livraison.batch_id:
			continue
			
		try:
			livraison_doc = frappe.get_doc("Livraison", livraison.name)
			
			# Vérifier si le bon de livraison n'est pas déjà présent
			existing_dns = [row.bon_de_livraison for row in livraison_doc.bons_de_livraison]
			if bon_de_livraison_name not in existing_dns:
				# Ajouter le bon de livraison
				livraison_doc.append("bons_de_livraison", {
					"bon_de_livraison": bon_de_livraison_name,
					"customer": bon_info.customer,
					"custom_date_de_livraison": bon_info.custom_date_de_livraison,
					"custom_commune": bon_info.custom_commune,
					"custom_wilaya": bon_info.custom_wilaya,
					"total_qty": bon_info.total_qty,
					"grand_total": bon_info.grand_total,
					"status": bon_info.status
				})
				
				# Mettre à jour les colis et totaux
				livraison_doc.sync_colis_from_bons_de_livraison()
				livraison_doc.calculate_totals()
				livraison_doc.save()
				
		except Exception as e:
			frappe.log_error(f"Erreur lors de l'ajout du bon {bon_de_livraison_name} à la livraison {livraison.name}: {str(e)}")


def validate_delivery_note_deletion(doc, method):
	"""Empêche la suppression d'un bon de livraison avec des colis critiques"""
	
	# Statuts qui bloquent la suppression
	BLOCKING_STATUSES = ["Livré", "Partiellement Livré", "Enlevé", "Non Livré"]
	
	# Vérifier les colis liés avec statuts bloquants
	colis_critiques = frappe.get_all("Colis", 
		filters={
			"bl": doc.name,
			"status": ["in", BLOCKING_STATUSES],
			"docstatus": ["<", 2]
		},
		fields=["name", "status"]
	)
	
	if colis_critiques:
		# Grouper par statut pour un message plus clair
		status_groups = {}
		for colis in colis_critiques:
			status = colis.status
			if status not in status_groups:
				status_groups[status] = []
			status_groups[status].append(colis.name)
		
		# Construire le message d'erreur
		error_parts = []
		for status, colis_list in status_groups.items():
			count = len(colis_list)
			colis_display = ', '.join(colis_list[:3])
			if count > 3:
				colis_display += f" (et {count - 3} autres)"
			error_parts.append(f"{count} colis '{status}': {colis_display}")
		
		frappe.throw(
			_(f"❌ Impossible de supprimer ce bon de livraison.\n\n"
			  f"Des colis sont en cours de traitement :\n"
			  f"• {chr(10).join(['• ' + part for part in error_parts])}\n\n"
			  f"💡 Vous ne pouvez supprimer que les bons avec des colis ayant les statuts : "
			  f"'Nouveau', 'Préparé' ou 'Annulé'")
		)

@frappe.whitelist()
def test_delivery_note_deletion_validation(delivery_note_name):
	"""Fonction utilitaire pour tester la validation de suppression
	
	Args:
		delivery_note_name (str): Nom du bon de livraison à tester
	
	Returns:
		dict: Résultat du test avec détails des colis
	"""
	try:
		# Récupérer le bon de livraison
		if not frappe.db.exists("Delivery Note", delivery_note_name):
			return {
				"success": False,
				"message": f"Bon de livraison {delivery_note_name} introuvable"
			}
		
		doc = frappe.get_doc("Delivery Note", delivery_note_name)
		
		# Récupérer tous les colis liés
		all_colis = frappe.get_all("Colis",
			filters={
				"bl": doc.name,
				"docstatus": ["<", 2]
			},
			fields=["name", "status"]
		)
		
		if not all_colis:
			return {
				"success": True,
				"can_delete": True,
				"message": f"✅ Aucun colis lié. Suppression autorisée.",
				"colis_count": 0,
				"colis_details": []
			}
		
		# Grouper par statut
		BLOCKING_STATUSES = ["Livré", "Partiellement Livré", "Enlevé", "Non Livré"]
		ALLOWED_STATUSES = ["Nouveau", "Préparé", "Annulé"]
		
		status_groups = {}
		blocking_colis = []
		allowed_colis = []
		
		for colis in all_colis:
			status = colis.status
			if status not in status_groups:
				status_groups[status] = []
			status_groups[status].append(colis.name)
			
			if status in BLOCKING_STATUSES:
				blocking_colis.append(colis)
			elif status in ALLOWED_STATUSES:
				allowed_colis.append(colis)
		
		can_delete = len(blocking_colis) == 0
		
		# Construire le message
		if can_delete:
			message = f"✅ Suppression autorisée. Tous les colis ont des statuts non critiques."
		else:
			error_parts = []
			for status, colis_list in status_groups.items():
				if status in BLOCKING_STATUSES:
					count = len(colis_list)
					colis_display = ', '.join(colis_list[:3])
					if count > 3:
						colis_display += f" (et {count - 3} autres)"
					error_parts.append(f"{count} colis '{status}': {colis_display}")
			
			message = f"❌ Suppression bloquée par {len(blocking_colis)} colis critiques :\n• " + "\n• ".join(error_parts)
		
		return {
			"success": True,
			"can_delete": can_delete,
			"message": message,
			"colis_count": len(all_colis),
			"blocking_colis_count": len(blocking_colis),
			"allowed_colis_count": len(allowed_colis),
			"status_summary": {status: len(colis_list) for status, colis_list in status_groups.items()},
			"colis_details": [{"name": c.name, "status": c.status} for c in all_colis]
		}
		
	except Exception as e:
		frappe.log_error(f"Erreur lors du test de validation pour {delivery_note_name}: {str(e)}", 
						"Test validation suppression")
		return {
			"success": False,
			"message": f"Erreur lors du test : {str(e)}"
		}

def validate_livraison_deletion(doc, method):
	"""Empêche la suppression d'une livraison avec des colis critiques"""
	
	# Statuts qui bloquent la suppression
	BLOCKING_STATUSES = ["Livré", "Partiellement Livré", "Enlevé", "Non Livré"]
	
	# Récupérer tous les colis liés à cette livraison
	colis_lies = []
	for colis_row in doc.colis or []:
		if colis_row.colis:
			colis_lies.append(colis_row.colis)
	
	if not colis_lies:
		# Aucun colis lié, suppression autorisée
		return
	
	# Vérifier les statuts des colis liés
	colis_critiques = frappe.get_all("Colis", 
		filters={
			"name": ["in", colis_lies],
			"status": ["in", BLOCKING_STATUSES],
			"docstatus": ["<", 2]
		},
		fields=["name", "status", "bl"]
	)
	
	if colis_critiques:
		# Grouper par statut pour un message plus clair
		status_groups = {}
		bon_livraison_set = set()
		
		for colis in colis_critiques:
			status = colis.status
			if status not in status_groups:
				status_groups[status] = []
			status_groups[status].append(colis.name)
			if colis.bl:
				bon_livraison_set.add(colis.bl)
		
		# Construire le message d'erreur
		error_parts = []
		for status, colis_list in status_groups.items():
			count = len(colis_list)
			colis_display = ', '.join(colis_list[:3])
			if count > 3:
				colis_display += f" (et {count - 3} autres)"
			error_parts.append(f"{count} colis '{status}': {colis_display}")
		
		# Information sur les bons de livraison concernés
		bl_info = f"\nBons de livraison concernés: {', '.join(list(bon_livraison_set)[:5])}" if bon_livraison_set else ""
		if len(bon_livraison_set) > 5:
			bl_info += f" (et {len(bon_livraison_set) - 5} autres)"
		
		frappe.throw(
			_(f"❌ Impossible de supprimer cette livraison.\n\n"
			  f"Des colis sont en cours de traitement :\n"
			  f"• {chr(10).join(['• ' + part for part in error_parts])}{bl_info}\n\n"
			  f"💡 Vous ne pouvez supprimer que les livraisons avec des colis ayant les statuts : "
			  f"'Nouveau', 'Préparé' ou 'Annulé'")
		)

@frappe.whitelist()
def test_livraison_deletion_validation(livraison_name):
	"""Fonction utilitaire pour tester la validation de suppression d'une livraison
	
	Args:
		livraison_name (str): Nom de la livraison à tester
	
	Returns:
		dict: Résultat du test avec détails des colis
	"""
	try:
		# Récupérer la livraison
		if not frappe.db.exists("Livraison", livraison_name):
			return {
				"success": False,
				"message": f"Livraison {livraison_name} introuvable"
			}
		
		doc = frappe.get_doc("Livraison", livraison_name)
		
		# Récupérer tous les colis liés à cette livraison
		colis_lies = []
		for colis_row in doc.colis or []:
			if colis_row.colis:
				colis_lies.append(colis_row.colis)
		
		if not colis_lies:
			return {
				"success": True,
				"can_delete": True,
				"message": f"✅ Aucun colis lié. Suppression autorisée.",
				"colis_count": 0,
				"colis_details": []
			}
		
		# Récupérer les détails de tous les colis
		all_colis = frappe.get_all("Colis",
			filters={
				"name": ["in", colis_lies],
				"docstatus": ["<", 2]
			},
			fields=["name", "status", "bl"]
		)
		
		# Grouper par statut
		BLOCKING_STATUSES = ["Livré", "Partiellement Livré", "Enlevé", "Non Livré"]
		ALLOWED_STATUSES = ["Nouveau", "Préparé", "Annulé"]
		
		status_groups = {}
		blocking_colis = []
		allowed_colis = []
		bon_livraison_set = set()
		
		for colis in all_colis:
			status = colis.status
			if status not in status_groups:
				status_groups[status] = []
			status_groups[status].append(colis.name)
			
			if colis.bl:
				bon_livraison_set.add(colis.bl)
			
			if status in BLOCKING_STATUSES:
				blocking_colis.append(colis)
			elif status in ALLOWED_STATUSES:
				allowed_colis.append(colis)
		
		can_delete = len(blocking_colis) == 0
		
		# Construire le message
		if can_delete:
			message = f"✅ Suppression autorisée. Tous les colis ont des statuts non critiques."
		else:
			error_parts = []
			for status, colis_list in status_groups.items():
				if status in BLOCKING_STATUSES:
					count = len(colis_list)
					colis_display = ', '.join(colis_list[:3])
					if count > 3:
						colis_display += f" (et {count - 3} autres)"
					error_parts.append(f"{count} colis '{status}': {colis_display}")
			
			message = f"❌ Suppression bloquée par {len(blocking_colis)} colis critiques :\n• " + "\n• ".join(error_parts)
		
		return {
			"success": True,
			"can_delete": can_delete,
			"message": message,
			"colis_count": len(all_colis),
			"blocking_colis_count": len(blocking_colis),
			"allowed_colis_count": len(allowed_colis),
			"bon_livraison_count": len(bon_livraison_set),
			"bon_livraison_list": list(bon_livraison_set),
			"status_summary": {status: len(colis_list) for status, colis_list in status_groups.items()},
			"colis_details": [{"name": c.name, "status": c.status, "bl": c.bl} for c in all_colis]
		}
		
	except Exception as e:
		frappe.log_error(f"Erreur lors du test de validation pour la livraison {livraison_name}: {str(e)}", 
						"Test validation suppression livraison")
		return {
			"success": False,
			"message": f"Erreur lors du test : {str(e)}"
		}

def retirer_bon_de_livraison_supprime(doc, method):
	"""Retire un bon de livraison supprimé de toutes les livraisons."""
	# Récupérer la date de livraison du bon supprimé
	date_livraison = doc.custom_date_de_livraison
	
	if date_livraison:
		# Retirer le bon de livraison de toutes les livraisons de cette date
		retirer_bon_de_livraison_des_livraisons(doc.name, date_livraison)


def update_livraison_on_date_change(doc, method):
	"""Update Livraison's delivery notes when date_liv changes."""
	if not doc.get("__islocal") and doc.has_value_changed("date_liv"):
		# Ne pas recharger automatiquement si la livraison a déjà des bons de livraison assignés
		# Cela évite les conflits avec la création automatique
		if doc.batch_id:
			return
		
		# Seulement si la livraison est vide, charger les bons disponibles
		if doc.date_liv and not doc.bons_de_livraison:
			doc.auto_load_delivery_notes_by_date()
		elif not doc.date_liv:
			# If no date, clear delivery notes
			doc.bons_de_livraison = []
			
		# Re-sync colis and calculate totals seulement si pas de batch_id (création manuelle)
		if not doc.batch_id:
			doc.sync_colis_from_bons_de_livraison()
			doc.calculate_totals()


def update_delivery_notes_on_livraison_change(doc, method):
	"""Update Delivery Notes when livreur changes in Livraison."""
	if doc.get("__islocal"):
		return
	
	# Check if livreur has changed (vehicule is auto-fetched from livreur)
	livreur_changed = doc.has_value_changed("livreur")
	
	if not livreur_changed:
		return
	
	# Update all delivery notes in this livraison
	for bon_row in doc.bons_de_livraison or []:
		if bon_row.bon_de_livraison:
			try:
				delivery_note = frappe.get_doc("Delivery Note", bon_row.bon_de_livraison)
				
				# Update livreur and related fields
				delivery_note.custom_livreur = doc.livreur
				
				# Update custom_nom_livreur and custom_véhicule by fetching from Livreur doctype
				if doc.livreur:
					livreur_doc = frappe.get_doc("Livreur", doc.livreur)
					delivery_note.custom_nom_livreur = livreur_doc.nom
					delivery_note.custom_véhicule = livreur_doc.vehicule
				else:
					delivery_note.custom_nom_livreur = None
					delivery_note.custom_véhicule = None
				
				# Save the delivery note
				delivery_note.save()
				frappe.msgprint(f"Bon de livraison {bon_row.bon_de_livraison} mis à jour avec succès")
				
			except Exception as e:
				frappe.log_error(
					message=f"Erreur lors de la mise à jour du bon de livraison {bon_row.bon_de_livraison}: {str(e)}",
					title="Erreur mise à jour Delivery Note"
				)
				frappe.msgprint(f"Erreur lors de la mise à jour du bon de livraison {bon_row.bon_de_livraison}: {str(e)}", indicator="red")


def update_livraison_status_on_colis_change(doc, method):
	"""Update Livraison status when Colis status changes."""
	if doc.get("__islocal"):
		return
	
	# Only proceed if status has changed
	if not doc.has_value_changed("status"):
		return
	
	try:
		# Find all Livraisons that contain this Colis
		livraisons = frappe.db.sql("""
			SELECT DISTINCT parent
			FROM `tabLivraison Colis`
			WHERE colis = %s
			AND parenttype = 'Livraison'
		""", (doc.name,), as_dict=True)
		
		for livraison_row in livraisons:
			livraison_name = livraison_row.parent
			
			try:
				# Get the Livraison document
				livraison_doc = frappe.get_doc("Livraison", livraison_name)
				
				# Calculate new status based on all colis in this livraison
				new_status = calculate_livraison_status(livraison_doc)
				
				# Update status if it has changed
				if livraison_doc.status != new_status:
					livraison_doc.status = new_status
					livraison_doc.save(ignore_permissions=True)
					frappe.msgprint(
						f"Statut de la livraison {livraison_name} mis à jour vers '{new_status}'",
						indicator="green"
					)
				
			except Exception as e:
				frappe.log_error(
					message=f"Erreur lors de la mise à jour de la livraison {livraison_name}: {str(e)}",
					title="Erreur mise à jour statut Livraison"
				)
				frappe.msgprint(
					f"Erreur lors de la mise à jour de la livraison {livraison_name}: {str(e)}",
					indicator="red"
				)
				
	except Exception as e:
		frappe.log_error(
			message=f"Erreur lors de la recherche des livraisons pour le colis {doc.name}: {str(e)}",
			title="Erreur recherche Livraisons"
		)


def after_insert_livraison(doc, method):
	"""Auto-load delivery notes and colis after creating a new Livraison."""
	# Ne pas recharger automatiquement si la livraison a un batch_id (création automatique)
	if doc.batch_id:
		return
		
	if doc.date_liv:
		doc.auto_load_delivery_notes_by_date()
		doc.sync_colis_from_bons_de_livraison()
		doc.calculate_totals()
		doc.save()


def validate_livraison(doc, method):
	"""Validate the livraison document."""
	# Ne pas recharger automatiquement si la livraison a un batch_id (création automatique)
	if doc.batch_id:
		return
		
	# Toujours recharger si la date a changé ou si pas de bons de livraison
	if doc.date_liv and (not doc.bons_de_livraison or doc.has_value_changed("date_liv")):
		doc.auto_load_delivery_notes_by_date()
	doc.sync_colis_from_bons_de_livraison()
	doc.calculate_totals()

def calculate_livraison_status(livraison_doc):
	"""Calculate the appropriate status for a Livraison based on its Colis statuses."""
	if not livraison_doc.colis:
		return "Nouveau"
	
	# Get all colis statuses
	colis_statuses = []
	for colis_row in livraison_doc.colis:
		if colis_row.colis:
			try:
				colis_doc = frappe.get_doc("Colis", colis_row.colis)
				colis_statuses.append(colis_doc.status)
			except:
				continue
	
	if not colis_statuses:
		return "Nouveau"
	
	# Count statuses
	total_colis = len(colis_statuses)
	livres = colis_statuses.count("Livré")
	partiellement_livres = colis_statuses.count("Partiellement Livré")
	non_livres = colis_statuses.count("Non Livré")
	annules = colis_statuses.count("Annulé")
	enleves = colis_statuses.count("Enlevé")
	prepares = colis_statuses.count("Préparé")
	nouveaux = colis_statuses.count("Nouveau")
	
	# Logic for determining Livraison status
	# Phase 1: Livraison (priorité la plus haute)
	if livres == total_colis:
		return "Livré"
	elif livres > 0 or partiellement_livres > 0:
		return "Partiellement Livré"
	
	# Phase 2: Enlèvement
	elif enleves == total_colis:
		return "Enlevé"
	elif enleves > 0:
		return "Partiellement Enlevé"
	
	# Phase 3: Préparation
	elif prepares == total_colis:
		return "Préparé"
	elif prepares > 0:
		return "Partiellement Préparé"
	
	# Cas spéciaux
	elif annules == total_colis:
		return "Annulé"
	else:
		return "Nouveau"