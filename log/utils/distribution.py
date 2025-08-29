# Copyright (c) 2025, Amine Melizi and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import cint
from contextlib import contextmanager
from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
import uuid


@dataclass
class DeliveryNoteLite:
	"""Structure légère pour représenter un bon de livraison en mémoire."""
	bon_de_livraison: str
	commune: str
	customer: str
	nb_colis: int
	total_qty: float
	grand_total: float


class DistributionMemoryBuffer:
	"""Buffer mémoire pour la répartition v2 - évite les écritures DB pendant l'algorithme."""
	
	def __init__(self, date_livraison: str):
		self.date_livraison = date_livraison
		self.charges_jour: Dict[str, int] = {}  # livreur_id -> nb_colis
		self.capacites: Dict[str, int] = {}     # livreur_id -> capacite_max
		self.repartition: Dict[str, List[DeliveryNoteLite]] = defaultdict(list)
		self.rejets: List[Dict] = []
		
		# Initialiser avec les charges existantes pour cette date
		self._init_charges_existantes()
		
	def _init_charges_existantes(self):
		"""Initialise les charges existantes pour la date donnée."""
		charges_existantes = calculer_charges_par_date(self.date_livraison)
		self.charges_jour.update(charges_existantes)
		
		# Récupérer les capacités des livreurs actifs
		livreurs = frappe.get_all("Livreur", 
			filters={"active": 1}, 
			fields=["name", "capacite_max_colis"]
		)
		for livreur in livreurs:
			self.capacites[livreur.name] = livreur.capacite_max_colis or 0
			if livreur.name not in self.charges_jour:
				self.charges_jour[livreur.name] = 0
	
	def capacite_restante(self, livreur_id: str) -> int:
		"""Retourne la capacité restante d'un livreur pour cette date."""
		capacite_max = self.capacites.get(livreur_id, 0)
		charge_actuelle = self.charges_jour.get(livreur_id, 0)
		return max(0, capacite_max - charge_actuelle)
	
	def reserver_charge(self, livreur_id: str, nb_colis: int) -> bool:
		"""Réserve une charge pour un livreur. Retourne True si possible, False sinon."""
		if self.capacite_restante(livreur_id) >= nb_colis:
			self.charges_jour[livreur_id] = self.charges_jour.get(livreur_id, 0) + nb_colis
			return True
		return False
	
	def ajouter_rejet(self, commune: str, raison: str, details: Dict = None):
		"""Ajoute un rejet à la liste."""
		rejet = {
			"commune": commune,
			"raison": raison,
			"details": details or {}
		}
		self.rejets.append(rejet)
	
	def get_snapshot(self) -> Dict:
		"""Retourne un snapshot de l'état actuel pour simulation."""
		return {
			"repartition": dict(self.repartition),
			"charges_jour": self.charges_jour.copy(),
			"capacites": self.capacites.copy(),
			"rejets": self.rejets.copy(),
			"capacites_avant": {lid: self.capacites.get(lid, 0) - self.charges_jour.get(lid, 0) 
								 for lid in self.capacites.keys()},
			"capacites_apres": {lid: self.capacite_restante(lid) for lid in self.capacites.keys()}
		}


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


def verifier_capacite_livreur(livreur_id, nb_colis, date_livraison):
	"""Vérifie si le livreur peut accepter les colis supplémentaires pour une date donnée."""
	livreur = frappe.get_doc("Livreur", livreur_id)
	charge_actuelle_date = obtenir_charge_livreur_pour_date(livreur_id, date_livraison)
	capacite_max = livreur.capacite_max_colis or 0
	
	if charge_actuelle_date + nb_colis > capacite_max:
		frappe.throw(f"Capacité maximale dépassée pour le livreur {livreur.nom}. "
					f"Charge actuelle pour {date_livraison}: {charge_actuelle_date}, Capacité max: {capacite_max}, "
					f"Tentative d'ajout: {nb_colis}")
	
	return True


def livreurs_couvrant_commune(commune):
	"""Livreurs couvrant spécifiquement cette commune ou sa wilaya (via Child Tables)."""
	# D'abord, vérifier les livreurs autorisés spécifiquement pour cette commune
	livreurs_commune = frappe.get_all("Livreur Commune", 
		filters={"commune": commune}, 
		fields=["parent"]
	)
	
	# Si des livreurs sont spécifiquement autorisés pour cette commune, les retourner
	if livreurs_commune:
		return {p.parent for p in livreurs_commune}
	
	# Sinon, fallback vers les livreurs autorisés pour la wilaya entière
	wilaya = frappe.db.get_value("Commune", commune, "wilaya")
	livreurs_wilaya = frappe.get_all("Livreur Wilaya", 
		filters={"wilaya": wilaya}, 
		fields=["parent"]
	)
	return {p.parent for p in livreurs_wilaya}


def normalise_v2(x: float, lo: float, hi: float) -> float:
	"""Fonction de normalisation améliorée pour le scoring v2."""
	if hi == lo:
		return 0.0
	return max(0.0, min(1.0, (x - lo) / float(hi - lo)))


def candidats_eligibles_v2(commune: str, classification: str, buffer: DistributionMemoryBuffer) -> List[Dict]:
	"""Retourne les candidats éligibles pour une commune avec fallback intelligent."""
	# 1. Filtrer par statut actif et classification
	filters = {"active": 1}
	
	if classification == "Éloignée":
		filters["specialisation"] = "Longue distance"
	elif classification == "Régionale":
		filters["type_couverture"] = ["in", ["Régionale", "Nationale"]]
	else:
		filters["type_couverture"] = "Locale"

	candidats = frappe.get_all("Livreur", filters=filters,
		fields=["name", "capacite_max_colis", "priorite_attribution", "vehicule"])
	
	if not candidats:
		return []

	# 2. Restreindre aux livreurs couvrant la commune
	couvre = livreurs_couvrant_commune(commune)
	
	if couvre:
		# Livreurs avec couverture explicite
		candidats = [c for c in candidats if c.name in couvre]
	else:
		# Fallback: tous les candidats compatibles par classification
		# (déjà filtrés par classification ci-dessus)
		pass
	
	return candidats


def scorer_candidats_v2(candidats: List[Dict], buffer: DistributionMemoryBuffer) -> List[Dict]:
	"""Score les candidats selon la formule v2 et les trie."""
	if not candidats:
		return []
	
	# Récupérer les coûts des véhicules
	veh_rows = frappe.get_all("Vehicule",
		filters={"name": ["in", [c["vehicule"] for c in candidats if c.get("vehicule")]]},
		fields=["name", "cout_km"])
	veh_map = {v.name: (v.cout_km or 0) for v in veh_rows}

	# Calculer les plages pour normalisation
	couts = [veh_map.get(c.get("vehicule"), 0) for c in candidats]
	min_cout, max_cout = (min(couts) if couts else 0), (max(couts) if couts else 0)
	
	prios = [c.get("priorite_attribution", 5) for c in candidats]
	min_prio, max_prio = (min(prios) if prios else 1), (max(prios) if prios else 10)

	# Scorer chaque candidat
	for c in candidats:
		capacite_max = c.get("capacite_max_colis", 0) or 1
		charge_actuelle = buffer.charges_jour.get(c["name"], 0)
		
		# Facteur 1: Équilibrage (charge relative du jour) - 0.60
		# Plus la charge est élevée, plus le score est élevé (mauvais)
		taux_charge = charge_actuelle / float(capacite_max)
		
		# Facteur 2: Coût/km du véhicule (normalisé) - 0.25
		# Plus le coût est élevé, plus le score est élevé (mauvais)
		cout_km = veh_map.get(c.get("vehicule"), 0)
		cout_norm = normalise_v2(cout_km, min_cout, max_cout)
		
		# Facteur 3: Priorité d'attribution (1..10 ; petit = prioritaire) - 0.15
		# Plus la priorité est élevée, plus le score est élevé (mauvais)
		priorite = c.get("priorite_attribution", 5)
		prio_norm = normalise_v2(priorite, min_prio, max_prio)
		
		# Score final selon formule v2 - PLUS LE SCORE EST ÉLEVÉ, PLUS C'EST MAUVAIS
		c["_score"] = 0.60 * taux_charge + 0.25 * cout_norm + 0.15 * prio_norm
		
		# Données pour tie-breakers
		c["_capacite_restante"] = buffer.capacite_restante(c["name"])
		c["_charge_absolue"] = charge_actuelle
		c["_priorite"] = priorite

	# Trier par score croissant (meilleur score en premier)
	# Puis par tie-breakers pour assurer une répartition équilibrée
	candidats.sort(key=lambda x: (
		x["_score"],                    # 1. Score principal (croissant = meilleur en premier)
		x["_charge_absolue"],           # 2. Plus petite charge absolue (équilibrage)
		-x["_capacite_restante"],       # 3. Plus grande capacité restante
		x["_priorite"]                  # 4. Plus petite priorité
	))
	
	return candidats


def choisir_candidat_v2(candidats_tries: List[Dict], nb_colis: int, buffer: DistributionMemoryBuffer) -> Optional[str]:
	"""Essaie les candidats en cascade jusqu'à trouver un qui a la capacité."""
	for candidat in candidats_tries:
		# Vérifier la capacité avant de choisir
		if buffer.capacite_restante(candidat["name"]) >= nb_colis:
			return candidat["name"]
	return None


def split_commune_ffd(candidats_tries: List[Dict], nb_colis_total: int, buffer: DistributionMemoryBuffer) -> Tuple[List[Tuple[str, int]], int]:
	"""Split d'une commune selon l'heuristique First-Fit Decreasing (FFD)."""
	attribution = []  # list[(livreur_id, nb_colis)]
	reste = nb_colis_total
	
	# Simulation sans réservation réelle pour éviter les doubles comptabilisations
	charges_simulees = buffer.charges_jour.copy()
	
	for candidat in candidats_tries:
		cap_restante = buffer.capacites.get(candidat["name"], 0) - charges_simulees.get(candidat["name"], 0)
		if cap_restante <= 0:
			continue
			
		take = min(cap_restante, reste)
		if take > 0:
			attribution.append((candidat["name"], take))
			# Simuler la réservation sans affecter le buffer réel
			charges_simulees[candidat["name"]] = charges_simulees.get(candidat["name"], 0) + take
			reste -= take
			
		if reste == 0:
			break
	
	# Si le split est complet, appliquer les réservations réelles
	if reste == 0:
		for livreur_id, nb_colis in attribution:
			buffer.reserver_charge(livreur_id, nb_colis)
	else:
		# Split incomplet - vider l'attribution
		attribution = []
	
	return attribution, reste


def generer_suggestions_top3(candidats_tries: List[Dict], nb_colis: int, buffer: DistributionMemoryBuffer) -> List[Dict]:
	"""Génère les suggestions top-3 pour les rejets."""
	suggestions = []
	for candidat in candidats_tries[:3]:
		cap_restante = buffer.capacite_restante(candidat["name"])
		suggestions.append({
			"livreur": candidat["name"],
			"nom_livreur": frappe.db.get_value("Livreur", candidat["name"], "nom") or candidat["name"],
			"capacite_restante": cap_restante,
			"score": round(candidat.get("_score", 0), 4),
			"manque": max(0, nb_colis - cap_restante)
		})
	return suggestions


# Fonction de compatibilité (ancienne interface)
def attribuer_livreur_optimal(classification, nb_colis, commune_name=None, date_livraison=None):
	"""Fonction de compatibilité - utilise l'ancien algorithme pour éviter les régressions."""
	filters = {"active": 1}
	
	if classification == "Éloignée":
		filters["specialisation"] = "Longue distance"
	elif classification == "Régionale":
		filters["type_couverture"] = ["in", ["Régionale", "Nationale"]]
	else:
		filters["type_couverture"] = "Locale"

	candidats = frappe.get_all("Livreur", filters=filters,
		fields=["name", "capacite_max_colis", "priorite_attribution", "vehicule"])
	
	if not candidats:
		return None

	# Calculer les charges spécifiques à cette date (obligatoire maintenant)
	if date_livraison:
		charges_par_date = calculer_charges_par_date(date_livraison)
		for c in candidats:
			c.charge_actuelle_date = charges_par_date.get(c.name, 0)
	else:
		# Si pas de date spécifiée, considérer charge nulle
		for c in candidats:
			c.charge_actuelle_date = 0

	couvre = livreurs_couvrant_commune(commune_name) if commune_name else set()
	
	# CORRECTION: Si une commune est spécifiée et qu'aucun livreur n'est autorisé, retourner None
	if commune_name and not couvre:
		return None
	
	# Filtrer les candidats pour ne garder que ceux autorisés pour la commune
	if commune_name:
		candidats = [c for c in candidats if c.name in couvre]
	
	# Si aucun candidat n'est disponible après filtrage, retourner None
	if not candidats:
		return None

	veh_rows = frappe.get_all("Vehicule",
		filters={"name": ["in", [c.vehicule for c in candidats if c.vehicule]]},
		fields=["name", "cout_km"])
	veh_map = {v.name: (v.cout_km or 0) for v in veh_rows}

	couts = [veh_map.get(c.vehicule, 0) for c in candidats]
	min_c, max_c = (min(couts) if couts else 0), (max(couts) if couts else 0)

	def normalise(x, lo, hi):
		return 0 if hi == lo else max(0, min(1, (x - lo) / (hi - lo)))

	for c in candidats:
		# Utiliser la charge spécifique à la date
		taux_charge = c.charge_actuelle_date / float(c.capacite_max_colis or 1)
		# Plus besoin de pénalité de zone car tous les candidats sont autorisés
		penalite_zone = 0
		cout_km_norm = normalise(veh_map.get(c.vehicule, 0), min_c, max_c)
		prio_norm = normalise((c.priorite_attribution or 5), 1, 10)
		# pondérations: charge (0.55), zone (0.25), coût (0.15), priorité (0.05)
		# CORRECTION: Le score doit être croissant (plus petit = meilleur)
		c._score = 0.55*taux_charge + 0.25*penalite_zone + 0.15*cout_km_norm + 0.05*prio_norm

	# CORRECTION: Choisir le candidat avec le score le plus bas (meilleur)
	choisi = min(candidats, key=lambda x: x._score)
	
	if (choisi.capacite_max_colis or 0) <= 0:
		return None
	# Vérifier la capacité avec la charge spécifique à la date
	if choisi.charge_actuelle_date + nb_colis > (choisi.capacite_max_colis or 0):
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
	"""Cette fonction n'est plus nécessaire car nous utilisons des calculs par date."""
	# Les charges sont maintenant calculées dynamiquement par date
	# Cette fonction est conservée pour la compatibilité mais ne fait rien
	pass


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
	
	# Créer un buffer mémoire unique pour cette session
	buffer = DistributionMemoryBuffer(date_livraison)

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
				fields=["name", "nom", "capacite_max_colis", "type_couverture", "specialisation"]
			)
			
			# Préparer les données par commune pour l'interface manuelle
			communes_data = []
			# Obtenir les livreurs avec leurs charges par date
			livreurs_avec_charge_date = obtenir_livreurs_avec_charge_par_date(date_livraison)
		
			for commune_id, bons_liste in par_commune.items():
				nb_colis_total = sum(bon.custom_nombre_colis or 0 for bon in bons_liste)
				nom_commune = frappe.db.get_value("Commune", commune_id, "nom") or commune_id
				classification = classifier_livraison_par_distance(commune_id)
				
				# Filtrer les livreurs qui peuvent couvrir cette commune
				livreurs_couvrant = livreurs_couvrant_commune(commune_id)
				livreurs_disponibles = []
				
				for livreur in livreurs_avec_charge_date:
					if livreur["name"] in livreurs_couvrant:
						livreurs_disponibles.append({
							"name": livreur["name"],
							"nom_complet": livreur["nom_complet"],
							"vehicule": livreur.get("vehicule", "N/A"),
							"charge_actuelle": livreur["charge_actuelle_date"],
							"capacite_max": livreur["capacite_max"],
							"taux_charge": livreur["taux_charge_date"]
						})
				
				communes_data.append({
					"commune": commune_id,
					"nom_commune": nom_commune,
					"classification": classification,
					"nb_bons": len(bons_liste),
					"nb_colis": nb_colis_total,
					"bons_livraison": bons_liste,
					"livreurs_disponibles": livreurs_disponibles
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
			communes_non_attribuees = []
			
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
					
					# Vérifier la capacité avec le buffer
					if buffer.capacite_restante(livreur_id) >= nb_colis_total:
						# Réserver la charge dans le buffer
						buffer.reserver_charge(livreur_id, nb_colis_total)
					else:
						frappe.log_error(f"Capacité insuffisante pour {commune} sur livreur {livreur_id} ({nb_colis_total} colis)")
						communes_non_attribuees.append(commune)
						continue
				else:
					# Mode automatique : utiliser l'algorithme v2
					classification = classifier_livraison_par_distance(commune)
					
					# Obtenir les candidats éligibles avec le buffer
					livreurs_eligibles = candidats_eligibles_v2(commune, classification, buffer)
					if livreurs_eligibles:
						# Scorer les candidats
						candidats_scores = scorer_candidats_v2(livreurs_eligibles, buffer)
						
						# Essayer l'attribution simple (un seul livreur)
						livreur_optimal = None
						for candidat in candidats_scores:
							if buffer.capacite_restante(candidat["name"]) >= nb_colis_total:
								livreur_optimal = candidat["name"]
								break
						
						if livreur_optimal:
							# Attribution simple réussie
							buffer.reserver_charge(livreur_optimal, nb_colis_total)
							livreur_id = livreur_optimal
						else:
							# Essayer le split FFD
							bons_eligibles = obtenir_bons_eligibles_distribution(date_livraison)
							attribution_split, reste = split_commune_ffd(candidats_scores, nb_colis_total, buffer)
							
							if reste == 0:
								# Split réussi, distribuer les bons selon la répartition
								# Trier les bons par nb_colis décroissant pour optimiser l'allocation
								bons_restants = sorted(bons_liste, key=lambda x: x.custom_nombre_colis or 0, reverse=True)
								
								for livreur_id_split, nb_colis_attribue in attribution_split:
									rep = repartition.setdefault(livreur_id_split, {
										"livreur": livreur_id_split,
										"bons_de_livraison": [],
										"communes": [],
										"total_bons": 0,
										"total_colis": 0,
										"taux_charge": 0
									})
									
									# Attribuer les bons jusqu'à atteindre nb_colis_attribue
									colis_attribues = 0
									bons_a_retirer = []
									for bon in bons_restants:
										if colis_attribues + (bon.custom_nombre_colis or 0) <= nb_colis_attribue:
											rep["bons_de_livraison"].append(bon)
											colis_attribues += bon.custom_nombre_colis or 0
											bons_a_retirer.append(bon)
											if colis_attribues == nb_colis_attribue:
												break
									
									# Retirer les bons attribués de la liste
									for bon in bons_a_retirer:
										bons_restants.remove(bon)
									
									if commune not in rep["communes"]:
										rep["communes"].append(commune)
									rep["total_bons"] += len(bons_a_retirer)
									rep["total_colis"] += colis_attribues
								continue  # Passer à la commune suivante
							else:
								# Split échoué
								communes_non_attribuees.append(commune)
								continue
					else:
						# Aucun livreur éligible
						communes_non_attribuees.append(commune)
						continue

				# Attribution simple réussie, ajouter à la répartition
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
			
			# Si des communes n'ont pas pu être attribuées automatiquement, déclencher le mode manuel
			if communes_non_attribuees and simulate:
				# Récupérer la liste des livreurs actifs
				livreurs_actifs = frappe.get_all("Livreur", 
					filters={"active": 1}, 
					fields=["name", "nom", "capacite_max_colis", "type_couverture", "specialisation"]
				)
				
				# Préparer les données par commune pour l'interface manuelle
				communes_data = []
				# Obtenir les livreurs avec leurs charges par date
				livreurs_avec_charge_date = obtenir_livreurs_avec_charge_par_date(date_livraison)
			
				# CORRECTION: Ne traiter que les communes non attribuées, pas toutes les communes
				for commune_id in communes_non_attribuees:
					bons_liste = par_commune.get(commune_id, [])
					nb_colis_total = sum(bon.custom_nombre_colis or 0 for bon in bons_liste)
					nom_commune = frappe.db.get_value("Commune", commune_id, "nom") or commune_id
					classification = classifier_livraison_par_distance(commune_id)
					
					# Filtrer les livreurs qui peuvent couvrir cette commune
					livreurs_couvrant = livreurs_couvrant_commune(commune_id)
					livreurs_disponibles = []
					
					for livreur in livreurs_avec_charge_date:
						if livreur["name"] in livreurs_couvrant:
							livreurs_disponibles.append({
								"name": livreur["name"],
								"nom_complet": livreur["nom_complet"],
								"vehicule": livreur.get("vehicule", "N/A"),
								"charge_actuelle": livreur["charge_actuelle_date"],
								"capacite_max": livreur["capacite_max"],
								"taux_charge": livreur["taux_charge_date"]
							})
					
					communes_data.append({
						"commune": commune_id,
						"nom_commune": nom_commune,
						"classification": classification,
						"nb_bons": len(bons_liste),
						"nb_colis": nb_colis_total,
						"bons_livraison": bons_liste,
						"livreurs_disponibles": livreurs_disponibles
					})
			
				# Calculer le total des bons de livraison pour cette date
				total_bons_date = frappe.db.sql("""
					SELECT COUNT(*) as total
					FROM `tabDelivery Note` dn
					WHERE dn.custom_date_de_livraison = %s
					AND dn.docstatus = 0
				""", (date_livraison,), as_dict=True)[0].total
				
				# Préparer les résultats automatiques pour l'affichage
				repartition_avec_noms = {}
				for livreur_id, data in repartition.items():
					nom_livreur = frappe.db.get_value("Livreur", livreur_id, "nom") or livreur_id
					# Récupérer les noms des communes pour l'affichage
					noms_communes = []
					for commune_id in data["communes"]:
						nom_commune = frappe.db.get_value("Commune", commune_id, "nom") or commune_id
						noms_communes.append(nom_commune)
					data["communes"] = noms_communes
					data["livreur"] = nom_livreur
					repartition_avec_noms[nom_livreur] = data
				
				# Calculer le nombre de bons répartis automatiquement
				bons_repartis = sum(len(data["bons_de_livraison"]) for data in repartition.values())
				bons_non_repartis = total_bons_date - bons_repartis
				
				return {
					"success": True,
					"mode": "manuel",
					"requires_manual_selection": True,
					"communes_data": communes_data,
					"livreurs_actifs": livreurs_actifs,
					"total_bons_date": total_bons_date,
					"bons_non_repartis": bons_non_repartis,
					"repartition": repartition_avec_noms,  # Inclure les résultats automatiques
					"message": f"Attribution automatique impossible pour {len(communes_non_attribuees)} commune(s). Mode manuel activé."
				}
		
		# 4) Équilibrage des charges entre livreurs
		repartition = equilibrer_charges_livreurs(repartition, date_livraison)
		
		# 5) Taux de charge + création des Livraisons
		for livreur_id, data in repartition.items():
			cap = buffer.capacites.get(livreur_id, 0)
			# Utiliser la charge du buffer (qui inclut déjà les réservations)
			charge_proj = buffer.charges_jour.get(livreur_id, 0)
			data["taux_charge"] = round(100 * charge_proj / cap, 2) if cap else 0
			
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
	"""Cette fonction n'est plus nécessaire car nous utilisons des calculs par date."""
	if not frappe.has_permission(doctype="Livreur", ptype="write"):
		frappe.throw("Permission refusée.")
	
	# Les charges sont maintenant calculées dynamiquement par date
	# Cette fonction est conservée pour la compatibilité
	return {"success": True, "message": "Les charges sont maintenant calculées dynamiquement par date"}


@frappe.whitelist()
def corriger_charges_livreurs():
	"""Cette fonction n'est plus nécessaire car nous utilisons des calculs par date."""
	if not frappe.has_permission(doctype="Livreur", ptype="write"):
		frappe.throw("Permission refusée.")
	
	# Les charges sont maintenant calculées dynamiquement par date
	# Cette fonction est conservée pour la compatibilité
	return {
		"success": True, 
		"message": "Les charges sont maintenant calculées dynamiquement par date",
		"charges_par_livreur": {}
	}


@frappe.whitelist()
def calculer_charges_par_date(date_livraison):
	"""Calcule les charges des livreurs pour une date spécifique uniquement."""
	if not frappe.has_permission(doctype="Livreur", ptype="read"):
		frappe.throw("Permission refusée.")
	
	# Récupérer les livraisons pour cette date spécifique
	livraisons = frappe.get_all("Livraison",
		filters={"date_liv": date_livraison, "docstatus": 0},
		fields=["name", "livreur"]
	)
	
	charges_par_livreur = {}
	
	for livraison in livraisons:
		try:
			livraison_doc = frappe.get_doc("Livraison", livraison.name)
			total_colis = len(livraison_doc.colis) if livraison_doc.colis else 0
			
			if total_colis > 0 and livraison.livreur:
				if livraison.livreur not in charges_par_livreur:
					charges_par_livreur[livraison.livreur] = 0
				charges_par_livreur[livraison.livreur] += total_colis
				
		except Exception as e:
			frappe.log_error(f"Erreur calcul charge livreur {livraison.livreur} pour date {date_livraison}: {str(e)}")
	
	return charges_par_livreur


@frappe.whitelist()
def obtenir_charge_livreur_pour_date(livreur_id, date_livraison):
	"""Obtient la charge actuelle d'un livreur pour une date spécifique."""
	if not frappe.has_permission(doctype="Livreur", ptype="read"):
		frappe.throw("Permission refusée.")
	
	# Calculer la charge pour cette date spécifique
	livraisons = frappe.get_all("Livraison",
		filters={"date_liv": date_livraison, "livreur": livreur_id, "docstatus": 0},
		fields=["name"]
	)
	
	charge_totale = 0
	for livraison in livraisons:
		try:
			livraison_doc = frappe.get_doc("Livraison", livraison.name)
			total_colis = len(livraison_doc.colis) if livraison_doc.colis else 0
			charge_totale += total_colis
		except Exception as e:
			frappe.log_error(f"Erreur calcul charge livreur {livreur_id} pour date {date_livraison}: {str(e)}")
	
	return charge_totale


@frappe.whitelist()
def obtenir_livreurs_avec_charge_par_date(date_livraison):
	"""Obtient tous les livreurs actifs avec leur charge spécifique à une date donnée."""
	if not frappe.has_permission(doctype="Livreur", ptype="read"):
		frappe.throw("Permission refusée.")
	
	# Récupérer tous les livreurs actifs
	livreurs = frappe.get_all("Livreur",
		filters={"active": 1},
		fields=["name", "nom", "capacite_max_colis", "type_couverture", "specialisation", "vehicule"]
	)
	
	# Calculer les charges pour cette date spécifique
	charges_par_date = calculer_charges_par_date(date_livraison)
	
	# Enrichir les données des livreurs avec la charge par date
	for livreur in livreurs:
		livreur.charge_actuelle_date = charges_par_date.get(livreur.name, 0)
		livreur.nom_complet = livreur.nom or livreur.name
		livreur.capacite_max = livreur.capacite_max_colis or 0
		# Calculer le taux de charge pour cette date
		if livreur.capacite_max > 0:
			livreur.taux_charge_date = round(100 * (livreur.charge_actuelle_date / livreur.capacite_max), 2)
		else:
			livreur.taux_charge_date = 0
	
	return livreurs


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
		fields=["name", "nom", "capacite_max_colis", "type_couverture"]
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
def distribuer_automatiquement_v2(date_livraison: str, mode_simulation: bool = False, 
								  communes_forcees: Optional[List[str]] = None) -> Dict:
	"""Distribution automatique v2 avec buffer mémoire et gestion avancée.
	
	Args:
		date_livraison: Date au format YYYY-MM-DD
		mode_simulation: Si True, ne crée pas les documents
		communes_forcees: Liste optionnelle de communes à traiter exclusivement
		
	Returns:
		Dict avec résultats détaillés de la distribution
	"""
	# 1. Initialiser le buffer mémoire
	buffer = DistributionMemoryBuffer(date_livraison)
	
	# 2. Récupérer les bons éligibles
	bons_eligibles = obtenir_bons_eligibles_distribution(date_livraison)
	
	if not bons_eligibles:
		return {
			"success": True,
			"message": "Aucun bon de livraison éligible trouvé",
			"stats": {"total_bons": 0, "total_colis": 0}
		}
	
	# 3. Filtrer par communes forcées si spécifié
	if communes_forcees:
		bons_eligibles = [b for b in bons_eligibles if b.get("commune") in communes_forcees]
	
	# 4. Grouper par commune et trier par nombre de colis (décroissant)
	communes_groupees = defaultdict(list)
	for bon in bons_eligibles:
		commune = bon.get("commune", "Inconnue")
		communes_groupees[commune].append(bon)
	
	# Calculer le total de colis par commune et trier
	communes_triees = []
	for commune, bons in communes_groupees.items():
		total_colis = sum(bon.get("nb_colis", 0) for bon in bons)
		communes_triees.append((commune, bons, total_colis))
	
	# Trier par nombre de colis décroissant (FFD)
	communes_triees.sort(key=lambda x: x[2], reverse=True)
	
	# 5. Traiter chaque commune
	stats = {
		"total_bons": len(bons_eligibles),
		"total_colis": sum(b.get("nb_colis", 0) for b in bons_eligibles),
		"communes_traitees": 0,
		"communes_rejetees": 0,
		"communes_partielles": 0
	}
	
	for commune, bons_commune, total_colis_commune in communes_triees:
		# Classification de la commune
		classification = classifier_livraison_par_distance(commune)
		
		# Obtenir candidats éligibles
		candidats = candidats_eligibles_v2(commune, classification, buffer)
		
		if not candidats:
			# Aucun candidat disponible
			buffer.ajouter_rejet(commune, "Aucun livreur éligible", {"bons": bons_commune})
			stats["communes_rejetees"] += 1
			continue
		
		# Scorer et trier les candidats
		candidats_tries = scorer_candidats_v2(candidats, buffer)
		
		# Essayer attribution simple d'abord
		livreur_choisi = choisir_candidat_v2(candidats_tries, total_colis_commune, buffer)
		
		if livreur_choisi:
			# Attribution simple réussie
			buffer.reserver_charge(livreur_choisi, total_colis_commune)
			for bon in bons_commune:
				buffer.repartition[livreur_choisi].append(
					DeliveryNoteLite(
						bon_de_livraison=bon["name"], 
						commune=commune,
						customer=bon.get("customer", ""),
						nb_colis=bon.get("nb_colis", 0),
						total_qty=bon.get("total_qty", 0),
						grand_total=bon.get("grand_total", 0)
					)
				)
			stats["communes_traitees"] += 1
		else:
			# Essayer le split FFD
			attribution_split, reste = split_commune_ffd(candidats_tries, total_colis_commune, buffer)
			
			if attribution_split and reste == 0:
				# Split réussi complètement
				# Distribuer les bons proportionnellement
				# Trier les bons par nb_colis décroissant pour optimiser l'allocation (FFD)
				bons_restants = sorted(bons_commune[:], key=lambda x: x.get("nb_colis", 0), reverse=True)
				for livreur_id, nb_colis_attribue in attribution_split:
					bons_pour_livreur = []
					colis_pris = 0
					
					while bons_restants and colis_pris < nb_colis_attribue:
						bon = bons_restants.pop(0)
						nb_colis_bon = bon.get("nb_colis", 0)
						
						if colis_pris + nb_colis_bon <= nb_colis_attribue:
							bons_pour_livreur.append(bon)
							colis_pris += nb_colis_bon
						else:
							# Remettre le bon dans la liste
							bons_restants.insert(0, bon)
							break
					
					for bon in bons_pour_livreur:
						buffer.repartition[livreur_id].append(
							DeliveryNoteLite(
								bon_de_livraison=bon["name"], 
								commune=commune,
								customer=bon.get("customer", ""),
								nb_colis=bon.get("nb_colis", 0),
								total_qty=bon.get("total_qty", 0),
								grand_total=bon.get("grand_total", 0)
							)
						)
				
				stats["communes_partielles"] += 1
			else:
				# Échec complet - générer suggestions
				suggestions = generer_suggestions_top3(candidats_tries, total_colis_commune, buffer)
				buffer.ajouter_rejet(commune, 
								   f"Capacité insuffisante ({reste} colis non attribués)", 
								   {"suggestions": suggestions, "bons": bons_commune})
				stats["communes_rejetees"] += 1
	
	# 6. Créer les documents si pas en mode simulation
	livraisons_creees = []
	if not mode_simulation:
		for livreur_id, bons_livreur in buffer.repartition.items():
			if bons_livreur:
				livraison_doc = creer_livraison_atomique(livreur_id, date_livraison, bons_livreur)
				livraisons_creees.append(livraison_doc.name)
	
	# 7. Préparer le résultat
	resultat = {
		"success": True,
		"mode_simulation": mode_simulation,
		"stats": stats,
		"livraisons_creees": livraisons_creees,
		"rejets": buffer.rejets,
		"snapshot": buffer.get_snapshot()
	}
	
	return resultat


def obtenir_bons_eligibles_distribution(date_livraison: str) -> List[Dict]:
	"""Récupère les bons de livraison éligibles pour la distribution."""
	return frappe.db.sql("""
		SELECT 
			dn.name,
			dn.custom_commune as commune,
			dn.customer,
			dn.total_qty,
			dn.grand_total,
			dn.custom_nombre_colis as nb_colis
		FROM `tabDelivery Note` dn
		WHERE dn.custom_date_de_livraison = %s
		AND dn.docstatus = 0
		AND EXISTS (
			SELECT 1 FROM `tabColis` c 
			WHERE c.bl = dn.name 
			AND c.status IN ('Nouveau', 'Préparé', 'En attente')
		)
	""", (date_livraison,), as_dict=True)


def creer_livraison_atomique(livreur_id: str, date_livraison: str, bons: List[DeliveryNoteLite]) -> object:
	"""Crée une livraison de manière atomique avec gestion d'erreurs."""
	try:
		# Validation préalable
		if not bons:
			raise ValueError("Aucun bon de livraison à traiter")
		
		# Vérifier que tous les bons existent encore
		bons_valides = valider_bons_eligibles([bon.bon_de_livraison for bon in bons])
		if len(bons_valides) != len(bons):
			frappe.log_error(f"Certains bons ne sont plus éligibles lors de la création atomique")
			# Filtrer les bons valides
			bons = [bon for bon in bons if bon.bon_de_livraison in bons_valides]
			if not bons:
				raise ValueError("Aucun bon valide restant")
		
		# Créer le document Livraison
		livraison = frappe.new_doc("Livraison")
		livraison.livreur = livreur_id
		livraison.date_liv = date_livraison
		livraison.status = "Nouveau"
		livraison.batch_id = str(uuid.uuid4())
		
		# Calculer les totaux
		total_colis = sum(bon.nb_colis for bon in bons)
		total_qty = sum(bon.total_qty for bon in bons)
		total_amount = sum(bon.grand_total for bon in bons)
		
		# Ajouter les bons de livraison
		for bon in bons:
			livraison.append("bons_de_livraison", {
				"bon_de_livraison": bon.bon_de_livraison,
				"customer": bon.customer,
				"custom_date_de_livraison": date_livraison,
				"custom_commune": bon.commune,
				"total_qty": bon.total_qty,
				"grand_total": bon.grand_total
			})
		
		# Définir les totaux calculés
		livraison.total_colis = total_colis
		livraison.total_qty = total_qty
		livraison.total_amount = total_amount
		
		# Sauvegarder
		livraison.save()
		
		# Synchroniser les colis si la méthode existe
		if hasattr(livraison, 'sync_colis_from_bons_de_livraison'):
			livraison.sync_colis_from_bons_de_livraison()
			livraison.save()
		
		# Revalider le nombre de colis après synchronisation
		colis_count = frappe.db.count("Colis", {"livraison": livraison.name})
		if colis_count != total_colis:
			frappe.log_error(f"Incohérence nb_colis: attendu {total_colis}, trouvé {colis_count}")
			# Mettre à jour avec le compte réel
			livraison.total_colis = colis_count
			livraison.save()
		
		return livraison
		
	except Exception as e:
		frappe.log_error(f"Erreur création livraison atomique: {str(e)}")
		raise


def valider_bons_eligibles(noms_bons: List[str]) -> List[str]:
	"""Valide que les bons sont toujours éligibles pour la distribution."""
	if not noms_bons:
		return []
		
	# Vérifier l'existence et le statut des bons
	bons_valides = frappe.db.sql("""
		SELECT name 
		FROM `tabDelivery Note` 
		WHERE name IN %(noms)s 
		AND docstatus = 0
		AND EXISTS (
			SELECT 1 FROM `tabColis` c 
			WHERE c.bl = `tabDelivery Note`.name 
			AND c.status IN ('Nouveau', 'Préparé', 'En attente')
		)
	""", {"noms": noms_bons}, as_dict=False)
	
	return [bon[0] for bon in bons_valides]


@frappe.whitelist()
def valider_distribution_v2(date_livraison):
	"""Valide la cohérence d'une distribution existante."""
	try:
		livraisons = frappe.get_all("Livraison",
			filters={"date_liv": date_livraison},
			fields=["name", "livreur", "total_colis", "status"]
		)
		
		resultats_validation = []
		
		for livraison in livraisons:
			# Compter les colis réels
			colis_reels = frappe.db.count("Colis", {"livraison": livraison.name})
			
			# Compter les bons de livraison
			bons_count = frappe.db.count("Livraison Bon de Livraison", {"parent": livraison.name})
			
			resultats_validation.append({
				"livraison": livraison.name,
				"livreur": livraison.livreur,
				"status": livraison.status,
				"colis_declares": livraison.total_colis or 0,
				"colis_reels": colis_reels,
				"nb_bons": bons_count,
				"coherent": (livraison.total_colis or 0) == colis_reels
			})
		
		return {
			"success": True,
			"date_livraison": date_livraison,
			"total_livraisons": len(livraisons),
			"validations": resultats_validation,
			"incoherences": [r for r in resultats_validation if not r["coherent"]]
		}
		
	except Exception as e:
		frappe.log_error(f"Erreur validation distribution v2: {str(e)}")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def api_distribuer_automatiquement_v2(date_livraison, mode_simulation=False, communes_forcees=None):
	"""API publique pour la distribution automatique v2."""
	try:
		# Convertir les paramètres
		mode_simulation = frappe.utils.cint(mode_simulation) == 1
		if communes_forcees and isinstance(communes_forcees, str):
			communes_forcees = frappe.parse_json(communes_forcees)
		
		# Exécuter la distribution
		resultat = distribuer_automatiquement_v2(
			date_livraison=date_livraison,
			mode_simulation=mode_simulation,
			communes_forcees=communes_forcees
		)
		
		# Enrichir avec des informations de simulation
		if mode_simulation:
			resultat = enrichir_simulation_v2(resultat)
		
		return resultat
		
	except Exception as e:
		frappe.log_error(f"Erreur distribution v2: {str(e)}")
		return {
			"success": False,
			"error": str(e),
			"message": "Erreur lors de la distribution automatique"
		}


def enrichir_simulation_v2(resultat: Dict) -> Dict:
	"""Enrichit les résultats de simulation avec des informations détaillées."""
	# Ajouter des métriques de performance
	resultat["metriques"] = {
		"taux_attribution": round(
			(resultat["stats"]["communes_traitees"] + resultat["stats"]["communes_partielles"]) / 
			max(1, resultat["stats"]["communes_traitees"] + resultat["stats"]["communes_rejetees"] + resultat["stats"]["communes_partielles"]) * 100, 2
		),
		"efficacite_split": round(
			resultat["stats"]["communes_partielles"] / 
			max(1, resultat["stats"]["communes_rejetees"] + resultat["stats"]["communes_partielles"]) * 100, 2
		)
	}
	
	# Ajouter des recommandations
	recommandations = []
	if resultat["stats"]["communes_rejetees"] > 0:
		recommandations.append({
			"type": "capacite",
			"message": f"{resultat['stats']['communes_rejetees']} communes rejetées - considérer l'ajout de livreurs ou l'augmentation des capacités"
		})
	
	if resultat["stats"]["communes_partielles"] > resultat["stats"]["communes_traitees"]:
		recommandations.append({
			"type": "optimisation",
			"message": "Beaucoup de splits détectés - optimiser la répartition des capacités par zone"
		})
	
	resultat["recommandations"] = recommandations
	
	# Enrichir les informations sur les livreurs
	livreurs_info = {}
	for livreur_id, charge in resultat["snapshot"]["charges_jour"].items():
		capacite = resultat["snapshot"]["capacites"].get(livreur_id, 0)
		livreurs_info[livreur_id] = {
			"nom": frappe.db.get_value("Livreur", livreur_id, "nom") or livreur_id,
			"charge_actuelle": charge,
			"capacite_max": capacite,
			"taux_utilisation": round(charge / max(1, capacite) * 100, 1),
			"nb_bons_attribues": len(resultat["snapshot"]["repartition"].get(livreur_id, []))
		}
	
	resultat["livreurs_details"] = livreurs_info
	
	return resultat


@frappe.whitelist()
def diagnostiquer_distribution_v2(date_livraison):
	"""Diagnostic avancé de la distribution pour une date donnée."""
	try:
		# Simuler la distribution
		resultat_simulation = distribuer_automatiquement_v2(
			date_livraison=date_livraison,
			mode_simulation=True
		)
		
		# Enrichir avec diagnostic
		resultat_simulation = enrichir_simulation_v2(resultat_simulation)
		
		# Ajouter des analyses spécifiques
		analyses = {
			"goulots_etranglement": identifier_goulots_etranglement(resultat_simulation),
			"suggestions_optimisation": generer_suggestions_optimisation(resultat_simulation),
			"impact_ajout_livreur": simuler_impact_ajout_livreur(date_livraison)
		}
		
		resultat_simulation["analyses"] = analyses
		return resultat_simulation
		
	except Exception as e:
		frappe.log_error(f"Erreur diagnostic v2: {str(e)}")
		return {"success": False, "error": str(e)}


def identifier_goulots_etranglement(resultat: Dict) -> List[Dict]:
	"""Identifie les goulots d'étranglement dans la distribution."""
	goulots = []
	
	# Analyser les rejets par commune
	for rejet in resultat["rejets"]:
		commune = rejet.get("commune")
		details = rejet.get("details", {})
		if "suggestions" in details:
			suggestions = details["suggestions"]
			if suggestions:
				meilleur_candidat = suggestions[0]
				goulots.append({
					"type": "capacite_insuffisante",
					"commune": commune,
					"manque_colis": meilleur_candidat.get("manque", 0),
					"meilleur_livreur": meilleur_candidat.get("nom_livreur", "")
				})
	
	# Analyser les livreurs surchargés
	for livreur_id, info in resultat.get("livreurs_details", {}).items():
		if info["taux_utilisation"] > 90:
			goulots.append({
				"type": "livreur_sature",
				"livreur": info["nom"],
				"taux_utilisation": info["taux_utilisation"]
			})
	
	return goulots


def generer_suggestions_optimisation(resultat: Dict) -> List[Dict]:
	"""Génère des suggestions d'optimisation basées sur les résultats."""
	suggestions = []
	
	# Suggestion d'équilibrage
	livreurs = resultat.get("livreurs_details", {})
	if livreurs:
		taux_utilisation = [info["taux_utilisation"] for info in livreurs.values()]
		ecart_type = (sum((x - sum(taux_utilisation)/len(taux_utilisation))**2 for x in taux_utilisation) / len(taux_utilisation))**0.5
		
		if ecart_type > 25:  # Forte disparité
			suggestions.append({
				"type": "equilibrage",
				"priorite": "haute",
				"message": "Forte disparité de charge entre livreurs - revoir la répartition des zones"
			})
	
	# Suggestion d'ajout de capacité
	if resultat["stats"]["communes_rejetees"] > resultat["stats"]["communes_traitees"] * 0.2:
		suggestions.append({
			"type": "capacite",
			"priorite": "haute",
			"message": "Taux de rejet élevé - considérer l'ajout de livreurs ou l'extension des zones de couverture"
		})
	
	return suggestions


def simuler_impact_ajout_livreur(date_livraison: str) -> Dict:
	"""Simule l'impact de l'ajout d'un livreur hypothétique."""
	# Simulation basique - à enrichir selon les besoins
	return {
		"reduction_rejets_estimee": "15-25%",
		"amelioration_equilibrage": "Modérée",
		"recommandation": "Ajouter un livreur avec couverture locale pour les communes les plus rejetées"
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
	
	# Les charges sont maintenant calculées dynamiquement par date
	# Plus besoin de recalculer manuellement
	
	return {
		"success": True,
		"message": f"Synchronisation terminée. {livraisons_modifiees} livraison(s) mise(s) à jour.",
		"livraisons_modifiees": livraisons_modifiees
	}


def equilibrer_charges_livreurs(repartition: Dict, date_livraison: str) -> Dict:
	"""Équilibre les charges entre livreurs pour éviter la surcharge."""
	# Récupérer les capacités des livreurs
	livreurs_info = {}
	for livreur_id in repartition.keys():
		capacite = frappe.db.get_value("Livreur", livreur_id, "capacite_max_colis") or 0
		charge_actuelle = obtenir_charge_livreur_pour_date(livreur_id, date_livraison)
		livreurs_info[livreur_id] = {
			"capacite": capacite,
			"charge_actuelle": charge_actuelle,
			"charge_apres": charge_actuelle + repartition[livreur_id]["total_colis"],
			"taux_utilisation": 0
		}
		if capacite > 0:
			livreurs_info[livreur_id]["taux_utilisation"] = (
				livreurs_info[livreur_id]["charge_apres"] / capacite
			)
	
	# Identifier les livreurs surchargés (>90%) et sous-utilisés (<50%)
	livreurs_surcharges = []
	livreurs_sous_utilises = []
	
	for livreur_id, info in livreurs_info.items():
		if info["taux_utilisation"] > 0.90:  # >90%
			livreurs_surcharges.append((livreur_id, info))
		elif info["taux_utilisation"] < 0.50:  # <50%
			livreurs_sous_utilises.append((livreur_id, info))
	
	# Trier par taux d'utilisation (plus surchargé en premier)
	livreurs_surcharges.sort(key=lambda x: x[1]["taux_utilisation"], reverse=True)
	livreurs_sous_utilises.sort(key=lambda x: x[1]["taux_utilisation"])
	
	# Essayer de rééquilibrer en déplaçant des communes
	repartition_equilibree = repartition.copy()
	
	for livreur_surcharge, info_surcharge in livreurs_surcharges:
		# Calculer combien de colis il faut déplacer
		colis_a_deplacer = int((info_surcharge["charge_apres"] - info_surcharge["capacite"] * 0.85) * 0.5)
		
		if colis_a_deplacer <= 0:
			continue
		
		# Chercher des communes à déplacer vers des livreurs sous-utilisés
		for livreur_sous_utilise, info_sous_utilise in livreurs_sous_utilises:
			if colis_a_deplacer <= 0:
				break
				
			# Vérifier si le livreur sous-utilisé peut couvrir les communes du livreur surchargé
			communes_a_deplacer = []
			colis_deplaces = 0
			
			for commune in repartition_equilibree[livreur_surcharge]["communes"]:
				if colis_deplaces >= colis_a_deplacer:
					break
					
				# Vérifier si le livreur sous-utilisé peut couvrir cette commune
				if livreur_sous_utilise in livreurs_couvrant_commune(commune):
					# Calculer le nombre de colis pour cette commune
					colis_commune = sum(
						bon.get("custom_nombre_colis", 0) if isinstance(bon, dict) else (bon.custom_nombre_colis or 0)
						for bon in repartition_equilibree[livreur_surcharge]["bons_de_livraison"]
						if (bon.get("commune") if isinstance(bon, dict) else bon.commune) == commune
					)
					
					if colis_deplaces + colis_commune <= colis_a_deplacer:
						communes_a_deplacer.append(commune)
						colis_deplaces += colis_commune
			
			# Vérifier la capacité restante du destinataire avant le déplacement
			if communes_a_deplacer and colis_deplaces > 0:
				cap_rest_dest = livreurs_info[livreur_sous_utilise]["capacite"] - livreurs_info[livreur_sous_utilise]["charge_apres"]
				if colis_deplaces > cap_rest_dest:
					colis_deplaces = cap_rest_dest
					# Réajuster la liste des communes à déplacer
					communes_ajustees = []
					colis_cumules = 0
					for commune in communes_a_deplacer:
						colis_commune = sum(
							bon.get("custom_nombre_colis", 0) if isinstance(bon, dict) else (bon.custom_nombre_colis or 0)
							for bon in repartition_equilibree[livreur_surcharge]["bons_de_livraison"]
							if (bon.get("commune") if isinstance(bon, dict) else bon.commune) == commune
						)
						if colis_cumules + colis_commune <= colis_deplaces:
							communes_ajustees.append(commune)
							colis_cumules += colis_commune
						else:
							break
					communes_a_deplacer = communes_ajustees
					colis_deplaces = colis_cumules
				
				if colis_deplaces <= 0:
					continue
				# Déplacer les communes
				for commune in communes_a_deplacer:
					# Retirer de l'ancien livreur
					repartition_equilibree[livreur_surcharge]["communes"].remove(commune)
					
					# Ajouter au nouveau livreur
					if livreur_sous_utilise not in repartition_equilibree:
						repartition_equilibree[livreur_sous_utilise] = {
							"livreur": livreur_sous_utilise,
							"bons_de_livraison": [],
							"communes": [],
							"total_bons": 0,
							"total_colis": 0,
							"taux_charge": 0
						}
					
					# Déplacer les bons de livraison correspondants
					bons_a_deplacer = [
						bon for bon in repartition_equilibree[livreur_surcharge]["bons_de_livraison"]
						if (bon.get("commune") if isinstance(bon, dict) else bon.commune) == commune
					]
					
					for bon in bons_a_deplacer:
						repartition_equilibree[livreur_surcharge]["bons_de_livraison"].remove(bon)
						repartition_equilibree[livreur_sous_utilise]["bons_de_livraison"].append(bon)
					
					# Mettre à jour les totaux
					colis_commune = sum(
						bon.get("custom_nombre_colis", 0) if isinstance(bon, dict) else (bon.custom_nombre_colis or 0)
						for bon in bons_a_deplacer
					)
					repartition_equilibree[livreur_surcharge]["total_colis"] -= colis_commune
					repartition_equilibree[livreur_surcharge]["total_bons"] -= len(bons_a_deplacer)
					repartition_equilibree[livreur_sous_utilise]["total_colis"] += colis_commune
					repartition_equilibree[livreur_sous_utilise]["total_bons"] += len(bons_a_deplacer)
					
					# Ajouter la commune à la liste du nouveau livreur
					if commune not in repartition_equilibree[livreur_sous_utilise]["communes"]:
						repartition_equilibree[livreur_sous_utilise]["communes"].append(commune)
				
				# Mettre à jour les charges
				colis_a_deplacer -= colis_deplaces
				
				# Mettre à jour les informations des livreurs
				livreurs_info[livreur_surcharge]["charge_apres"] -= colis_deplaces
				livreurs_info[livreur_sous_utilise]["charge_apres"] += colis_deplaces
				
				if livreurs_info[livreur_surcharge]["capacite"] > 0:
					livreurs_info[livreur_surcharge]["taux_utilisation"] = (
						livreurs_info[livreur_surcharge]["charge_apres"] / livreurs_info[livreur_surcharge]["capacite"]
					)
				if livreurs_info[livreur_sous_utilise]["capacite"] > 0:
					livreurs_info[livreur_sous_utilise]["taux_utilisation"] = (
						livreurs_info[livreur_sous_utilise]["charge_apres"] / livreurs_info[livreur_sous_utilise]["capacite"]
					)
	
	# Nettoyer les livreurs sans bons de livraison
	livreurs_vides = [lid for lid, data in repartition_equilibree.items() if not data["bons_de_livraison"]]
	for livreur_id in livreurs_vides:
		del repartition_equilibree[livreur_id]
	
	return repartition_equilibree


@frappe.whitelist()
def diagnostiquer_equilibrage_livreurs(date_livraison):
	"""Diagnostique l'équilibrage des charges entre livreurs pour une date donnée."""
	if not frappe.has_permission(doctype="Livraison", ptype="read"):
		frappe.throw("Permission refusée.")
	
	try:
		# 1. Récupérer tous les livreurs actifs
		livreurs = frappe.get_all("Livreur", 
			filters={"active": 1}, 
			fields=["name", "nom", "capacite_max_colis", "type_couverture", "specialisation"]
		)
		
		# 2. Calculer les charges actuelles par date
		charges_par_date = calculer_charges_par_date(date_livraison)
		
		# 3. Analyser l'équilibrage
		analyse = {
			"date_livraison": date_livraison,
			"total_livreurs": len(livreurs),
			"livreurs_surcharges": [],
			"livreurs_sous_utilises": [],
			"livreurs_equilibres": [],
			"problemes_detectes": [],
			"recommandations": []
		}
		
		for livreur in livreurs:
			livreur_id = livreur["name"]
			capacite_max = livreur["capacite_max_colis"] or 0
			charge_actuelle = charges_par_date.get(livreur_id, 0)
			
			if capacite_max > 0:
				taux_utilisation = charge_actuelle / capacite_max
				livreur["taux_utilisation"] = round(taux_utilisation * 100, 2)
				livreur["charge_actuelle"] = charge_actuelle
				livreur["capacite_restante"] = capacite_max - charge_actuelle
				
				# Classifier le livreur
				if taux_utilisation > 0.90:  # >90%
					analyse["livreurs_surcharges"].append(livreur)
					analyse["problemes_detectes"].append({
						"type": "surcharge",
						"livreur": livreur["nom"] or livreur_id,
						"taux": livreur["taux_utilisation"],
						"severite": "critique" if taux_utilisation > 1.0 else "elevee"
					})
				elif taux_utilisation < 0.30:  # <30%
					analyse["livreurs_sous_utilises"].append(livreur)
					analyse["problemes_detectes"].append({
						"type": "sous_utilisation",
						"livreur": livreur["nom"] or livreur_id,
						"taux": livreur["taux_utilisation"],
						"severite": "moderee"
					})
				else:
					analyse["livreurs_equilibres"].append(livreur)
			else:
				livreur["taux_utilisation"] = 0
				livreur["charge_actuelle"] = charge_actuelle
				livreur["capacite_restante"] = 0
				analyse["problemes_detectes"].append({
					"type": "capacite_nulle",
					"livreur": livreur["nom"] or livreur_id,
					"severite": "critique"
				})
		
		# 4. Générer des recommandations
		if analyse["livreurs_surcharges"]:
			analyse["recommandations"].append({
				"type": "surcharge",
				"message": f"{len(analyse['livreurs_surcharges'])} livreur(s) surchargé(s) - considérer la redistribution ou l'ajout de capacité"
			})
		
		if analyse["livreurs_sous_utilises"]:
			analyse["recommandations"].append({
				"type": "sous_utilisation",
				"message": f"{len(analyse['livreurs_sous_utilises'])} livreur(s) sous-utilisé(s) - optimiser la répartition des zones"
			})
		
		# 5. Calculer des métriques globales
		if livreurs:
			taux_utilisation_moyen = sum(l.get("taux_utilisation", 0) for l in livreurs) / len(livreurs)
			analyse["metriques"] = {
				"taux_utilisation_moyen": round(taux_utilisation_moyen, 2),
				"ecart_type_utilisation": round(
					(sum((l.get("taux_utilisation", 0) - taux_utilisation_moyen)**2 for l in livreurs) / len(livreurs))**0.5, 2
				),
				"total_colis_attribues": sum(charges_par_date.values()),
				"capacite_totale": sum(l.get("capacite_max_colis", 0) for l in livreurs)
			}
		
		return {
			"success": True,
			"analyse": analyse
		}
		
	except Exception as e:
		frappe.log_error(f"Erreur diagnostic équilibrage: {str(e)}")
		return {"success": False, "error": str(e)}