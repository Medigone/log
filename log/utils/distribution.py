# Copyright (c) 2025, Amine Melizi and contributors
# For license information, please see license.txt

import frappe
import uuid
from frappe.utils import cint
from contextlib import contextmanager


@contextmanager
def db_txn():
	"""Gestionnaire de contexte pour les transactions de base de données."""
	try:
		yield
		frappe.db.commit()
	except:
		frappe.db.rollback()
		raise


def classifier_livraison_par_distance(commune_name):
	"""Retourne: 'Locale' / 'Régionale' / 'Éloignée' selon distance_depot et seuils Single Doc."""
	dist = frappe.get_value("Commune", commune_name, "distance_depot") or 0
	seuil_local = cint(frappe.db.get_single_value("Parametres Livraison", "seuil_local_km") or 20)
	seuil_regional = cint(frappe.db.get_single_value("Parametres Livraison", "seuil_regional_km") or 100)
	
	if dist <= seuil_local:
		return "Locale"
	if dist <= seuil_regional:
		return "Régionale"
	return "Éloignée"


def incrementer_charge(livreur_id, nb_colis):
	"""Incrément atomique de charge_actuelle pour éviter les races."""
	# Vérifier d'abord la capacité disponible
	livreur = frappe.get_doc("Livreur", livreur_id)
	charge_actuelle = livreur.charge_actuelle or 0
	capacite_max = livreur.capacite_max_colis or 0
	
	if charge_actuelle + nb_colis > capacite_max:
		frappe.throw(f"Capacité maximale dépassée pour le livreur {livreur.nom}. "
					f"Charge actuelle: {charge_actuelle}, Capacité max: {capacite_max}, "
					f"Tentative d'ajout: {nb_colis}")
	
	# Mettre à jour la charge
	livreur.charge_actuelle = charge_actuelle + nb_colis
	livreur.save()
	
	return livreur.charge_actuelle


def livreurs_couvrant_commune(commune):
	"""Livreurs couvrant la wilaya de la commune (via Child Table)."""
	wilaya = frappe.db.get_value("Commune", commune, "wilaya")
	parents = frappe.get_all("Livreur Wilaya", filters={"wilaya": wilaya}, fields=["parent"])
	return {p.parent for p in parents}


def attribuer_livreur_optimal(classification, nb_colis, commune_name=None):
	"""Retourne le nom du livreur avec le meilleur score, ou None si aucun candidat."""
	filters = {"active": 1}
	
	if classification == "Éloignée":
		filters["specialisation"] = "Longue distance"
	elif classification == "Régionale":
		filters["type_couverture"] = ["in", ["Régionale", "Nationale"]]
	else:
		filters["type_couverture"] = "Locale"

	candidats = frappe.get_all("Livreur", filters=filters,
		fields=["name", "charge_actuelle", "capacite_max_colis", "priorite_attribution", "vehicule"])
	
	if not candidats:
		return None

	couvre = livreurs_couvrant_commune(commune_name) if commune_name else set()

	veh_rows = frappe.get_all("Vehicule",
		filters={"name": ["in", [c.vehicule for c in candidats if c.vehicule]]},
		fields=["name", "cout_km"])
	veh_map = {v.name: (v.cout_km or 0) for v in veh_rows}

	couts = [veh_map.get(c.vehicule, 0) for c in candidats]
	min_c, max_c = (min(couts) if couts else 0), (max(couts) if couts else 0)

	def normalise(x, lo, hi):
		return 0 if hi == lo else max(0, min(1, (x - lo) / (hi - lo)))

	for c in candidats:
		taux_charge = (c.charge_actuelle or 0) / float(c.capacite_max_colis or 1)
		penalite_zone = 0 if (not commune_name or c.name in couvre) else 1
		cout_km_norm = normalise(veh_map.get(c.vehicule, 0), min_c, max_c)
		prio_norm = normalise((c.priorite_attribution or 5), 1, 10)
		# pondérations: charge (0.55), zone (0.25), coût (0.15), priorité (0.05)
		c._score = 0.55*taux_charge + 0.25*penalite_zone + 0.15*cout_km_norm + 0.05*(1 - prio_norm)

	choisi = min(candidats, key=lambda x: x._score)
	
	if (choisi.capacite_max_colis or 0) <= 0:
		return None
	if (choisi.charge_actuelle or 0) + nb_colis > (choisi.capacite_max_colis or 0):
		return None
	
	return choisi.name


@frappe.whitelist()
def synchroniser_livraisons_existantes(date_livraison):
	"""Synchronise les livraisons existantes avec les changements dans les bons de livraison."""
	if not frappe.has_permission(doctype="Livraison", ptype="write"):
		frappe.throw("Permission refusée.")
	
	# 1. Récupérer toutes les livraisons existantes pour cette date
	livraisons_existantes = frappe.get_all("Livraison",
		filters={"date_liv": date_livraison, "docstatus": 0},
		fields=["name", "batch_id", "livreur"]
	)
	
	if not livraisons_existantes:
		return {"success": True, "message": "Aucune livraison existante pour cette date"}
	
	# 2. Récupérer tous les bons de livraison actuels pour cette date
	bons_actuels = frappe.db.sql("""
		SELECT 
			dn.name as bon_de_livraison,
			dn.custom_commune as commune,
			dn.customer,
			dn.total_qty,
			dn.grand_total,
			dn.custom_nombre_colis
		FROM `tabDelivery Note` dn
		WHERE dn.custom_date_de_livraison = %s
		AND dn.docstatus = 0
		AND EXISTS (
			SELECT 1 FROM `tabColis` c 
			WHERE c.bl = dn.name 
			AND c.status IN ('Nouveau', 'Préparé', 'En attente')
		)
	""", (date_livraison,), as_dict=True)
	
	# 3. Analyser les changements
	changements = analyser_changements_livraisons(livraisons_existantes, bons_actuels)
	
	# 4. Appliquer les corrections nécessaires
	if changements["action_requise"]:
		appliquer_corrections_livraisons(changements, date_livraison)
		return {
			"success": True, 
			"message": f"Livraisons synchronisées. {changements['message']}",
			"changements": changements
		}
	else:
		return {
			"success": True, 
			"message": "Aucune synchronisation nécessaire",
			"changements": changements
		}


def analyser_changements_livraisons(livraisons_existantes, bons_actuels):
	"""Analyse les changements entre livraisons existantes et bons actuels."""
	changements = {
		"action_requise": False,
		"message": "",
		"livraisons_a_supprimer": [],
		"livraisons_a_modifier": [],
		"bons_orphelins": [],
		"bons_manquants": []
	}
	
	# Récupérer les bons assignés dans chaque livraison
	for livraison in livraisons_existantes:
		bons_livraison = frappe.get_all("Livraison Bon de Livraison",
			filters={"parent": livraison.name},
			fields=["bon_de_livraison"]
		)
		
		bons_ids = [b.bon_de_livraison for b in bons_livraison]
		
		# Vérifier si des bons ont été supprimés
		for bon_id in bons_ids:
			if not any(b.bon_de_livraison == bon_id for b in bons_actuels):
				changements["bons_orphelins"].append({
					"livraison": livraison.name,
					"bon_de_livraison": bon_id
				})
				changements["action_requise"] = True
		
		# Vérifier si la livraison a des bons valides
		bons_valides = [b for b in bons_ids if any(ba.bon_de_livraison == b for ba in bons_actuels)]
		
		if not bons_valides:
			changements["livraisons_a_supprimer"].append(livraison.name)
			changements["action_requise"] = True
		elif len(bons_valides) != len(bons_ids):
			changements["livraisons_a_modifier"].append(livraison.name)
			changements["action_requise"] = True
	
	# Vérifier s'il y a de nouveaux bons non assignés
	bons_assignes = set()
	for livraison in livraisons_existantes:
		bons_livraison = frappe.get_all("Livraison Bon de Livraison",
			filters={"parent": livraison.name},
			fields=["bon_de_livraison"]
		)
		bons_assignes.update(b.bon_de_livraison for b in bons_livraison)
	
	for bon in bons_actuels:
		if bon.bon_de_livraison not in bons_assignes:
			changements["bons_manquants"].append(bon.bon_de_livraison)
			changements["action_requise"] = True
	
	# Construire le message
	messages = []
	if changements["livraisons_a_supprimer"]:
		messages.append(f"{len(changements['livraisons_a_supprimer'])} livraison(s) à supprimer")
	if changements["livraisons_a_modifier"]:
		messages.append(f"{len(changements['livraisons_a_modifier'])} livraison(s) à modifier")
	if changements["bons_manquants"]:
		messages.append(f"{len(changements['bons_manquants'])} bon(s) non assigné(s)")
	
	changements["message"] = "; ".join(messages) if messages else "Aucun changement détecté"
	
	return changements


def appliquer_corrections_livraisons(changements, date_livraison):
	"""Applique les corrections nécessaires aux livraisons."""
	# 1. Supprimer les livraisons vides
	for livraison_name in changements["livraisons_a_supprimer"]:
		try:
			frappe.delete_doc("Livraison", livraison_name)
		except Exception as e:
			frappe.log_error(f"Erreur suppression livraison {livraison_name}: {str(e)}")
	
	# 2. Modifier les livraisons avec des bons orphelins
	for livraison_name in changements["livraisons_a_modifier"]:
		try:
			livraison = frappe.get_doc("Livraison", livraison_name)
			
			# Supprimer les bons orphelins
			bons_a_garder = []
			for bon_row in livraison.bons_de_livraison:
				if bon_row.bon_de_livraison:
					# Vérifier si le bon existe encore
					if frappe.db.exists("Delivery Note", bon_row.bon_de_livraison):
						bons_a_garder.append(bon_row)
			
			livraison.bons_de_livraison = bons_a_garder
			livraison.save()
			
		except Exception as e:
			frappe.log_error(f"Erreur modification livraison {livraison_name}: {str(e)}")
	
	# 3. Réinitialiser les charges des livreurs
	reset_charges_livreurs()
	
	# 4. Recalculer les charges basées sur les livraisons restantes
	recalculer_charges_livreurs(date_livraison)


def recalculer_charges_livreurs(date_livraison):
	"""Recalcule les charges des livreurs basées sur les livraisons existantes."""
	# Réinitialiser toutes les charges
	frappe.db.sql("UPDATE `tabLivreur` SET charge_actuelle = 0")
	
	# Recalculer basé sur les livraisons existantes
	livraisons = frappe.get_all("Livraison",
		filters={"date_liv": date_livraison, "docstatus": 0},
		fields=["name", "livreur"]
	)
	
	for livraison in livraisons:
		try:
			livraison_doc = frappe.get_doc("Livraison", livraison.name)
			total_colis = len(livraison_doc.colis) if livraison_doc.colis else 0
			
			if total_colis > 0 and livraison.livreur:
				livreur = frappe.get_doc("Livreur", livraison.livreur)
				livreur.charge_actuelle = (livreur.charge_actuelle or 0) + total_colis
				livreur.save()
				
		except Exception as e:
			frappe.log_error(f"Erreur recalcul charge livreur {livraison.livreur}: {str(e)}")


@frappe.whitelist()
def repartir_livraisons_automatique(date_livraison, mode="auto", simulate=False, manual_assignments=None):
	"""Répartit les bons de livraison d'une date par livreur.
	simulate=True => ne modifie pas la DB (pas d'incrément charge, pas de création Livraison).
	manual_assignments => dict {commune_id: livreur_id} pour le mode manuel."""
	
	# Contrôle d'accès côté serveur (bonne pratique)
	if not frappe.has_permission(doctype="Livraison", ptype="write"):
		frappe.throw("Permission refusée.")
	
	# Vérifier s'il y a des livraisons existantes pour cette date
	livraisons_existantes = frappe.get_all("Livraison",
		filters={"date_liv": date_livraison, "docstatus": 0},
		fields=["name", "batch_id"]
	)
	
	if livraisons_existantes and not simulate:
		# Il y a des livraisons existantes, proposer la synchronisation
		return {
			"success": False,
			"requires_synchronization": True,
			"message": f"Il existe déjà {len(livraisons_existantes)} livraison(s) pour cette date. Voulez-vous synchroniser ou recréer ?",
			"livraisons_existantes": len(livraisons_existantes),
			"options": ["synchroniser", "recréer", "annuler"]
		}
	
	# Conversion des paramètres si nécessaire
	# Conversion du paramètre simulate
	if isinstance(simulate, str):
		simulate = simulate.lower() in ('true', '1', 'yes')
	
	# Conversion du paramètre manual_assignments
	if isinstance(manual_assignments, str):
		import json
		try:
			manual_assignments = json.loads(manual_assignments)
		except Exception as e:
			frappe.log_error(f"Failed to parse manual_assignments JSON: {manual_assignments}, Error: {str(e)}")
			manual_assignments = None

	batch_id = str(uuid.uuid4())

	with db_txn():
		# 1) Récupération des bons de livraison avec leurs colis
		bons_a_livrer = frappe.db.sql("""
			SELECT 
				dn.name as bon_de_livraison,
				dn.custom_commune as commune,
				dn.customer,
				dn.total_qty,
				dn.grand_total,
				dn.custom_nombre_colis,
				1 as priorite
			FROM `tabDelivery Note` dn
			WHERE dn.custom_date_de_livraison = %s
			AND dn.docstatus = 0
			AND EXISTS (
				SELECT 1 FROM `tabColis` c 
				WHERE c.bl = dn.name 
				AND c.status IN ('Nouveau', 'Préparé', 'En attente')
			)
		""", (date_livraison,), as_dict=True)

		# 2) Groupement par commune
		par_commune = {}
		for bon in bons_a_livrer:
			par_commune.setdefault(bon.commune, []).append(bon)

		# Mode manuel : retourner les données pour sélection manuelle
		if mode == "manuel" and not manual_assignments:
			# Récupérer la liste des livreurs actifs
			livreurs_actifs = frappe.get_all("Livreur", 
				filters={"active": 1}, 
				fields=["name", "nom", "capacite_max_colis", "charge_actuelle", "type_couverture", "specialisation"]
			)
			
			# Préparer les données par commune pour l'interface manuelle
			communes_data = []
			for commune_id, bons_liste in par_commune.items():
				nb_colis_total = sum(bon.custom_nombre_colis or 0 for bon in bons_liste)
				nom_commune = frappe.db.get_value("Commune", commune_id, "nom") or commune_id
				classification = classifier_livraison_par_distance(commune_id)
				
				communes_data.append({
					"commune_id": commune_id,
					"nom_commune": nom_commune,
					"classification": classification,
					"nb_bons": len(bons_liste),
					"nb_colis": nb_colis_total,
					"bons_liste": bons_liste
				})
			
			# Calculer le total des bons de livraison pour cette date
			total_bons_date = frappe.db.sql("""
				SELECT COUNT(*) as total
				FROM `tabDelivery Note` dn
				WHERE dn.custom_date_de_livraison = %s
				AND dn.docstatus = 0
			""", (date_livraison,), as_dict=True)[0].total
			
			return {
				"success": True,
				"mode": "manuel",
				"requires_manual_selection": True,
				"communes_data": communes_data,
				"livreurs_actifs": livreurs_actifs,
				"total_bons_date": total_bons_date,
				"bons_non_repartis": total_bons_date
			}

		# 3) Attribution par commune OU respect de la répartition existante
		repartition, livraisons_creees = {}, []
		
		if mode == "manuel" and manual_assignments and isinstance(manual_assignments, dict):
			# Mode manuel avec assignations : respecter exactement la répartition fournie
			
			# Créer la répartition basée sur les assignations manuelles
			for commune, livreur_id in manual_assignments.items():
				# Trouver les bons de livraison pour cette commune
				bons_commune = par_commune.get(commune, [])
				if not bons_commune:
					continue
					
				# Ajouter à la répartition du livreur
				if livreur_id not in repartition:
					repartition[livreur_id] = {
						"livreur": livreur_id,
						"bons_de_livraison": [],
						"communes": [],
						"total_bons": 0,
						"total_colis": 0,
						"taux_charge": 0
					}
				
				repartition[livreur_id]["bons_de_livraison"].extend(bons_commune)
				if commune not in repartition[livreur_id]["communes"]:
					repartition[livreur_id]["communes"].append(commune)
				repartition[livreur_id]["total_bons"] += len(bons_commune)
				repartition[livreur_id]["total_colis"] += sum(bon.custom_nombre_colis or 0 for bon in bons_commune)
		else:
			# Mode automatique : attribution par commune selon l'algorithme
			
			for commune, bons_liste in par_commune.items():
				# Calculer le nombre total de colis pour cette commune
				nb_colis_total = sum(bon.custom_nombre_colis or 0 for bon in bons_liste)
				
				# Déterminer le livreur selon le mode
				if mode == "manuel" and manual_assignments and isinstance(manual_assignments, dict):
					# Mode manuel : utiliser l'assignation fournie
					livreur_id = manual_assignments.get(commune)
					if not livreur_id:
						frappe.log_error(f"Aucune assignation manuelle pour {commune} ({len(bons_liste)} bons, {nb_colis_total} colis)")
						continue
				else:
					# Mode automatique : utiliser l'algorithme d'optimisation
					classification = classifier_livraison_par_distance(commune)
					livreur_id = attribuer_livreur_optimal(classification, nb_colis_total, commune)
					
					if not livreur_id:
						frappe.log_error(f"Aucun livreur éligible pour {commune} ({len(bons_liste)} bons, {nb_colis_total} colis)")
						continue

				if not simulate:
					incrementer_charge(livreur_id, nb_colis_total)

				rep = repartition.setdefault(livreur_id, {
					"livreur": livreur_id,
					"bons_de_livraison": [],
					"communes": [],
					"total_bons": 0,
					"total_colis": 0,
					"taux_charge": 0
				})
				rep["bons_de_livraison"].extend(bons_liste)
				if commune not in rep["communes"]:
					rep["communes"].append(commune)
				rep["total_bons"] += len(bons_liste)
				rep["total_colis"] += nb_colis_total
		
		# 4) Taux de charge + création des Livraisons
		for livreur_id, data in repartition.items():
			cap = frappe.db.get_value("Livreur", livreur_id, "capacite_max_colis") or 0
			charge = frappe.db.get_value("Livreur", livreur_id, "charge_actuelle") or 0
			# Calculer le taux de charge après attribution
			charge_apres = charge + data["total_colis"]
			data["taux_charge"] = round(100 * (charge_apres / cap), 2) if cap else 0
			
			# Conserver les IDs des communes pour la création des livraisons
			communes_ids = data["communes"].copy()
			
			# Récupérer les noms des communes pour l'affichage
			noms_communes = []
			for commune_id in communes_ids:
				nom_commune = frappe.db.get_value("Commune", commune_id, "nom") or commune_id
				noms_communes.append(nom_commune)
			data["communes"] = noms_communes
			data["communes_ids"] = communes_ids  # Garder les IDs pour la création
			
			# Récupérer le nom du livreur au lieu de son ID
			nom_livreur = frappe.db.get_value("Livreur", livreur_id, "nom") or livreur_id
			data["livreur"] = nom_livreur

			if not simulate:
				try:
					# Vérifier qu'il y a des bons de livraison à traiter
					if not data["bons_de_livraison"]:
						frappe.log_error(f"Pas de bons de livraison pour le livreur {livreur_id}")
						continue
					
					livraison = frappe.new_doc("Livraison")
					livraison.date_liv = date_livraison
					livraison.livreur = livreur_id
					livraison.batch_id = batch_id
					livraison.status = "Nouveau"  # Définir le statut initial
					
					# Ajouter les bons de livraison
					for bon in data["bons_de_livraison"]:
						livraison.append("bons_de_livraison", {
							"bon_de_livraison": bon.bon_de_livraison,
							"customer": bon.customer,
							"custom_date_de_livraison": date_livraison,
							"custom_commune": bon.commune,
							"total_qty": bon.total_qty,
							"grand_total": bon.grand_total
						})
					
					# Sauvegarder d'abord pour avoir l'ID
					livraison.save()
					
					# Synchroniser manuellement les colis maintenant que les hooks sont désactivés
					livraison.sync_colis_from_bons_de_livraison()
					
					# Sauvegarder à nouveau pour s'assurer que tout est persistant
					livraison.save()
					
					livraisons_creees.append(livraison.name)
				except Exception as e:
					frappe.msgprint(f"Erreur lors de la création de livraison: {str(e)}")
					frappe.log_error(f"Erreur création livraison: {str(e)}", "Distribution Error")
					raise e

		# Calculer le total des bons de livraison pour cette date
		total_bons_date = frappe.db.sql("""
			SELECT COUNT(*) as total
			FROM `tabDelivery Note` dn
			WHERE dn.custom_date_de_livraison = %s
			AND dn.docstatus = 0
		""", (date_livraison,), as_dict=True)[0].total

		# Calculer le nombre de bons répartis
		bons_repartis = sum(len(data["bons_de_livraison"]) for data in repartition.values())
		
		# Calculer le nombre de bons non répartis
		bons_non_repartis = total_bons_date - bons_repartis

		# Restructurer la répartition avec les noms des livreurs comme clés
		repartition_avec_noms = {}
		for livreur_id, data in repartition.items():
			nom_livreur = data.get("livreur", livreur_id)
			# Conserver l'ID du livreur pour la confirmation
			data["livreur_id"] = livreur_id
			repartition_avec_noms[nom_livreur] = data

		return {
			"success": True,
			"simulate": bool(simulate),
			"batch_id": batch_id,
			"livraisons_creees": livraisons_creees,
			"repartition": repartition_avec_noms,
			"total_bons_date": total_bons_date,
			"bons_non_repartis": bons_non_repartis
		}


@frappe.whitelist()
def nettoyer_livraisons_vides():
	"""Supprime les livraisons qui n'ont aucun bon de livraison associé."""
	if not frappe.has_permission(doctype="Livraison", ptype="delete"):
		frappe.throw("Permission refusée.")
	
	# Trouver les livraisons vides
	livraisons_vides = frappe.db.sql("""
		SELECT l.name
		FROM `tabLivraison` l
		LEFT JOIN `tabLivraison Bon de Livraison` lbdl ON l.name = lbdl.parent
		WHERE lbdl.bon_de_livraison IS NULL
		AND l.docstatus = 0
	""", as_dict=True)
	
	count = 0
	for livraison in livraisons_vides:
		try:
			frappe.delete_doc("Livraison", livraison.name)
			count += 1
		except Exception as e:
			frappe.log_error(f"Erreur suppression livraison {livraison.name}: {str(e)}")
	
	frappe.db.commit()
	return {"success": True, "message": f"{count} livraisons vides supprimées"}


@frappe.whitelist()
def reset_charges_livreurs():
	"""Remet à zéro la charge actuelle de tous les livreurs."""
	if not frappe.has_permission(doctype="Livreur", ptype="write"):
		frappe.throw("Permission refusée.")
	
	frappe.db.sql("UPDATE `tabLivreur` SET charge_actuelle = 0")
	frappe.db.commit()
	
	return {"success": True, "message": "Charges des livreurs remises à zéro"}


@frappe.whitelist()
def diagnostiquer_distribution_bons(date_livraison):
	"""Diagnostique la distribution basée sur les bons de livraison."""
	if not frappe.has_permission(doctype="Livraison", ptype="read"):
		frappe.throw("Permission refusée.")
	
	# 1) Compter les bons de livraison éligibles
	bons_eligibles = frappe.db.sql("""
		SELECT 
			dn.name as bon_de_livraison,
			dn.custom_commune as commune,
			dn.customer,
			dn.custom_nombre_colis,
			dn.total_qty,
			dn.grand_total
		FROM `tabDelivery Note` dn
		WHERE dn.custom_date_de_livraison = %s
		AND dn.docstatus = 0
		AND EXISTS (
			SELECT 1 FROM `tabColis` c 
			WHERE c.bl = dn.name 
			AND c.status IN ('Nouveau', 'Préparé', 'En attente')
		)
	""", (date_livraison,), as_dict=True)
	
	# 2) Compter les livreurs actifs
	livreurs_actifs = frappe.get_all("Livreur", 
		filters={"active": 1}, 
		fields=["name", "nom", "charge_actuelle", "capacite_max_colis", "type_couverture"]
	)
	
	# Remplacer les IDs par les noms des livreurs
	for livreur in livreurs_actifs:
		livreur["livreur_nom"] = livreur.get("nom") or livreur["name"]
		livreur["livreur_id"] = livreur["name"]
		del livreur["name"]
		if "nom" in livreur:
			del livreur["nom"]
	
	# 3) Grouper par commune
	par_commune = {}
	total_colis = 0
	for bon in bons_eligibles:
		par_commune.setdefault(bon.commune, []).append(bon)
		total_colis += bon.custom_nombre_colis or 0
	
	return {
		"success": True,
		"date_livraison": date_livraison,
		"total_bons_eligibles": len(bons_eligibles),
		"total_colis": total_colis,
		"communes_concernees": len(par_commune),
		"livreurs_actifs": len(livreurs_actifs),
		"detail_par_commune": {
			commune: {
				"nb_bons": len(bons),
				"nb_colis": sum(b.custom_nombre_colis or 0 for b in bons),
				"montant_total": sum(b.grand_total or 0 for b in bons)
			} for commune, bons in par_commune.items()
		},
		"bons_eligibles": bons_eligibles,
		"livreurs_actifs": livreurs_actifs
	}


@frappe.whitelist()
def forcer_synchronisation_livraisons(date_livraison):
	"""Force la synchronisation des livraisons avec les bons de livraison actuels."""
	if not frappe.has_permission(doctype="Livraison", ptype="write"):
		frappe.throw("Permission refusée.")
	
	# 1. Récupérer tous les bons de livraison actuels pour cette date
	bons_actuels = frappe.db.sql("""
		SELECT 
			dn.name as bon_de_livraison,
			dn.custom_commune as commune,
			dn.customer,
			dn.total_qty,
			dn.grand_total,
			dn.custom_nombre_colis
		FROM `tabDelivery Note` dn
		WHERE dn.custom_date_de_livraison = %s
		AND dn.docstatus = 0
		AND EXISTS (
			SELECT 1 FROM `tabColis` c 
			WHERE c.bl = dn.name 
			AND c.status IN ('Nouveau', 'Préparé', 'En attente')
		)
	""", (date_livraison,), as_dict=True)
	
	# 2. Récupérer toutes les livraisons existantes pour cette date
	livraisons_existantes = frappe.get_all("Livraison",
		filters={"date_liv": date_livraison, "docstatus": 0},
		fields=["name", "batch_id", "livreur"]
	)
	
	if not livraisons_existantes:
		return {"success": True, "message": "Aucune livraison existante pour cette date"}
	
	# 3. Nettoyer et resynchroniser chaque livraison
	livraisons_modifiees = 0
	
	for livraison in livraisons_existantes:
		# Ne pas modifier les livraisons créées automatiquement
		if livraison.batch_id:
			continue
			
		try:
			livraison_doc = frappe.get_doc("Livraison", livraison.name)
			
			# Vider les bons de livraison existants
			livraison_doc.bons_de_livraison = []
			
			# Ajouter les bons de livraison actuels
			for bon in bons_actuels:
				livraison_doc.append("bons_de_livraison", {
					"bon_de_livraison": bon.bon_de_livraison,
					"customer": bon.customer,
					"custom_date_de_livraison": date_livraison,
					"custom_commune": bon.commune,
					"total_qty": bon.total_qty,
					"grand_total": bon.grand_total
				})
			
			# Synchroniser les colis et recalculer les totaux
			livraison_doc.sync_colis_from_bons_de_livraison()
			livraison_doc.calculate_totals()
			livraison_doc.save()
			
			livraisons_modifiees += 1
			
		except Exception as e:
			frappe.log_error(f"Erreur lors de la synchronisation de la livraison {livraison.name}: {str(e)}")
	
	# 4. Recalculer les charges des livreurs
	recalculer_charges_livreurs(date_livraison)
	
	return {
		"success": True,
		"message": f"Synchronisation terminée. {livraisons_modifiees} livraison(s) mise(s) à jour.",
		"livraisons_modifiees": livraisons_modifiees
	}