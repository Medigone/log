# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Préparation native : Sales Order → Pick List → Delivery Note."""

from __future__ import annotations

import json
from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import flt

from log.delivery_note_ops import _apply_named_status, serialize_delivery_note

LOG_SO_TO_DN_FIELDS = (
	("custom_commune", "custom_commune"),
	("custom_wilaya", "custom_wilaya"),
	("custom_type", "custom_type"),
	("delivery_date", "custom_date_de_livraison"),
)

CLOSED_SO_STATUSES = ("Closed", "On Hold", "Completed", "Cancelled")
PREPARATION_ROLES = {"Préparateur", "Responsable", "System Manager"}


def _require_preparation_role():
	roles = set(frappe.get_roles(frappe.session.user))
	if frappe.session.user == "Administrator":
		return
	if frappe.session.user == "Guest" or not roles & PREPARATION_ROLES:
		frappe.throw(_("Vous n'avez pas accès à la préparation."), frappe.PermissionError)


def _parse_list(value):
	if isinstance(value, str):
		value = json.loads(value)
	if not isinstance(value, (list, tuple)):
		return []
	return [v for v in value if v]


def _sales_order_pickable(name):
	so = frappe.get_doc("Sales Order", name)
	if so.docstatus != 1:
		frappe.throw(_("La commande {0} n'est pas soumise.").format(name))
	if so.status in CLOSED_SO_STATUSES:
		frappe.throw(_("La commande {0} est au statut {1}.").format(name, so.status))
	if so.meta.has_field("skip_delivery_note") and so.get("skip_delivery_note"):
		frappe.throw(_("La commande {0} est marquée pour ignorer le bon de livraison.").format(name))
	if flt(so.per_delivered) >= 100:
		frappe.throw(_("La commande {0} est déjà entièrement livrée.").format(name))
	if flt(so.per_picked) >= 100:
		frappe.throw(_("La commande {0} est déjà entièrement prélevée.").format(name))
	return so


def _required_pick_qty(item) -> float:
	picked = flt(item.get("picked_qty")) / (flt(item.get("conversion_factor")) or 1)
	return flt(item.get("qty")) - max(picked, flt(item.get("delivered_qty")))


def _bundle_item_codes(item_codes):
	if not item_codes:
		return set()
	return set(
		frappe.get_all(
			"Product Bundle",
			filters={"new_item_code": ["in", list(item_codes)], "disabled": 0},
			pluck="new_item_code",
		)
	)


def _company_available_qty(item_codes, company) -> dict[str, float]:
	if not item_codes or not company:
		return {}
	rows = frappe.db.sql(
		"""
		SELECT bin.item_code, SUM(bin.actual_qty) AS qty
		FROM `tabBin` bin
		INNER JOIN `tabWarehouse` warehouse ON warehouse.name = bin.warehouse
		WHERE bin.item_code IN %(items)s AND warehouse.company = %(company)s
		GROUP BY bin.item_code
		""",
		{"items": list(item_codes), "company": company},
		as_dict=True,
	)
	return {row.item_code: flt(row.qty) for row in rows}


def stock_shortages_for_items(items, *, available_by_item: dict[str, float], bundle_codes=None) -> list[dict]:
	"""Retourne les lignes dont le stock société est inférieur à la quantité encore à prélever."""
	bundle_codes = set(bundle_codes or ())
	required_by_item: dict[str, dict] = {}
	for item in items:
		item_code = item.get("item_code")
		if not item_code or item.get("delivered_by_supplier") or item_code in bundle_codes:
			continue
		required = _required_pick_qty(item)
		if required <= 0:
			continue
		bucket = required_by_item.setdefault(
			item_code,
			{
				"item_code": item_code,
				"item_name": item.get("item_name") or item_code,
				"warehouse": item.get("warehouse"),
				"required": 0.0,
			},
		)
		bucket["required"] += required
		if item.get("warehouse") and not bucket.get("warehouse"):
			bucket["warehouse"] = item.get("warehouse")

	shortages = []
	for item_code, bucket in required_by_item.items():
		available = flt(available_by_item.get(item_code))
		if available + 0.000001 < bucket["required"]:
			shortages.append({**bucket, "available": available})
	return shortages


def _stock_shortages_for_orders(orders) -> dict[str, list[dict]]:
	so_names = [order.name for order in orders]
	if not so_names:
		return {}
	items = frappe.get_all(
		"Sales Order Item",
		filters={"parent": ["in", so_names]},
		fields=[
			"parent",
			"item_code",
			"item_name",
			"qty",
			"delivered_qty",
			"picked_qty",
			"warehouse",
			"conversion_factor",
			"delivered_by_supplier",
		],
	)
	by_order = defaultdict(list)
	for item in items:
		by_order[item.parent].append(item)
	item_codes = {item.item_code for item in items if item.item_code}
	bundle_codes = _bundle_item_codes(item_codes)
	available_by_company: dict[str, dict[str, float]] = {}
	result = {}
	for order in orders:
		company = order.get("company")
		if company not in available_by_company:
			available_by_company[company] = _company_available_qty(item_codes, company)
		result[order.name] = stock_shortages_for_items(
			by_order.get(order.name, []),
			available_by_item=available_by_company.get(company) or {},
			bundle_codes=bundle_codes,
		)
	return result


def _stock_reservation_names_for_order(so_name: str) -> list[str]:
	return frappe.get_all(
		"Stock Reservation Entry",
		filters={"voucher_type": "Sales Order", "voucher_no": so_name, "docstatus": 1},
		pluck="name",
	)


def unreserve_sales_order_stock(so_name: str) -> None:
	"""Annule les réservations ERPNext de la commande : incompatibles avec une Pick List."""
	for name in _stock_reservation_names_for_order(so_name):
		doc = frappe.get_doc("Stock Reservation Entry", name)
		if doc.docstatus != 1:
			continue
		doc.flags.ignore_permissions = True
		doc.cancel()


def _throw_if_insufficient_stock(so_name):
	so = frappe.get_doc("Sales Order", so_name)
	shortages = stock_shortages_for_items(
		so.items,
		available_by_item=_company_available_qty({item.item_code for item in so.items if item.item_code}, so.company),
		bundle_codes=_bundle_item_codes({item.item_code for item in so.items if item.item_code}),
	)
	if not shortages:
		return
	details = "; ".join(
		_("{0} : {1} demandé, {2} disponible{3}").format(
			row["item_name"],
			flt(row["required"], 3),
			flt(row["available"], 3),
			f" ({row['warehouse']})" if row.get("warehouse") else "",
		)
		for row in shortages
	)
	frappe.throw(
		_("Stock insuffisant pour créer la liste de prélèvement de {0}. {1}").format(so_name, details),
		title=_("Stock insuffisant"),
	)


def _draft_pick_lists_for_orders(sales_orders):
	if not sales_orders:
		return []
	rows = frappe.get_all(
		"Pick List Item",
		filters={"sales_order": ["in", sales_orders]},
		fields=["parent", "sales_order"],
	)
	by_parent = defaultdict(set)
	for row in rows:
		by_parent[row.parent].add(row.sales_order)
	if not by_parent:
		return []
	drafts = frappe.get_all(
		"Pick List",
		filters={"name": ["in", list(by_parent)], "docstatus": 0, "purpose": "Delivery"},
		pluck="name",
	)
	return [{"name": name, "sales_orders": by_parent[name]} for name in drafts]


def _attach_commune_names(orders):
	"""Ajoute le libellé métier des communes sans remplacer leur identifiant Link."""
	commune_ids = list(dict.fromkeys(order.get("custom_commune") for order in orders if order.get("custom_commune")))
	if not commune_ids:
		return orders
	communes = frappe.get_all(
		"Commune",
		filters={"name": ["in", commune_ids]},
		fields=["name", "nom"],
	)
	labels = {commune.name: commune.nom or commune.name for commune in communes}
	for order in orders:
		commune_id = order.get("custom_commune")
		order["custom_commune_nom"] = labels.get(commune_id, commune_id)
	return orders


def serialize_pick_list(doc):
	locations = []
	grouped_map = defaultdict(lambda: {"qty": 0, "stock_qty": 0, "picked_qty": 0, "rows": []})
	sales_orders = []
	for loc in doc.get("locations") or []:
		row = {
			"name": loc.name,
			"pick_list": doc.name,
			"item_code": loc.item_code,
			"item_name": loc.item_name,
			"warehouse": loc.warehouse,
			"qty": flt(loc.qty),
			"stock_qty": flt(loc.stock_qty),
			"picked_qty": flt(loc.picked_qty),
			"actual_qty": flt(loc.actual_qty),
			"uom": loc.uom,
			"stock_uom": loc.stock_uom,
			"sales_order": loc.sales_order,
			"sales_order_item": loc.sales_order_item,
			"batch_no": loc.batch_no,
			"serial_no": loc.serial_no,
		}
		locations.append(row)
		if loc.sales_order and loc.sales_order not in sales_orders:
			sales_orders.append(loc.sales_order)
		key = (loc.item_code or "", loc.warehouse or "")
		bucket = grouped_map[key]
		bucket["item_code"] = loc.item_code
		bucket["item_name"] = loc.item_name
		bucket["warehouse"] = loc.warehouse
		bucket["uom"] = loc.stock_uom or loc.uom
		bucket["qty"] += flt(loc.qty)
		bucket["stock_qty"] += flt(loc.stock_qty)
		bucket["picked_qty"] += flt(loc.picked_qty)
		bucket["rows"].append(row)

	grouped = [
		{
			"item_code": data["item_code"],
			"item_name": data["item_name"],
			"warehouse": data["warehouse"],
			"uom": data["uom"],
			"qty": data["qty"],
			"stock_qty": data["stock_qty"],
			"picked_qty": data["picked_qty"],
			"locations": data["rows"],
		}
		for data in grouped_map.values()
	]
	return {
		"name": doc.name,
		"docstatus": doc.docstatus,
		"status": doc.status,
		"purpose": doc.purpose,
		"company": doc.company,
		"customer": doc.customer,
		"parent_warehouse": doc.parent_warehouse,
		"locations": locations,
		"grouped": grouped,
		"sales_orders": sales_orders,
		"delivery_notes": _serialize_linked_delivery_notes(doc.name),
	}


def serialize_pick_session(docs):
	serialized = [serialize_pick_list(doc) for doc in docs]
	grouped_map = defaultdict(lambda: {"qty": 0, "stock_qty": 0, "picked_qty": 0, "locations": []})
	for pick_list in serialized:
		for location in pick_list["locations"]:
			key = (location.get("item_code") or "", location.get("warehouse") or "")
			bucket = grouped_map[key]
			bucket["item_code"] = location.get("item_code")
			bucket["item_name"] = location.get("item_name")
			bucket["warehouse"] = location.get("warehouse")
			bucket["uom"] = location.get("stock_uom") or location.get("uom")
			bucket["qty"] += flt(location.get("qty"))
			bucket["stock_qty"] += flt(location.get("stock_qty"))
			bucket["picked_qty"] += flt(location.get("picked_qty"))
			bucket["locations"].append(location)
	notes = []
	seen = set()
	for pick_list in serialized:
		for note in pick_list.get("delivery_notes") or []:
			name = note.get("name")
			if not name or name in seen:
				continue
			seen.add(name)
			notes.append(note)
	return {
		"name": "SESSION-" + "-".join(item["name"] for item in serialized),
		"pick_lists": serialized,
		"sales_orders": list(dict.fromkeys(so for item in serialized for so in item["sales_orders"])),
		"grouped": list(grouped_map.values()),
		"delivery_notes": notes,
	}


def _get_delivery_note_names(pick_list_name):
	rows = frappe.get_all(
		"Delivery Note Item",
		filters={"against_pick_list": pick_list_name},
		fields=["parent"],
	)
	return list(dict.fromkeys(row.parent for row in rows))


def _serialize_linked_delivery_notes(pick_list_name):
	return [serialize_delivery_note(frappe.get_doc("Delivery Note", name)) for name in _get_delivery_note_names(pick_list_name)]


def _copy_log_fields_from_sales_order(dn):
	so_names = {item.against_sales_order for item in (dn.items or []) if item.get("against_sales_order")}
	if not so_names:
		return
	so = frappe.get_doc("Sales Order", next(iter(so_names)))
	updates = {}
	for so_field, dn_field in LOG_SO_TO_DN_FIELDS:
		if not dn.meta.has_field(dn_field) or not so.meta.has_field(so_field):
			continue
		value = so.get(so_field)
		if value:
			updates[dn_field] = value
	if not updates:
		return
	frappe.db.set_value("Delivery Note", dn.name, updates, update_modified=False)
	for field, value in updates.items():
		dn.set(field, value)


def _is_from_pick_list(doc):
	return any(item.get("against_pick_list") for item in (doc.items or []))


@frappe.whitelist()
def get_sales_orders_to_pick(search=None, limit=100):
	"""Commandes soumises encore à prélever."""
	_require_preparation_role()
	limit = min(cint_or_default(limit, 100), 200)
	filters = {
		"docstatus": 1,
		"status": ["not in", list(CLOSED_SO_STATUSES)],
		"per_picked": ["<", 100],
		"per_delivered": ["<", 100],
	}
	or_filters = None
	if search:
		like = f"%{search}%"
		or_filters = [
			["name", "like", like],
			["customer_name", "like", like],
			["customer", "like", like],
		]
	fields = [
		"name",
		"customer",
		"customer_name",
		"transaction_date",
		"delivery_date",
		"grand_total",
		"total_qty",
		"per_picked",
		"per_delivered",
		"company",
		"status",
	]
	if frappe.get_meta("Sales Order").has_field("custom_commune"):
		fields.append("custom_commune")
	if frappe.get_meta("Sales Order").has_field("custom_wilaya"):
		fields.append("custom_wilaya")
	if frappe.get_meta("Sales Order").has_field("skip_delivery_note"):
		filters["skip_delivery_note"] = 0

	orders = frappe.get_all(
		"Sales Order",
		filters=filters,
		or_filters=or_filters,
		fields=fields,
		order_by="delivery_date asc, transaction_date asc",
		limit=limit,
	)
	so_names = [o.name for o in orders]
	drafts = {so: pl["name"] for pl in _draft_pick_lists_for_orders(so_names) for so in pl["sales_orders"]}
	shortages = _stock_shortages_for_orders(orders)
	for order in orders:
		order["draft_pick_list"] = drafts.get(order.name)
		order["stock_shortages"] = shortages.get(order.name, [])
	return _attach_commune_names(orders)


@frappe.whitelist()
def get_recent_pick_lists(limit=25):
	"""Retourne les dernières sessions et leurs BL pour la vue de préparation."""
	_require_preparation_role()
	rows = frappe.get_all(
		"Pick List",
		filters={"purpose": "Delivery", "docstatus": ["<", 2]},
		fields=["name", "docstatus", "status", "modified"],
		order_by="modified desc",
		limit=min(cint_or_default(limit, 25), 100),
	)
	for row in rows:
		row["sales_order_count"] = len(serialize_pick_list(frappe.get_doc("Pick List", row.name))["sales_orders"])
		row["delivery_notes"] = _get_delivery_note_names(row.name)
	return rows


def cint_or_default(value, default):
	try:
		return int(value)
	except (TypeError, ValueError):
		return default


@frappe.whitelist()
def create_pick_list_from_sales_orders(sales_orders):
	"""Crée une Pick List par commande et retourne une session groupée pour l'interface."""
	_require_preparation_role()
	sales_orders = _parse_list(sales_orders)
	if not sales_orders:
		frappe.throw(_("Sélectionnez au moins une commande."))

	sales_orders = list(dict.fromkeys(sales_orders))
	for name in sales_orders:
		_sales_order_pickable(name)

	from erpnext.selling.doctype.sales_order.sales_order import create_pick_list

	docs = []
	for so_name in sales_orders:
		existing = _draft_pick_lists_for_orders([so_name])
		if existing:
			orders = existing[0]["sales_orders"]
			if orders != {so_name}:
				frappe.throw(
					_("La commande {0} appartient à une ancienne Pick List groupée {1}.").format(
						so_name, existing[0]["name"]
					)
				)
			docs.append(frappe.get_doc("Pick List", existing[0]["name"]))
			continue
		_throw_if_insufficient_stock(so_name)
		unreserve_sales_order_stock(so_name)
		target = create_pick_list(so_name)
		if not target or not target.get("locations"):
			_throw_if_insufficient_stock(so_name)
			frappe.throw(_("Aucune ligne à prélever pour la commande {0}.").format(so_name))
		target.purpose = "Delivery"
		target.pick_manually = 0
		target.insert(ignore_permissions=True)
		docs.append(target)
	return serialize_pick_session(docs)


@frappe.whitelist()
def get_pick_list(pick_list):
	_require_preparation_role()
	return serialize_pick_list(frappe.get_doc("Pick List", pick_list))


@frappe.whitelist()
def get_pick_session(pick_lists):
	"""Recharge une session visuelle composée de Pick Lists unitaires."""
	_require_preparation_role()
	names = list(dict.fromkeys(_parse_list(pick_lists)))
	if not names:
		frappe.throw(_("La session de préparation est vide."))
	return serialize_pick_session([frappe.get_doc("Pick List", name) for name in names])


def _scan_barcode(search_value):
	from erpnext.stock.utils import scan_barcode

	return scan_barcode(search_value) or {}


def _uom_conversion_factor(item_code, uom):
	from erpnext.stock.get_item_details import get_conversion_factor

	return flt(get_conversion_factor(item_code, uom).get("conversion_factor"))


def _barcode_increment(item_code, barcode_uom, stock_uom):
	"""1 unité, ou le facteur de conversion si le code-barres a une UOM pack/carton."""
	if not barcode_uom or not stock_uom or barcode_uom == stock_uom:
		return 1.0
	factor = _uom_conversion_factor(item_code, barcode_uom)
	return factor if factor > 0 else 1.0


def _item_exists(name):
	return bool(frappe.db.exists("Item", name))


def _resolve_scanned_item(search_value):
	data = _scan_barcode(search_value)
	item_code = data.get("item_code")
	if not item_code and data.get("warehouse"):
		frappe.throw(_("Ce code correspond à un entrepôt, pas à un article."))
	if not item_code and _item_exists(search_value):
		item_code = search_value
		data = {"item_code": item_code}
	if not item_code:
		frappe.throw(_("Code-barres inconnu : {0}").format(search_value))
	return data


@frappe.whitelist()
def scan_pick_item(search_value, pick_lists):
	"""Résout un code-barres / article dans la session de préparation, sans écrire les quantités."""
	_require_preparation_role()
	search_value = (search_value or "").strip()
	if not search_value:
		frappe.throw(_("Scannez un code-barres."))

	data = _resolve_scanned_item(search_value)
	session = get_pick_session(pick_lists)
	item_code = data.get("item_code")
	locations = [
		location
		for pick_list in session.get("pick_lists") or []
		for location in pick_list.get("locations") or []
		if location.get("item_code") == item_code
	]
	if not locations:
		frappe.throw(_("Cet article n'est pas dans la session de préparation."))

	first = locations[0]
	stock_uom = first.get("stock_uom") or first.get("uom")
	barcode_uom = data.get("uom")
	return {
		"item_code": item_code,
		"item_name": first.get("item_name"),
		"uom": barcode_uom or stock_uom,
		"increment": _barcode_increment(item_code, barcode_uom, stock_uom),
		"barcode": data.get("barcode") or search_value,
	}


@frappe.whitelist()
def update_picked_qty(pick_list, locations):
	"""Enregistre les quantités prélevées sur une Pick List brouillon."""
	_require_preparation_role()
	locations = _parse_list(locations)
	doc = frappe.get_doc("Pick List", pick_list)
	if doc.docstatus != 0:
		frappe.throw(_("La Pick List {0} n'est plus modifiable.").format(pick_list))

	by_name = {row.name: row for row in doc.locations}
	for loc in locations:
		row = by_name.get(loc.get("name"))
		if not row:
			continue
		picked = loc.get("picked_qty")
		if picked is None:
			picked = loc.get("picked_qty")
		picked = flt(picked)
		if picked < 0:
			frappe.throw(_("Quantité prélevée invalide pour {0}.").format(row.item_code))
		if picked > flt(row.stock_qty):
			frappe.throw(_("La quantité prélevée dépasse la quantité demandée pour {0}.").format(row.item_code))
		row.picked_qty = picked

	doc.pick_manually = 1
	doc.save(ignore_permissions=True)
	return serialize_pick_list(doc)


def _create_delivery_notes(pick_list_name):
	from erpnext.stock.doctype.pick_list.pick_list import create_delivery_note

	create_delivery_note(pick_list_name)
	return _get_delivery_note_names(pick_list_name)


@frappe.whitelist()
def submit_pick_list_and_create_dns(pick_list):
	"""Soumet la Pick List puis crée les bons de livraison natifs."""
	_require_preparation_role()
	doc = frappe.get_doc("Pick List", pick_list)
	if doc.purpose != "Delivery":
		frappe.throw(_("Seules les Pick Lists de type Delivery peuvent créer un bon de livraison."))
	if not doc.locations:
		frappe.throw(_("La Pick List ne contient aucune ligne."))

	if doc.docstatus == 0:
		for loc in doc.locations:
			if loc.picked_qty is None:
				loc.picked_qty = flt(loc.stock_qty)
		doc.pick_manually = 1
		doc.flags.ignore_permissions = True
		doc.save(ignore_permissions=True)
		doc.submit()
	elif doc.docstatus != 1:
		frappe.throw(_("La Pick List {0} est annulée.").format(pick_list))

	existing = _get_delivery_note_names(doc.name)
	if not existing:
		existing = _create_delivery_notes(doc.name)
	if not existing:
		frappe.throw(_("Aucun bon de livraison n'a pu être créé depuis la Pick List {0}.").format(doc.name))

	notes = []
	for name in existing:
		dn = frappe.get_doc("Delivery Note", name)
		_copy_log_fields_from_sales_order(dn)
		status = dn.get("custom_statut") or "Nouveau"
		if status == "Nouveau":
			_apply_named_status(name, "Préparé")
			dn = frappe.get_doc("Delivery Note", name)
		notes.append(serialize_delivery_note(dn))

	return {
		"pick_list": serialize_pick_list(frappe.get_doc("Pick List", doc.name)),
		"delivery_notes": notes,
	}


def after_insert_delivery_note(doc, method=None):
	"""Copie les champs LOG et pose Préparé si le BL vient d'une Pick List."""
	if not _is_from_pick_list(doc):
		return
	_copy_log_fields_from_sales_order(doc)
	status = doc.get("custom_statut") or "Nouveau"
	if status == "Nouveau":
		_apply_named_status(doc.name, "Préparé")


def validate_delivery_note_requires_pick_list(doc, method=None):
	"""Interdit un BL créé depuis une commande sans Pick List (nouveaux documents)."""
	if not doc.is_new():
		return
	if frappe.flags.get("in_migrate") or frappe.flags.get("in_install") or frappe.flags.get("in_patch"):
		return
	if frappe.flags.get("allow_dn_without_pick_list"):
		return
	has_so = any(item.get("against_sales_order") for item in (doc.items or []))
	has_pl = any(item.get("against_pick_list") for item in (doc.items or []))
	if has_so and not has_pl:
		frappe.throw(
			_(
				"Les bons de livraison doivent être créés depuis une Pick List "
				"(Commande client → Pick List → Bon de livraison)."
			)
		)


def on_cancel_pick_list(doc, method=None):
	"""Supprime les BL draft encore Préparé/Nouveau liés à la Pick List."""
	if doc.purpose != "Delivery":
		return
	for name in _get_delivery_note_names(doc.name):
		dn = frappe.get_doc("Delivery Note", name)
		status = dn.get("custom_statut") or "Nouveau"
		if dn.docstatus != 0:
			frappe.throw(_("Impossible d'annuler : le bon {0} n'est plus en brouillon.").format(name))
		if status not in ("Préparé", "Nouveau"):
			frappe.throw(
				_("Impossible d'annuler : le bon {0} est au statut {1}.").format(name, status)
			)
		if frappe.db.exists("Livraison Bon de Livraison", {"bon_de_livraison": name}):
			frappe.throw(_("Impossible d'annuler : le bon {0} est déjà dans une tournée.").format(name))
		frappe.delete_doc("Delivery Note", name, ignore_permissions=True, force=True)


@frappe.whitelist()
def block_make_delivery_note(*args, **kwargs):
	frappe.throw(
		_(
			"Créez d'abord une Pick List, puis générez le bon de livraison depuis cette Pick List "
			"(Commande client → Pick List → Bon de livraison)."
		)
	)
