# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe.utils import flt, money_in_words


class FactureRoute(Document):
	def autoname(self):
		"""Génération automatique du nom: FR-YY-#####"""
		self.name = make_autoname("FR-.YY.-.#####")

	def validate(self):
		"""Validation du document"""
		self.validate_duplicate_delivery_notes()
		self.rebuild_items()

	def validate_duplicate_delivery_notes(self):
		"""Vérifie qu'il n'y a pas de doublons de BL dans cette facture de route"""
		delivery_notes = []
		for row in self.bons_de_livraison:
			if row.delivery_note in delivery_notes:
				frappe.throw(
					_("Le bon de livraison {0} est en doublon dans cette facture de route").format(
						row.delivery_note
					)
				)
			delivery_notes.append(row.delivery_note)

	def rebuild_items(self):
		"""Reconstruit la liste des articles agrégés à partir des BL sélectionnés"""
		# Vider la table articles existante
		self.articles = []

		if not self.bons_de_livraison:
			self.total_quantite = 0
			self.total_articles = 0
			self.total_ht = 0
			self.total_tva = 0
			self.total_ttc = 0
			self.in_words = ""
			return

		# Récupérer tous les articles des BL
		aggregated_items = self.aggregate_items_from_delivery_notes()

		# Remplir la table articles
		for item in aggregated_items:
			self.append("articles", {
				"item_code": item["item_code"],
				"item_name": item["item_name"],
				"qty": item["qty"],
				"uom": item["uom"],
				"rate": item["rate"],
				"amount_ht": item["amount_ht"],
				"tva_rate": item["tva_rate"],
				"amount_tva": item["amount_tva"],
				"amount_ttc": item["amount_ttc"],
			})

		# Calculer les totaux
		self.calculate_totals(aggregated_items)

		# Générer le montant en toutes lettres
		self.generate_in_words()

	def aggregate_items_from_delivery_notes(self):
		"""Agrège les articles des bons de livraison par item_code"""
		items_dict = {}

		for bl_row in self.bons_de_livraison:
			if not bl_row.delivery_note:
				continue

			# Récupérer les articles du BL
			dn_items = frappe.get_all(
				"Delivery Note Item",
				filters={"parent": bl_row.delivery_note},
				fields=[
					"item_code",
					"item_name",
					"description",
					"qty",
					"uom",
					"rate",
					"amount",
					"net_amount",
					"item_tax_template",
					"item_tax_rate",
				],
			)

			for item in dn_items:
				# Récupérer les détails de prix comme une facture standard
				item_details = self.get_item_pricing_details(item, bl_row.delivery_note)

				# Clé d'agrégation: item_code + uom
				key = (item.item_code, item.uom)

				if key not in items_dict:
					items_dict[key] = {
						"item_code": item.item_code,
						"item_name": item.item_name or item_details.get("item_name", ""),
						"description": item.description or item_details.get("description", ""),
						"uom": item.uom,
						"qty": 0,
						"rate": item_details.get("rate", item.rate),
						"amount_ht": 0,
						"tva_rate": item_details.get("tva_rate", 0),
						"amount_tva": 0,
						"amount_ttc": 0,
					}

				items_dict[key]["qty"] += flt(item.qty)
				items_dict[key]["amount_ht"] += flt(item_details.get("amount_ht", item.net_amount or item.amount))
				items_dict[key]["amount_tva"] += flt(item_details.get("amount_tva", 0))
				items_dict[key]["amount_ttc"] += flt(item_details.get("amount_ttc", item.amount))

		# Convertir en liste et recalculer les prix unitaires moyens
		aggregated_items = []
		for key, item in items_dict.items():
			if item["qty"] > 0:
				# Prix unitaire moyen
				item["rate"] = flt(item["amount_ht"] / item["qty"], 2)
			aggregated_items.append(item)

		# Trier par item_code
		aggregated_items.sort(key=lambda x: x["item_code"])

		return aggregated_items

	def get_item_pricing_details(self, dn_item, delivery_note_name):
		"""
		Récupère les détails de prix pour un article comme dans une facture standard.
		Utilise les mêmes utilitaires que Sales Invoice.
		"""
		# Récupérer les infos du BL parent
		dn = frappe.get_cached_doc("Delivery Note", delivery_note_name)

		# Calculer la TVA à partir du item_tax_rate si disponible
		tva_rate = 0
		amount_tva = 0
		amount_ht = flt(dn_item.net_amount or dn_item.amount)
		amount_ttc = flt(dn_item.amount)

		if dn_item.item_tax_rate:
			try:
				import json
				tax_rates = json.loads(dn_item.item_tax_rate)
				if tax_rates:
					# Prendre le premier taux de taxe trouvé
					for tax_account, rate in tax_rates.items():
						tva_rate = flt(rate)
						break
			except (json.JSONDecodeError, TypeError):
				pass

		# Si on a un taux de TVA, calculer les montants
		if tva_rate > 0:
			amount_tva = flt(amount_ht * tva_rate / 100, 2)
			amount_ttc = flt(amount_ht + amount_tva, 2)
		else:
			# Essayer de déduire la TVA du BL lui-même
			if dn.total_taxes_and_charges and dn.net_total:
				global_tva_rate = flt((dn.total_taxes_and_charges / dn.net_total) * 100, 2)
				if global_tva_rate > 0:
					tva_rate = global_tva_rate
					amount_tva = flt(amount_ht * tva_rate / 100, 2)
					amount_ttc = flt(amount_ht + amount_tva, 2)

		return {
			"item_name": dn_item.item_name,
			"description": dn_item.description,
			"rate": flt(dn_item.rate),
			"amount_ht": amount_ht,
			"tva_rate": tva_rate,
			"amount_tva": amount_tva,
			"amount_ttc": amount_ttc,
		}

	def calculate_totals(self, aggregated_items):
		"""Calcule les totaux à partir des articles agrégés"""
		self.total_quantite = sum(flt(item["qty"]) for item in aggregated_items)
		self.total_articles = len(aggregated_items)
		self.total_ht = flt(sum(flt(item["amount_ht"]) for item in aggregated_items), 2)
		self.total_tva = flt(sum(flt(item["amount_tva"]) for item in aggregated_items), 2)
		self.total_ttc = flt(sum(flt(item["amount_ttc"]) for item in aggregated_items), 2)

	def generate_in_words(self):
		"""Génère le montant en toutes lettres"""
		if self.total_ttc:
			# Récupérer la devise de la société
			company = frappe.defaults.get_user_default("Company")
			currency = frappe.get_cached_value("Company", company, "default_currency") if company else "DZD"
			self.in_words = money_in_words(self.total_ttc, currency)
		else:
			self.in_words = ""


@frappe.whitelist()
def recalculate_articles(docname):
	"""API pour recalculer les articles d'une facture de route"""
	doc = frappe.get_doc("Facture Route", docname)
	doc.rebuild_items()
	doc.save()
	return {
		"total_quantite": doc.total_quantite,
		"total_articles": doc.total_articles,
		"total_ht": doc.total_ht,
		"total_tva": doc.total_tva,
		"total_ttc": doc.total_ttc,
		"in_words": doc.in_words,
	}


@frappe.whitelist()
def get_articles_preview(delivery_notes):
	"""
	API pour obtenir un aperçu des articles agrégés sans sauvegarder.
	Utilisé pour afficher les articles en temps réel lors de la sélection des BL.
	"""
	import json

	if isinstance(delivery_notes, str):
		delivery_notes = json.loads(delivery_notes)

	if not delivery_notes:
		return {
			"articles": [],
			"total_quantite": 0,
			"total_articles": 0,
			"total_ht": 0,
			"total_tva": 0,
			"total_ttc": 0,
			"in_words": "",
		}

	# Créer un document temporaire pour utiliser les méthodes existantes
	temp_doc = frappe.new_doc("Facture Route")

	# Ajouter les BL à la table enfant
	for dn_name in delivery_notes:
		if dn_name:
			temp_doc.append("bons_de_livraison", {"delivery_note": dn_name})

	# Reconstruire les articles
	temp_doc.rebuild_items()

	# Préparer les articles pour le retour
	articles = []
	for row in temp_doc.articles:
		articles.append({
			"item_code": row.item_code,
			"item_name": row.item_name,
			"qty": row.qty,
			"uom": row.uom,
			"rate": row.rate,
			"amount_ht": row.amount_ht,
			"tva_rate": row.tva_rate,
			"amount_tva": row.amount_tva,
			"amount_ttc": row.amount_ttc,
		})

	return {
		"articles": articles,
		"total_quantite": temp_doc.total_quantite,
		"total_articles": temp_doc.total_articles,
		"total_ht": temp_doc.total_ht,
		"total_tva": temp_doc.total_tva,
		"total_ttc": temp_doc.total_ttc,
		"in_words": temp_doc.in_words,
	}
