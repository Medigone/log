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


def serialize_pick_list(doc):
	locations = []
	grouped_map = defaultdict(lambda: {"qty": 0, "stock_qty": 0, "picked_qty": 0, "rows": []})
	sales_orders = []
	for loc in doc.get("locations") or []:
		row = {
			"name": loc.name,
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
	}


def _get_delivery_note_names(pick_list_name):
	rows = frappe.get_all(
		"Delivery Note Item",
		filters={"against_pick_list": pick_list_name},
		fields=["parent"],
	)
	return list(dict.fromkeys(row.parent for row in rows))


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
	for order in orders:
		order["draft_pick_list"] = drafts.get(order.name)
	return orders


def cint_or_default(value, default):
	try:
		return int(value)
	except (TypeError, ValueError):
		return default


@frappe.whitelist()
def create_pick_list_from_sales_orders(sales_orders):
	"""Crée (ou réutilise) une Pick List Delivery pour une ou plusieurs commandes."""
	sales_orders = _parse_list(sales_orders)
	if not sales_orders:
		frappe.throw(_("Sélectionnez au moins une commande."))

	sales_orders = list(dict.fromkeys(sales_orders))
	for name in sales_orders:
		_sales_order_pickable(name)

	existing = _draft_pick_lists_for_orders(sales_orders)
	selected = set(sales_orders)
	if len(existing) == 1 and selected <= existing[0]["sales_orders"]:
		return serialize_pick_list(frappe.get_doc("Pick List", existing[0]["name"]))
	if existing:
		names = ", ".join(pl["name"] for pl in existing)
		frappe.throw(
			_("Certaines commandes ont déjà une Pick List brouillon ({0}). Ouvrez-la ou annulez-la.").format(
				names
			)
		)

	from erpnext.selling.doctype.sales_order.sales_order import create_pick_list

	target = None
	for so_name in sales_orders:
		target = create_pick_list(so_name, target)

	if not target or not target.get("locations"):
		frappe.throw(_("Aucune ligne à prélever pour les commandes sélectionnées."))

	target.purpose = "Delivery"
	if len({frappe.db.get_value("Sales Order", n, "customer") for n in sales_orders}) > 1:
		target.customer = None
	target.pick_manually = 0
	target.insert(ignore_permissions=True)
	return serialize_pick_list(target)


@frappe.whitelist()
def get_pick_list(pick_list):
	return serialize_pick_list(frappe.get_doc("Pick List", pick_list))


@frappe.whitelist()
def update_picked_qty(pick_list, locations):
	"""Enregistre les quantités prélevées sur une Pick List brouillon."""
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
	doc = frappe.get_doc("Pick List", pick_list)
	if doc.purpose != "Delivery":
		frappe.throw(_("Seules les Pick Lists de type Delivery peuvent créer un bon de livraison."))
	if not doc.locations:
		frappe.throw(_("La Pick List ne contient aucune ligne."))

	if doc.docstatus == 0:
		for loc in doc.locations:
			if not flt(loc.picked_qty):
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
