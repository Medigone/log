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
			
			# Mettre à jour les totaux
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
				
				# Mettre à jour les totaux
				livraison_doc.calculate_totals()
				livraison_doc.save()
				
		except Exception as e:
			frappe.log_error(f"Erreur lors de l'ajout du bon {bon_de_livraison_name} à la livraison {livraison.name}: {str(e)}")


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
			
		# Calculate totals
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


def after_insert_livraison(doc, method):
	"""Auto-load delivery notes after creating a new Livraison."""
	# Ne pas recharger automatiquement si la livraison a un batch_id (création automatique)
	if doc.batch_id:
		return
		
	if doc.date_liv:
		doc.auto_load_delivery_notes_by_date()
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
	doc.calculate_totals()
