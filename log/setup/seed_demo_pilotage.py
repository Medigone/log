# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Activité de démonstration pour le Pilotage, générée par le vrai workflow.

Rejoue jour par jour (horloge figée par freezegun) : commandes → préparation → BL → tournée →
livraison → encaissement → retour et contrôle caisse, plus réceptions, inventaires, flotte,
campagnes portail et objectifs. Tout document créé est noté dans un manifeste pour la purge.

	bench --site log.intrapro.net execute log.setup.seed_demo_pilotage.execute
	bench --site log.intrapro.net execute log.setup.seed_demo_pilotage.purge
"""

from __future__ import annotations

import json
import os
import random
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta

import frappe
from frappe.model.document import Document
from frappe.utils import add_days, cint, flt, getdate, nowdate

COMPANY = "Modern Pharma"
DEPOT = "Magasins - MP"
SUPPLIER = "Fournisseur 1"
PRICE_LIST = "Vente standard"
BUYING_PRICE_LIST = "Achat standard"
CHEQUE_ACCOUNT = "Compte bancaire - MP"
WEEKEND = (4, 5)  # vendredi, samedi
MARK = "DEMO pilotage"

# code, nom, groupe, prix de vente, prix d'achat, lot+DLC, quota max par commande, poids de vente
ITEMS = [
	("DEMO-001", "Crème hydratante visage 50 ml", "Soins du visage", 1850, 1150, False, 0, 8),
	("DEMO-002", "Gel nettoyant peaux sensibles 200 ml", "Soins du visage", 1450, 900, False, 0, 7),
	("DEMO-003", "Sérum anti-taches 30 ml", "Soins du visage", 3200, 2050, False, 0, 4),
	("DEMO-004", "Écran solaire SPF50+ 50 ml", "Protection solaire", 2400, 1500, False, 0, 9),
	("DEMO-005", "Lait solaire enfant SPF50 200 ml", "Protection solaire", 2650, 1700, False, 0, 5),
	("DEMO-006", "Shampooing antipelliculaire 200 ml", "Cheveux", 1300, 780, False, 0, 7),
	("DEMO-007", "Lotion antichute 100 ml", "Cheveux", 2900, 1850, False, 0, 3),
	("DEMO-008", "Baume corps relipidant 400 ml", "Soins du corps", 2100, 1300, False, 0, 6),
	("DEMO-009", "Gel douche surgras 500 ml", "Soins du corps", 950, 560, False, 0, 9),
	("DEMO-010", "Dentifrice gencives sensibles", "Hygiène", 480, 290, False, 0, 10),
	("DEMO-011", "Bain de bouche 500 ml", "Hygiène", 690, 410, False, 0, 6),
	("DEMO-012", "Couches bébé taille 4 (x44)", "Bébé & maman", 2350, 1650, False, 0, 8),
	("DEMO-013", "Liniment oléo-calcaire 500 ml", "Bébé & maman", 890, 520, False, 0, 6),
	("DEMO-014", "Pansements assortis (x40)", "Premiers soins", 420, 240, False, 0, 7),
	("DEMO-015", "Lait infantile 1er âge 800 g", "Nutrition infantile", 3100, 2450, True, 6, 7),
	("DEMO-016", "Lait infantile 2e âge 800 g", "Nutrition infantile", 3050, 2400, True, 6, 6),
	("DEMO-017", "Vitamine C 1000 mg (x30)", "Compléments alimentaires", 980, 560, True, 0, 8),
	("DEMO-018", "Magnésium B6 (x60)", "Compléments alimentaires", 1250, 740, True, 0, 6),
	("DEMO-019", "Oméga 3 (x60)", "Compléments alimentaires", 1900, 1180, True, 0, 4),
	("DEMO-020", "Thermomètre digital flexible", "Matériel médical & diagnostic", 1600, 950, False, 0, 3),
]
# Article qui n'est plus réapprovisionné en fin de période : ruptures et commandes en retard.
SHORTAGE_ITEM = "DEMO-004"

# nom, commune, latitude, longitude, groupe, commandes par semaine, arrêt (jours avant aujourd'hui)
CUSTOMERS = [
	("Pharmacie Saint-Michel", "Oran", 35.69710, -0.63370, "Pharmacie", 1.4, None),
	("Pharmacie El Bahia", "Oran", 35.70540, -0.64120, "Pharmacie", 1.2, None),
	("Pharmacie du Plateau", "Oran", 35.69180, -0.64190, "Pharmacie", 0.9, None),
	("Pharmacie Front de Mer", "Oran", 35.70210, -0.64850, "Pharmacie", 0.8, 55),
	("Parapharmacie Gambetta", "Oran", 35.69870, -0.62010, "Parapharm", 1.1, None),
	("Parapharmacie Les Palmiers", "Oran", 35.68750, -0.61530, "Parapharm", 0.6, None),
	("Pharmacie Bir El Djir", "Bir El Djir", 35.72010, -0.55540, "Pharmacie", 1.0, None),
	("Pharmacie USTO", "Bir El Djir", 35.70480, -0.57960, "Pharmacie", 1.1, 62),
	("Supérette Akid Lotfi", "Bir El Djir", 35.71290, -0.58840, "Supérette", 0.7, None),
	("Pharmacie Es Senia", "Es Senia", 35.64790, -0.62380, "Pharmacie", 0.9, None),
	("Parapharmacie Es Senia Centre", "Es Senia", 35.65120, -0.61910, "Parapharm", 0.5, 70),
	("Pharmacie Ain Turk", "Ain Turk", 35.74390, -0.76940, "Pharmacie", 0.6, None),
	("Pharmacie Bouisseville", "Ain Turk", 35.73810, -0.74520, "Pharmacie", 0.4, None),
	("Pharmacie Arzew Centre", "Arzew", 35.85610, -0.31190, "Pharmacie", 0.8, None),
	("Grossiste Para Arzew", "Arzew", 35.84970, -0.32050, "Grossiste Parapharm", 0.5, None),
	("Pharmacie Gdyel", "Gdyel", 35.78330, -0.42640, "Pharmacie", 0.5, None),
	("Pharmacie Sidi Chami", "Sidi Chami", 35.65580, -0.52140, "Pharmacie", 0.7, None),
	("Supérette Sidi Chami", "Sidi Chami", 35.65910, -0.51480, "Supérette", 0.4, 58),
	("Pharmacie El Kerma", "El Kerma", 35.61670, -0.58330, "Pharmacie", 0.5, None),
	("Pharmacie Mers El Kebir", "Mers El Kebir", 35.72780, -0.70830, "Pharmacie", 0.4, None),
	("Pharmacie Messerghin", "Messerghin", 35.61610, -0.72990, "Pharmacie", 0.6, None),
	("Parapharmacie Messerghin", "Messerghin", 35.61980, -0.72350, "Parapharm", 0.3, None),
	("Pharmacie Hassi Bounif", "Hassi Bounif", 35.70960, -0.50590, "Pharmacie", 0.6, 66),
	("Pharmacie Oued Tlelat", "Oued Tlelat", 35.55390, -0.45250, "Pharmacie", 0.4, None),
	("Pharmacie Tafraoui", "Tafraoui", 35.48400, -0.52800, "Pharmacie", 0.3, None),
	("Grossiste Santé Oran", "Oran", 35.69350, -0.63060, "Grossiste Parapharm", 0.7, None),
	("Pharmacie Bethioua", "Bethioua", 35.80620, -0.25760, "Pharmacie", 0.3, None),
	("Pharmacie Boutlelis", "Boutlelis", 35.57270, -0.89770, "Pharmacie", 0.3, None),
]
# Communes où l'on échoue plus souvent (accès difficile, clients souvent absents).
HARD_COMMUNES = {"Tafraoui": 0.22, "Boutlelis": 0.18, "Oued Tlelat": 0.14}

REPS = [
	("demo.karim@intrapro.demo", "Karim", "Benali"),
	("demo.nadia@intrapro.demo", "Nadia", "Ferhat"),
	("demo.yacine@intrapro.demo", "Yacine", "Bouzid"),
]
DRIVER_USERS = ["a@m.com", "s@m.com", "m@m.com"]
# Fiabilité relative des livreurs (multiplie le risque d'échec).
DRIVER_RISK = {"a@m.com": 0.7, "s@m.com": 1.0, "m@m.com": 1.6}

CAMPAIGNS = [
	("Été solaire", "Bandeau", ["DEMO-004", "DEMO-005"]),
	("Rentrée bébé", "Rayon produits", ["DEMO-012", "DEMO-015", "DEMO-016"]),
	("Immunité automne", "Bandeau", ["DEMO-017", "DEMO-018", "DEMO-019"]),
]

# 1 x 1 pixel PNG : la photo du chèque est obligatoire.
CHEQUE_PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

_created: list[list[str]] = []
_restore: dict = {}


def _manifest_path() -> str:
	return frappe.get_site_path("private", "demo_pilotage_manifest.json")


def _save_manifest():
	with open(_manifest_path(), "w") as handle:
		json.dump({"created": _created, "restore": _restore}, handle, ensure_ascii=False, default=str)


def _log(message):
	print(f"[{datetime.now():%Y-%m-%d %H:%M}] {message}", flush=True)


# --- Horloge et effets de bord -------------------------------------------------------


@contextmanager
def _at(day, hhmm="08:00"):
	from freezegun import freeze_time

	hour, minute = (int(part) for part in hhmm.split(":"))
	moment = datetime(day.year, day.month, day.day, hour, minute, 0)
	with freeze_time(moment, tick=True):
		yield


@contextmanager
def _seeding():
	original_insert = Document.insert
	original_enqueue = frappe.enqueue

	def tracked_insert(self, *args, **kwargs):
		result = original_insert(self, *args, **kwargs)
		_created.append([self.doctype, self.name])
		return result

	Document.insert = tracked_insert
	# Préparations automatiques, push portail, reposts : la simulation les pilote elle-même.
	frappe.enqueue = lambda *args, **kwargs: None
	frappe.flags.mute_emails = True
	frappe.flags.mute_messages = True
	try:
		yield
	finally:
		Document.insert = original_insert
		frappe.enqueue = original_enqueue
		frappe.flags.mute_messages = False


def _try(label, fn, *args, **kwargs):
	"""Étape métier qui peut légitimement échouer (rupture…) : annulée seule, la journée continue.

	Chaque étape réussie est validée en base : un verrou mortel (worker de repost en parallèle)
	n'emporte que l'étape en cours, rejouée une fois."""
	for attempt in (1, 2):
		savepoint = f"demo_{uuid.uuid4().hex[:10]}"
		frappe.db.savepoint(savepoint)
		try:
			result = fn(*args, **kwargs)
			frappe.db.commit()
			return result
		except Exception as exc:
			deadlock = isinstance(exc, frappe.QueryDeadlockError)
			try:
				frappe.db.rollback(save_point=savepoint)
			except Exception:
				frappe.db.rollback()
			frappe.clear_messages()
			if deadlock and attempt == 1:
				continue
			_log(f"  ! {label} : {str(exc)[:160]}")
			return None


def _working_days(start, end) -> list[date]:
	days, day = [], getdate(start)
	while day <= getdate(end):
		if day.weekday() not in WEEKEND:
			days.append(day)
		day += timedelta(days=1)
	return days


def _next_working(day, count=1) -> date:
	day = getdate(day)
	while count:
		day += timedelta(days=1)
		if day.weekday() not in WEEKEND:
			count -= 1
	return day


# --- Données de référence ------------------------------------------------------------


def _snapshot(doctype, name, fields):
	values = frappe.db.get_value(doctype, name, fields, as_dict=True)
	_restore.setdefault(doctype, {})[name] = dict(values or {})


def _setup_prerequisites():
	# Contrôle caisse : compte par défaut du mode Chèque.
	cheque = frappe.get_doc("Mode of Payment", "Chèque")
	if not any(row.company == COMPANY for row in cheque.accounts):
		row = cheque.append("accounts", {"company": COMPANY, "default_account": CHEQUE_ACCOUNT})
		cheque.save(ignore_permissions=True)
		_restore.setdefault("child_rows", []).append(["Mode of Payment Account", row.name])

	settings = frappe.get_single("Parametres Livraison")
	if not settings.entrepot_retour_livraison or not cint(settings.seuil_dlc_proche_jours):
		_restore["Parametres Livraison"] = {
			"entrepot_retour_livraison": settings.entrepot_retour_livraison,
			"seuil_dlc_proche_jours": settings.seuil_dlc_proche_jours,
		}
		settings.entrepot_retour_livraison = settings.entrepot_retour_livraison or DEPOT
		settings.seuil_dlc_proche_jours = cint(settings.seuil_dlc_proche_jours) or 30
		settings.save(ignore_permissions=True)

	vehicles = frappe.get_all("Vehicule", filters={"company": COMPANY}, pluck="name", order_by="nom asc")
	drivers = []
	for user, vehicle in zip(DRIVER_USERS, vehicles, strict=False):
		driver = frappe.db.get_value("Livreur", {"id_utilisateur": user}, "name")
		if not driver:
			continue
		_snapshot("Livreur", driver, ["vehicule", "active"])
		frappe.db.set_value("Livreur", driver, {"vehicule": vehicle, "active": 1})
		_snapshot("Vehicule", vehicle, ["capacite_max_articles"])
		frappe.db.set_value("Vehicule", vehicle, "capacite_max_articles", 2000)
		drivers.append(frappe._dict(name=driver, user=user, vehicle=vehicle))
	for row in frappe.get_all("Caisse Livreur", fields=["name"]):
		_snapshot("Caisse Livreur", row.name, ["solde", "date_derniere_maj"])
	for row in frappe.get_all("Objectif Pilotage", pluck="name"):
		_snapshot("Objectif Pilotage", row, ["ca_ht", "marge", "encaissements", "notes"])
	return drivers


def _create_items():
	for code, name, group, rate, cost, batched, quota, _weight in ITEMS:
		item = frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": code,
				"item_name": name,
				"item_group": group,
				"stock_uom": "N°",
				"is_stock_item": 1,
				"is_sales_item": 1,
				"include_item_in_manufacturing": 0,
				"has_batch_no": 1 if batched else 0,
				"has_expiry_date": 1 if batched else 0,
				"valuation_rate": cost,
				"description": f"{name} ({MARK})",
				"item_defaults": [{"company": COMPANY, "default_warehouse": DEPOT}],
				"taxes": [{"item_tax_template": "TVA 19% - MP"}],
			}
		)
		if item.meta.has_field("custom_afficher_dans_store"):
			item.custom_afficher_dans_store = 1
		if quota and item.meta.has_field("custom_vente_en_quota"):
			item.custom_vente_en_quota = 1
			item.custom_quota_max_commande = quota
		item.insert(ignore_permissions=True)
		for price_list, value in ((PRICE_LIST, rate), (BUYING_PRICE_LIST, cost)):
			frappe.get_doc(
				{
					"doctype": "Item Price",
					"item_code": code,
					"price_list": price_list,
					"price_list_rate": value,
				}
			).insert(ignore_permissions=True)


def _create_users():
	for email, first, last in REPS:
		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": first,
				"last_name": last,
				"send_welcome_email": 0,
				"user_type": "System User",
				"roles": [{"role": "Commercial"}, {"role": "Sales User"}],
			}
		)
		user.flags.no_welcome_mail = True
		user.insert(ignore_permissions=True)
	return [email for email, *_ in REPS]


def _create_customers(rng, reps):
	customers = []
	for index, (label, commune_name, lat, lng, group, per_week, stop) in enumerate(CUSTOMERS):
		commune = frappe.db.get_value(
			"Commune", {"nom": commune_name, "wilaya": "Oran"}, ["name", "wilaya"], as_dict=True
		)
		doc = frappe.get_doc(
			{
				"doctype": "Customer",
				"customer_name": label,
				"customer_type": "Company",
				"customer_group": group,
				"territory": "Algeria" if frappe.db.exists("Territory", "Algeria") else None,
				"custom_commune": commune.name,
				"custom_wilaya": commune.wilaya,
				"custom_forme_juridique": "Personne Physique" if "Pharmacie" in label else "SARL",
				"custom_status": "Actif",
				"custom_gps": f"{lat:.8f},{lng:.8f}",
				"custom_gps_precision_m": 12,
				"customer_details": MARK,
				"mobile_no": f"0550 {rng.randint(10, 99)} {rng.randint(10, 99)} {rng.randint(10, 99)}",
			}
		)
		for field in list(doc.as_dict()):
			if field.startswith("custom_") and not doc.meta.has_field(field):
				doc.set(field, None)
		doc.insert(ignore_permissions=True)
		customers.append(
			frappe._dict(
				name=doc.name,
				commune=commune_name,
				lat=lat,
				lng=lng,
				per_day=per_week / 5,
				stop=stop,
				rep=reps[index % len(reps)],
				portal=rng.random() < 0.3,
			)
		)
	return customers


# --- Réceptions ----------------------------------------------------------------------


def _receive(day, quantities: dict[str, float], rng, first=False, today=None):
	from log.receipt_ops import create_receipt, save_receipt_lines, submit_receipt

	receipt = create_receipt(
		{
			"supplier": SUPPLIER,
			"warehouse": DEPOT,
			"company": COMPANY,
			"posting_date": str(day),
			"supplier_delivery_note": f"BL-FRS-{day:%y%m%d}",
		}
	)["name"]
	lines = []
	costs = {code: cost for code, _n, _g, _r, cost, *_ in ITEMS}
	batched = {code for code, *_rest in ITEMS if _rest[4]}
	for code, qty in quantities.items():
		if qty <= 0:
			continue
		line = {"item_code": code, "qty": qty, "rate": costs[code]}
		if code in batched:
			if first:
				# Lots de départ : certains arrivent à expiration pendant ou juste après la période.
				# Date réelle : sous freezegun, nowdate() renverrait le jour simulé.
				today = getdate(today)
				splits = [
					(0.25, add_days(today, -12)),
					(0.25, add_days(today, rng.randint(10, 28))),
					(0.25, add_days(today, rng.randint(35, 85))),
					(0.25, add_days(today, rng.randint(200, 400))),
				]
			else:
				splits = [(1.0, add_days(day, rng.randint(240, 540)))]
			for index, (share, expiry) in enumerate(splits):
				part = int(qty * share)
				if part <= 0:
					continue
				lines.append(
					{
						**line,
						"qty": part,
						"batch_no": f"{code}-L{day:%y%m%d}{index}",
						"expiry_date": str(max(getdate(expiry), getdate(add_days(day, 15)))),
					}
				)
		else:
			lines.append(line)
	save_receipt_lines(receipt, lines)
	submit_receipt(receipt)
	return receipt


def _restock(day, rng, start, today):
	quantities = {}
	for code, *_rest, weight in ITEMS:
		if code == SHORTAGE_ITEM and (today - day).days < 35:
			continue
		quantities[code] = weight * rng.randint(9, 13)
	_receive(day, quantities, rng)
	if 25 <= (today - day).days < 50:
		_receive_short_dated(day, rng, today)


def _receive_short_dated(day, rng, today):
	"""Lot de déstockage fournisseur à DLC courte : alimente l'échéancier des péremptions."""
	from log.receipt_ops import create_receipt, save_receipt_lines, submit_receipt

	receipt = create_receipt(
		{"supplier": SUPPLIER, "warehouse": DEPOT, "company": COMPANY, "posting_date": str(day)}
	)["name"]
	lines = []
	for code, _name, _group, _rate, cost, batched, *_rest in ITEMS:
		if not batched:
			continue
		for index, (offset, qty) in enumerate(
			((-4, 12), (rng.randint(15, 28), 70), (rng.randint(40, 58), 45), (rng.randint(65, 85), 40))
		):
			lines.append(
				{
					"item_code": code,
					"qty": qty,
					"rate": round(cost * 0.8, 2),
					"batch_no": f"{code}-DC{day:%y%m%d}{index}",
					"expiry_date": str(add_days(today, offset)),
				}
			)
	save_receipt_lines(receipt, lines)
	submit_receipt(receipt)


# --- Commandes -----------------------------------------------------------------------


def _order_lines(rng):
	codes = [code for code, *_ in ITEMS]
	weights = [row[-1] for row in ITEMS]
	quotas = {row[0]: row[6] for row in ITEMS}
	picked = set()
	for _ in range(rng.choice([2, 2, 3, 3, 3, 4, 4, 5])):
		picked.add(rng.choices(codes, weights)[0])
	lines = []
	for code in picked:
		qty = rng.choice([2, 3, 4, 5, 6, 6, 8, 10, 12])
		if quotas[code]:
			qty = min(qty, quotas[code])
		line = {"item_code": code, "qty": qty}
		if rng.random() < 0.12:
			line["discount_percentage"] = rng.choice([3, 5, 5, 8, 10])
		lines.append(line)
	return lines


def _place_order(day, customer, rng, wholesale=False):
	from log.order_entry_ops import save_order, submit_order

	roll = rng.random()
	delivery = _next_working(day, 1 if roll < 0.8 else 2 if roll < 0.95 else 3)
	lines = _order_lines(rng)
	if wholesale:
		quotas = {row[0]: row[6] for row in ITEMS}
		for line in lines:
			line["qty"] = min(line["qty"] * 2, quotas[line["item_code"]] or line["qty"] * 2)
	payload = {
		"customer": customer.name,
		"order_type": "BL",
		"delivery_date": str(delivery),
		"warehouse": DEPOT,
		"price_list": PRICE_LIST,
		"payment_terms_template": "À la livraison",
		"lines": lines,
	}
	if rng.random() < 0.08:
		payload["additional_discount_percentage"] = rng.choice([2, 3, 5])
	portal = customer.portal and rng.random() < 0.5
	frappe.set_user(customer.rep)
	try:
		order = save_order(payload)["name"]
	finally:
		frappe.set_user("Administrator")
	if portal:
		frappe.db.set_value(
			"Sales Order", order, "custom_origine_commande", "Portail client", update_modified=False
		)
	submit_order(order)
	return order


# --- Préparation ---------------------------------------------------------------------


def _demo_customers() -> list[str]:
	return [row[1] for row in _created if row[0] == "Customer"]


def _orders_to_prepare(day) -> list[str]:
	return frappe.get_all(
		"Sales Order",
		filters={
			"customer": ["in", _demo_customers()],
			"docstatus": 1,
			"per_picked": ["<", 100],
			"per_delivered": ["<", 100],
			"status": ["not in", ["Closed", "Completed", "On Hold", "Cancelled"]],
			"delivery_date": ["<=", str(day)],
		},
		pluck="name",
		order_by="delivery_date asc, name asc",
	)


def _open_pick_list(order):
	from log.pick_list_ops import create_pick_list_from_sales_orders

	session = create_pick_list_from_sales_orders(json.dumps([order]))
	return session["pick_lists"][0]["name"]


def _submit_pick_list(pick_list):
	from log.pick_list_ops import submit_pick_list_and_create_dns

	return [row["name"] for row in submit_pick_list_and_create_dns(pick_list).get("delivery_notes") or []]


def _picking_error(day, delivery_note, rng):
	frappe.get_doc(
		{
			"doctype": "Exception Distribution",
			"statut": "Résolue",
			"type_exception": "Écart de préparation",
			"priorite": "Normale",
			"bon_de_livraison": delivery_note,
			"description": rng.choice(
				[
					"Article inversé avec une référence voisine, corrigé au contrôle.",
					"Quantité préparée inférieure à la commande, complétée avant départ.",
					"Mauvais lot prélevé, remplacé par le lot FEFO.",
				]
			),
			"resolution": "Corrigé au contrôle de préparation.",
			"date_signalement": datetime(day.year, day.month, day.day, 8, 10),
		}
	).insert(ignore_permissions=True)


# --- Tournées ------------------------------------------------------------------------


def _prepared_notes() -> list[dict]:
	return frappe.get_all(
		"Delivery Note",
		filters={
			"customer": ["in", _demo_customers()],
			"docstatus": 0,
			"custom_statut": "Préparé",
			"custom_tournee": ["is", "not set"],
		},
		fields=["name", "customer", "custom_commune"],
		order_by="custom_commune asc, name asc",
	)


def _plan_routes(day, drivers, rng) -> list[str]:
	from log.api.distribution import (
		acknowledge_route,
		load_route,
		publish_route,
		schedule_delivery_notes,
		start_route,
	)

	notes = _prepared_notes()
	if not notes:
		return []
	crew = list(drivers)
	rng.shuffle(crew)
	crew = crew[: max(1, min(len(crew), (len(notes) + 1) // 2))]
	communes = sorted({row.custom_commune or "" for row in notes})
	assignment = {commune: crew[index % len(crew)] for index, commune in enumerate(communes)}
	routes = []
	for driver in crew:
		names = [row.name for row in notes if assignment[row.custom_commune or ""] is driver]
		if not names:
			continue
		result = schedule_delivery_notes(
			{
				"deliveryNotes": names,
				"plannedDate": str(day),
				"plannedStart": f"{day} 08:30:00",
				"plannedEnd": f"{day} 17:00:00",
				"driver": driver.name,
				"vehicle": driver.vehicle,
				"forceNew": 1,
			}
		)
		route = result["route"]["name"]
		revision = result["route"]["revision"]
		publish_route(route, revision)
		acknowledge_route(route, frappe.db.get_value("Livraison", route, "revision"))
		load_route(route, verified_delivery_notes=json.dumps(names))
		start_route(route)
		routes.append(route)
	return routes


def _payment(rng, amount, day):
	if amount <= 0 or rng.random() < 0.1:
		return None  # client en compte : la facture reste due
	if amount > 15000 and rng.random() < 0.35:
		return {
			"method": "cheque",
			"amount": amount,
			"chequePhotoData": CHEQUE_PHOTO,
			"chequeNumber": str(rng.randint(1000000, 9999999)),
			"collectionDate": str(add_days(day, rng.choice([0, 0, 7, 15]))),
		}
	return {"method": "cash", "amount": amount}


def _complete_stop(route, dn_name, day, customers, rng):
	from log.api.distribution import complete_delivery_stop

	dn = frappe.get_doc("Delivery Note", dn_name)
	if dn.custom_statut != "Enlevé":
		return None  # déjà traité avec un autre bon du même client (même visite)
	customer = customers[dn.customer]
	driver_user = frappe.db.get_value(
		"Livreur", frappe.db.get_value("Livraison", route, "livreur"), "id_utilisateur"
	)
	failure = (0.05 + HARD_COMMUNES.get(customer.commune, 0)) * DRIVER_RISK.get(driver_user, 1.0)
	roll = rng.random()
	outcome = "failed" if roll < failure else "partial" if roll < failure + 0.08 else "delivered"
	payload = {
		"requestId": f"demo-{uuid.uuid4().hex}",
		"routeId": route,
		"deliveryNote": dn.name,
		"outcome": outcome,
		"evidence": {
			"latitude": customer.lat + rng.uniform(-0.0002, 0.0002),
			"longitude": customer.lng + rng.uniform(-0.0002, 0.0002),
			"accuracy": rng.randint(5, 20),
		},
	}
	if outcome == "failed":
		payload["failureReason"] = "Client absent" if rng.random() < 0.7 else "Autre"
		payload["failureComment"] = (
			"Officine fermée à notre passage."
			if payload["failureReason"] == "Client absent"
			else rng.choice(["Commande refusée : prix contesté.", "Accès impossible (travaux)."])
		)
	elif outcome == "partial":
		short = rng.choice(dn.items)
		ratio = 1.0
		payload["items"] = []
		for item in dn.items:
			delivered = flt(item.qty)
			if item.name == short.name:
				delivered = max(flt(item.qty) - max(1, int(flt(item.qty) / 2)), 0)
				ratio -= (flt(item.qty) - delivered) * flt(item.net_rate) / max(flt(dn.net_total), 1)
			payload["items"].append(
				{
					"itemName": item.name,
					"deliveredQuantity": delivered,
					"failureReason": "Autre" if item.name == short.name else None,
					"comment": "Le client ne garde qu'une partie (stock suffisant)."
					if item.name == short.name
					else None,
				}
			)
		if not any(row["deliveredQuantity"] > 0 for row in payload["items"]):
			payload["items"][0]["deliveredQuantity"] = flt(dn.items[0].qty)
		payment = _payment(rng, flt(round(flt(dn.grand_total) * ratio, -1)), day)
		if payment:
			payload["payment"] = payment
	else:
		payment = _payment(rng, flt(dn.grand_total), day)
		if payment:
			payload["payment"] = payment
	return complete_delivery_stop(payload)


def _run_route(route, day, customers, rng, in_progress=False):
	stops = [row.bon_de_livraison for row in frappe.get_doc("Livraison", route).bons_de_livraison]
	# Tournée du jour encore en cours : la moitié des arrêts seulement est faite.
	stop_after = max(1, len(stops) // 2) if in_progress else None
	minute = 9 * 60
	for index, dn_name in enumerate(stops):
		if stop_after is not None and index >= stop_after:
			break
		minute += rng.randint(18, 45)
		with _at(day, f"{min(minute, 17 * 60) // 60:02d}:{min(minute, 17 * 60) % 60:02d}"):
			_try(f"arrêt {dn_name}", _complete_stop, route, dn_name, day, customers, rng)


def _return_route(route):
	from log.api.distribution import confirm_route_return, declare_route_return
	from log.services.distribution_fulfillment import _line_remaining

	doc = frappe.get_doc("Livraison", route)
	if doc.statut_chargement in {"Chargé"} and doc.etat_planification in {"En cours"}:
		declare_route_return(route)
		doc = frappe.get_doc("Livraison", route)
	if doc.statut_chargement != "Retour déclaré":
		return
	confirm_route_return(
		{
			"routeId": route,
			"requestId": f"demo-{uuid.uuid4().hex}",
			"lines": [
				{"lineName": line.name, "quantity": _line_remaining(line)}
				for line in doc.lignes_chargement or []
			],
		}
	)
	_close_remainders(route)


def _close_remainders(route):
	"""Reliquats d'échec ou de partiel : ERPNext refuse une seconde préparation (picked_qty cumulé),
	le responsable clôture donc le reste de la commande depuis le Desk."""
	from erpnext.selling.doctype.sales_order.sales_order import update_status

	names = [row.bon_de_livraison for row in frappe.get_doc("Livraison", route).bons_de_livraison]
	orders = frappe.get_all(
		"Delivery Note Item",
		filters={"parent": ["in", names or [""]], "against_sales_order": ["is", "set"]},
		pluck="against_sales_order",
		distinct=True,
	)
	for order in orders:
		status, delivered = frappe.db.get_value("Sales Order", order, ["status", "per_delivered"])
		if status not in ("Closed", "Completed") and flt(delivered) < 100:
			update_status("Closed", order)


def _cash_payload(route, rng, gap=False):
	from log.services.distribution_cashier import reconciliation

	current = reconciliation(frappe.get_doc("Livraison", route))
	payload = {
		"routeId": route,
		"countedCash": current["declaredCash"],
		"payments": [
			{
				"paymentId": row["name"],
				"countedAmount": row["amount"],
				"chequeNumber": row.get("chequeNumber"),
			}
			for row in current["payments"]
		],
	}
	if gap and current["declaredCash"] > 3000:
		payload["countedCash"] = current["declaredCash"] - rng.choice([500, 1000, 1500, 2000, 2500])
		payload["reason"] = "Manque constaté au comptage de la caisse."
	return payload, bool(current["payments"])


def _control_cash(route, rng, gaps: list):
	from log.api.distribution import validate_cash_reconciliation

	payload, has_payments = _cash_payload(route, rng, gap=rng.random() < 0.06)
	if not has_payments:
		return
	validate_cash_reconciliation(payload)
	if payload.get("reason"):
		gaps.append(payload)


def _resolve_gap(payload):
	from log.api.distribution import resolve_cash_discrepancy

	resolve_cash_discrepancy(
		{**payload, "reason": "Écart accepté par le responsable, retenue sur prime du livreur."}
	)


# --- Inventaires, flotte, portail, objectifs -----------------------------------------


def _inventory(day, rng):
	from log.inventory_ops import create_inventory, record_counts, start_inventory, validate_inventory

	name = create_inventory(
		{
			"titre": f"Inventaire tournant {day:%m/%Y}",
			"warehouses": [DEPOT],
			"items": [code for code, *_ in ITEMS],
			"blind": 1,
			"notes": MARK,
		}
	)["name"]
	start_inventory(name)
	entries = []
	for line in frappe.get_all(
		"Ligne Inventaire",
		filters={"inventaire": name},
		fields=["item_code", "warehouse", "batch_no", "expected_at_count"],
	):
		qty = flt(line.expected_at_count)
		if rng.random() < 0.18:
			qty = max(qty + rng.choice([-3, -2, -1, -1, 1, 2]), 0)
		entry = {
			"client_uuid": uuid.uuid4().hex,
			"item_code": line.item_code,
			"warehouse": line.warehouse,
			"qty": qty,
			"mode": "manuel",
		}
		if line.batch_no:
			entry["batch_no"] = line.batch_no
			entry["expiry_date"] = str(frappe.db.get_value("Batch", line.batch_no, "expiry_date") or "")
		entries.append(entry)
	errors = [row for row in record_counts(name, json.dumps(entries)) if row.get("status") == "error"]
	if errors:
		_log(f"  ! inventaire {name} : {errors[0].get('message')}")
	validate_inventory(name, zero_uncounted=0)


def _scrap_expired(day):
	"""Mise au rebut mensuelle des lots périmés restant au dépôt (sortie de stock)."""
	rows = []
	for batch in frappe.get_all(
		"Batch",
		filters={"item": ["like", "DEMO-%"], "expiry_date": ["<", str(day)], "batch_qty": [">", 0]},
		fields=["name", "item"],
	):
		qty = flt(
			frappe.db.sql(
				"""select sum(sbe.qty) from `tabSerial and Batch Entry` sbe
				join `tabSerial and Batch Bundle` sbb on sbb.name = sbe.parent
				where sbe.batch_no = %s and sbe.warehouse = %s and sbb.docstatus = 1
					and sbb.is_cancelled = 0 and sbb.voucher_type != 'Pick List'""",
				(batch.name, DEPOT),
			)[0][0]
		)
		if qty > 0:
			rows.append(
				{
					"item_code": batch.item,
					"qty": qty,
					"s_warehouse": DEPOT,
					"batch_no": batch.name,
					"use_serial_batch_fields": 1,
				}
			)
	if not rows:
		return None
	entry = frappe.get_doc(
		{
			"doctype": "Stock Entry",
			"stock_entry_type": "Material Issue",
			"company": COMPANY,
			"posting_date": str(day),
			"set_posting_time": 1,
			"remarks": f"Mise au rebut des lots périmés ({MARK})",
			"items": rows,
		}
	)
	entry.insert(ignore_permissions=True)
	entry.submit()
	return entry.name


def _fuel(day, drivers, rng):
	for driver in drivers:
		km = rng.randint(380, 720)
		amount = round(km * rng.uniform(4.2, 6.8), 0)
		frappe.get_doc(
			{
				"doctype": "Consommation Carburant",
				"date": str(day),
				"vehicule": driver.vehicle,
				"type_carb": "Diesel",
				"km_parcouru": km,
				"montant": amount,
				"cout_km": round(amount / km, 2),
			}
		).insert(ignore_permissions=True)


def _maintenance(day, driver, rng):
	from log.api.distribution import create_fleet_entretien

	create_fleet_entretien(
		{
			"vehicle": driver.vehicle,
			"status": "Terminé",
			"type": rng.choice(["Préventif", "Préventif", "Correctif"]),
			"date": str(day),
			"dateEntretien": str(day),
			"km": rng.randint(40000, 160000),
			"repairs": rng.choice(
				["Vidange et filtres", "Plaquettes de frein", "Pneus avant", "Courroie d'accessoires"]
			),
			"nextMaintenance": str(add_days(day, 90)),
		}
	)


def _campaigns(day) -> list[str]:
	names = []
	for title, placement, items in CAMPAIGNS:
		doc = frappe.get_doc(
			{
				"doctype": "Campagne Portail",
				"title": title,
				"placement": placement,
				"priority": len(names) + 1,
				"cta_type": "Catalogue",
				"offer_source": "Aucune",
				"enabled": 1,
				"published": 1,
				"valid_from": str(day),
				"valid_upto": str(add_days(nowdate(), 30)),
				"items": [{"item_code": code} for code in items],
			}
		)
		doc.insert(ignore_permissions=True)
		names.append(doc.name)
	return names


def _promotion_events(day, campaigns, customers, rng):
	from log.services.portal_promotion_events import log_event

	portal_customers = [row for row in customers.values() if row.portal] or list(customers.values())
	for index, campaign in enumerate(campaigns):
		placement, items = CAMPAIGNS[index][1], CAMPAIGNS[index][2]
		strength = (1.3, 0.9, 0.6)[index]
		for customer in rng.sample(portal_customers, k=min(len(portal_customers), rng.randint(3, 8))):
			log_event(
				customer=customer.name, event_type="view_promotion", campaign=campaign, placement=placement
			)
			if rng.random() < 0.3 * strength:
				log_event(
					customer=customer.name,
					event_type="select_promotion",
					campaign=campaign,
					placement=placement,
					item_code=rng.choice(items),
				)
				if rng.random() < 0.45 * strength:
					log_event(
						customer=customer.name,
						event_type="add_to_cart",
						campaign=campaign,
						placement=placement,
						item_code=rng.choice(items),
					)


def _objectives(start, today, rng):
	from log import pilotage_ops
	from log.services import pilotage as pl

	month = pl.month_bounds(start)[0]
	while month <= today:
		first, last = pl.month_bounds(month)
		actual = pilotage_ops._month_actuals(COMPANY, first, min(last, today))
		elapsed = (min(last, today) - first).days + 1
		scale = ((last - first).days + 1) / elapsed if first <= today <= last else 1
		targets = {
			key: round(actual[key] * scale * rng.uniform(0.9, 1.15), -4)
			for key in ("ca_ht", "marge", "encaissements")
		}
		pilotage_ops.save_objectives(
			{"month": str(first), **targets, "notes": f"Objectifs {first:%m/%Y} ({MARK})"}
		)
		month = add_days(last, 1)


# --- Simulation ------------------------------------------------------------------------


def execute(days=180, orders=300, seed=42):
	"""Génère `days` jours d'activité (~`orders` commandes). Refuse si un manifeste existe déjà."""
	if os.path.exists(_manifest_path()):
		frappe.throw(f"Des données de démo existent déjà ({_manifest_path()}). Lancez purge() d'abord.")
	if frappe.session.user != "Administrator":
		frappe.set_user("Administrator")
	rng = random.Random(cint(seed))
	today = getdate(nowdate())
	start = add_days(today, -cint(days))
	_created.clear()
	_restore.clear()
	_save_manifest()

	with _seeding():
		with _at(add_days(start, -7), "09:00"):
			drivers = _setup_prerequisites()
			_create_items()
			reps = _create_users()
			customer_list = _create_customers(rng, reps)
			_receive(
				add_days(start, -7),
				{code: weight * 32 for code, *_rest, weight in ITEMS},
				rng,
				first=True,
				today=today,
			)
		frappe.db.commit()
		_save_manifest()
		_log(
			f"Référentiel prêt : {len(ITEMS)} articles, {len(customer_list)} clients, {len(drivers)} livreurs."
		)

		_simulate(start, today, rng, drivers, customer_list, cint(orders))


def _simulate(
	start,
	today,
	rng,
	drivers,
	customer_list,
	orders,
	from_day=None,
	campaigns=None,
	last_restock=None,
	last_service=None,
):
	customers = {row.name: row for row in customer_list}
	working = _working_days(start, today)
	expected = sum(row.per_day for row in customer_list) * len(working)
	volume = flt(orders) / max(expected, 1)
	campaigns, pending_gaps, total_orders = list(campaigns or []), [], 0
	last_restock = last_restock or start
	last_service = last_service or {driver.name: add_days(start, -rng.randint(0, 40)) for driver in drivers}
	try:
		for index, day in enumerate(working):
			if from_day and day < getdate(from_day):
				continue
			is_today, is_yesterday = day == today, index == len(working) - 2
			trend = 0.75 + 0.5 * index / max(len(working) - 1, 1)

			# Réapprovisionnement toutes les 3 semaines environ.
			if (day - last_restock).days >= 20:
				with _at(day, "07:00"):
					_try("réception", _restock, day, rng, start, today)
				last_restock = day

			# Préparation : listes ouvertes la veille au soir ou le matin, validées avant le départ.
			with _at(day, "06:45"):
				pick_lists = []
				for order in _orders_to_prepare(day):
					pick_list = _try(f"préparation {order}", _open_pick_list, order)
					if pick_list:
						pick_lists.append(pick_list)
			minute = 7 * 60
			for pick_list in pick_lists:
				minute += rng.randint(3, 12)
				with _at(day, f"{min(minute, 8 * 60 + 20) // 60:02d}:{min(minute, 8 * 60 + 20) % 60:02d}"):
					notes = _try(f"validation {pick_list}", _submit_pick_list, pick_list) or []
					for note in notes:
						if rng.random() < 0.03:
							_try("écart de préparation", _picking_error, day, note, rng)

			# La moitié des écarts de caisse de la veille est tranchée par le responsable.
			if pending_gaps:
				with _at(day, "08:15"):
					for payload in pending_gaps:
						if rng.random() < 0.5:
							_try("arbitrage écart", _resolve_gap, payload)
				pending_gaps.clear()

			# Tournées du jour.
			with _at(day, "08:30"):
				routes = _try("planification", _plan_routes, day, drivers, rng) or []
			for route in routes:
				_run_route(route, day, customers, rng, in_progress=is_today)
			if not is_today:
				for route in routes:
					with _at(day, "17:15"):
						_try(f"retour {route}", _return_route, route)
					if not is_yesterday:
						with _at(day, "17:40"):
							_try(f"caisse {route}", _control_cash, route, rng, pending_gaps)

			# Commandes du jour.
			minute = 9 * 60
			for customer in customer_list:
				if customer.stop and (today - day).days < customer.stop:
					continue
				if rng.random() < customer.per_day * volume * trend:
					minute += rng.randint(4, 25)
					clock = min(minute, 16 * 60 + 30)
					with _at(day, f"{clock // 60:02d}:{clock % 60:02d}"):
						if _try(
							f"commande {customer.name}",
							_place_order,
							day,
							customer,
							rng,
							"Grossiste" in customer.name,
						):
							total_orders += 1

			# Flotte, inventaires, portail.
			with _at(day, "18:00"):
				if day.weekday() == 3:
					_try("carburant", _fuel, day, drivers, rng)
				for driver in drivers:
					if (day - last_service[driver.name]).days >= 45:
						_try("entretien", _maintenance, day, driver, rng)
						last_service[driver.name] = day
				if _next_working(day).month != day.month and not is_today:
					_try("mise au rebut", _scrap_expired, day)
					_try("inventaire", _inventory, day, rng)
				if (today - day).days <= 60:
					if not campaigns:
						campaigns = _try("campagnes", _campaigns, day) or []
					if campaigns:
						_try("événements portail", _promotion_events, day, campaigns, customers, rng)

			frappe.db.commit()
			_save_manifest()
			_log(f"{day} : {total_orders} commandes cumulées, {len(routes)} tournée(s).")

		with _at(today, "18:30"):
			_try("objectifs", _objectives, start, today, rng)
		frappe.db.commit()
		_save_manifest()
	finally:
		_save_manifest()
	_log(f"Terminé : {total_orders} commandes, {len(_created)} documents créés.")


def scrap_expired_on(day):
	"""Rattrapage ponctuel : mise au rebut des lots périmés à la date `day` (données déjà générées)."""
	with open(_manifest_path()) as handle:
		manifest = json.load(handle)
	_created[:] = manifest.get("created") or []
	_restore.clear()
	_restore.update(manifest.get("restore") or {})
	with _seeding(), _at(getdate(day), "18:00"):
		print(_try("mise au rebut", _scrap_expired, getdate(day)))
	_save_manifest()


def resume(start, orders=300, seed=43):
	"""Reprend une génération interrompue après le dernier jour validé en base (même manifeste)."""
	path = _manifest_path()
	if not os.path.exists(path):
		frappe.throw("Aucun manifeste : lancez execute().")
	with open(path) as handle:
		manifest = json.load(handle)
	_created[:] = manifest.get("created") or []
	_restore.clear()
	_restore.update(manifest.get("restore") or {})
	if frappe.session.user != "Administrator":
		frappe.set_user("Administrator")
	rng = random.Random(cint(seed))
	start, today = getdate(start), getdate(nowdate())

	names = [name for doctype, name in _created if doctype == "Customer"]
	last_day = frappe.db.sql(
		"select max(transaction_date) from `tabSales Order` where docstatus = 1 and customer in %s",
		(tuple(names),),
	)[0][0]
	by_label = {row[0].upper(): row for row in CUSTOMERS}
	customer_list = []
	for index, name in enumerate(names):
		_label, commune, lat, lng, _group, per_week, stop = by_label[
			frappe.db.get_value("Customer", name, "customer_name").upper()
		]
		owners = frappe.db.sql(
			"""select owner, count(*) from `tabSales Order` where customer = %s
			and ifnull(custom_origine_commande, 'Interne') != 'Portail client' group by owner order by 2 desc""",
			name,
		)
		customer_list.append(
			frappe._dict(
				name=name,
				commune=commune,
				lat=lat,
				lng=lng,
				per_day=per_week / 5,
				stop=stop,
				rep=owners[0][0] if owners else REPS[index % len(REPS)][0],
				portal=bool(
					frappe.db.exists(
						"Sales Order", {"customer": name, "custom_origine_commande": "Portail client"}
					)
				),
			)
		)
	drivers = []
	for user in DRIVER_USERS:
		driver = frappe.db.get_value("Livreur", {"id_utilisateur": user}, ["name", "vehicule"], as_dict=True)
		if driver and driver.vehicule:
			drivers.append(frappe._dict(name=driver.name, user=user, vehicle=driver.vehicule))
	receipts = [name for doctype, name in _created if doctype == "Purchase Receipt"]
	last_restock = frappe.db.sql(
		"select max(posting_date) from `tabPurchase Receipt` where docstatus = 1 and name in %s",
		(tuple(receipts),),
	)[0][0]
	last_service = {
		driver.name: getdate(
			frappe.db.sql(
				"select max(coalesce(date_entretien, date)) from `tabEntretien Vehicule` where vehicule = %s",
				driver.vehicle,
			)[0][0]
			or start
		)
		for driver in drivers
	}
	campaigns = [name for doctype, name in _created if doctype == "Campagne Portail"]
	_log(f"Reprise après le {last_day} ({len(_created)} documents déjà créés).")
	with _seeding():
		_simulate(
			start,
			today,
			rng,
			drivers,
			customer_list,
			cint(orders),
			from_day=add_days(last_day, 1),
			campaigns=campaigns,
			last_restock=getdate(last_restock) if last_restock else None,
			last_service=last_service,
		)


# --- Purge ---------------------------------------------------------------------------------


def _delete_rows(doctype, names):
	if not names:
		return
	meta = frappe.get_meta(doctype)
	for field in meta.get_table_fields():
		frappe.db.delete(field.options, {"parent": ["in", names], "parenttype": doctype})
	frappe.db.delete(doctype, {"name": ["in", names]})


def purge():
	"""Supprime tout ce que `execute` a créé (manifeste) et rétablit les valeurs modifiées."""
	path = _manifest_path()
	if not os.path.exists(path):
		frappe.throw("Aucun manifeste de démo : rien à purger.")
	with open(path) as handle:
		manifest = json.load(handle)
	created, restore = manifest.get("created") or [], manifest.get("restore") or {}
	names = sorted({name for _doctype, name in created})
	items = [name for doctype, name in created if doctype == "Item"]

	# Écritures comptables et de stock rattachées aux pièces de démo.
	for doctype in ("GL Entry", "Stock Ledger Entry", "Payment Ledger Entry", "Serial and Batch Bundle"):
		if not frappe.db.table_exists(doctype):
			continue
		rows = frappe.get_all(doctype, filters={"voucher_no": ["in", names or [""]]}, pluck="name")
		_delete_rows(doctype, rows)
	for doctype, field in (
		("Version", "docname"),
		("Comment", "reference_name"),
		("Communication", "reference_name"),
	):
		frappe.db.delete(doctype, {field: ["in", names or [""]]})

	by_doctype: dict[str, list[str]] = {}
	for doctype, name in reversed(created):
		by_doctype.setdefault(doctype, []).append(name)
	for doctype, doc_names in by_doctype.items():
		if doctype == "File":
			for name in doc_names:
				if frappe.db.exists("File", name):
					frappe.delete_doc("File", name, force=1, ignore_permissions=True, delete_permanently=True)
			continue
		if frappe.db.table_exists(doctype):
			_delete_rows(doctype, doc_names)

	if items:
		for doctype in ("Bin", "Batch", "Item Price", "Stock Ledger Entry", "Serial and Batch Bundle"):
			field = "item" if doctype == "Batch" else "item_code"
			if doctype == "Serial and Batch Bundle":
				continue
			_delete_rows(doctype, frappe.get_all(doctype, filters={field: ["in", items]}, pluck="name"))
		frappe.db.delete("Serial and Batch Entry", {"batch_no": ["like", "DEMO-%"]})

	for row in restore.get("child_rows") or []:
		frappe.db.delete(row[0], {"name": row[1]})
	if restore.get("Parametres Livraison"):
		for field, value in restore["Parametres Livraison"].items():
			frappe.db.set_single_value("Parametres Livraison", field, value)
	for doctype in ("Livreur", "Vehicule", "Caisse Livreur", "Objectif Pilotage"):
		for name, values in (restore.get(doctype) or {}).items():
			if values and frappe.db.exists(doctype, name):
				frappe.db.set_value(doctype, name, values, update_modified=False)

	frappe.db.commit()
	os.rename(path, f"{path}.purged-{datetime.now():%Y%m%d%H%M%S}")
	frappe.clear_cache()
	print(f"Purge terminée : {len(created)} documents supprimés.")
