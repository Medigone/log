# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Préparation native : Sales Order → Pick List → Delivery Note."""

from __future__ import annotations

import json
from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, flt

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


def _child_get(row, field, default=None):
	"""Lit un champ enfant sans AttributeError si le schéma ERPNext v15/v16 diverge."""
	if row is None:
		return default
	if hasattr(row, "get"):
		value = row.get(field)
		return default if value is None else value
	return getattr(row, field, default)


def _bin_actual_qty(item_code, warehouse):
	if not item_code or not warehouse:
		return 0.0
	return flt(frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": warehouse}, "actual_qty"))


def _location_actual_qty(loc):
	"""v16 stocke actual_qty sur Pick List Item ; v15 ne l'a pas — on lit le Bin."""
	stored = _child_get(loc, "actual_qty")
	if stored is not None:
		return flt(stored)
	return _bin_actual_qty(_child_get(loc, "item_code"), _child_get(loc, "warehouse"))


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


def _serialize_order_pick_lines(items, available_by_item, pick_by_item=None):
	"""Lignes commande pour la file de préparation et la fiche détail."""
	lines = []
	for item in items:
		item_code = item.get("item_code")
		if not item_code or item.get("delivered_by_supplier"):
			continue
		line = {
			"item_code": item_code,
			"item_name": item.get("item_name") or item_code,
			"warehouse": item.get("warehouse"),
			"required": _required_pick_qty(item),
			"available": flt(available_by_item.get(item_code)),
			"uom": item.get("stock_uom") or item.get("uom"),
		}
		if pick_by_item is not None:
			line["pick_list"] = pick_by_item.get(item.get("name"))
		lines.append(line)
	return lines


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


def has_available_stock_for_items(items, *, available_by_item: dict[str, float], bundle_codes=None) -> bool:
	"""True s’il reste au moins une unité prélevable (min demandé, disponible)."""
	bundle_codes = set(bundle_codes or ())
	for item in items:
		item_code = item.get("item_code")
		if not item_code or item.get("delivered_by_supplier") or item_code in bundle_codes:
			continue
		required = _required_pick_qty(item)
		if required <= 0:
			continue
		if min(required, flt(available_by_item.get(item_code))) > 0.000001:
			return True
	return False


def _stock_shortages_for_orders(orders) -> dict[str, dict]:
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
			"uom",
			"stock_uom",
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
		available = available_by_company.get(company) or {}
		order_items = by_order.get(order.name, [])
		result[order.name] = {
			"shortages": stock_shortages_for_items(
				order_items, available_by_item=available, bundle_codes=bundle_codes
			),
			"has_available_stock": has_available_stock_for_items(
				order_items, available_by_item=available, bundle_codes=bundle_codes
			),
			"items": _serialize_order_pick_lines(order_items, available),
		}
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


def _throw_if_no_available_stock(so_name):
	so = frappe.get_doc("Sales Order", so_name)
	item_codes = {item.item_code for item in so.items if item.item_code}
	shortages = stock_shortages_for_items(
		so.items,
		available_by_item=_company_available_qty(item_codes, so.company),
		bundle_codes=_bundle_item_codes(item_codes),
	)
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
		_("Aucun article disponible pour créer la liste de prélèvement de {0}.{1}").format(
			so_name, f" {details}" if details else ""
		),
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


def _draft_pick_list_names_by_order(sales_orders) -> dict[str, list[str]]:
	"""Commande → listes de prélèvement encore en brouillon, sans en écraser une."""
	by_order: dict[str, list[str]] = defaultdict(list)
	for pick_list in _draft_pick_lists_for_orders(sales_orders):
		name = pick_list["name"]
		for so_name in pick_list["sales_orders"]:
			if name not in by_order[so_name]:
				by_order[so_name].append(name)
	return by_order


def _active_pick_progress_for_orders(sales_orders) -> dict[str, dict]:
	"""Commande → pick lists actives (brouillon + soumise) et quantités prélevées."""
	empty = {"pick_lists": [], "picked_qty": 0.0, "requested_qty": 0.0}
	if not sales_orders:
		return {}
	rows = frappe.get_all(
		"Pick List Item",
		filters={"sales_order": ["in", list(sales_orders)]},
		fields=["parent", "sales_order", "qty", "stock_qty", "picked_qty"],
	)
	result = {name: dict(empty) for name in sales_orders}
	if not rows:
		return result
	parents = list({row.parent for row in rows if row.parent})
	lists = (
		frappe.get_all(
			"Pick List",
			filters={"name": ["in", parents], "docstatus": ["<", 2], "purpose": "Delivery"},
			fields=["name", "docstatus"],
		)
		if parents
		else []
	)
	by_name = {pl.name: pl for pl in lists}
	pick_lists_by_so = defaultdict(list)
	seen_pl = defaultdict(set)
	picked_by_so = defaultdict(float)
	requested_by_so = defaultdict(float)
	for row in rows:
		pl = by_name.get(row.parent)
		if not pl:
			continue
		so_name = row.sales_order
		if not so_name:
			continue
		if row.parent not in seen_pl[so_name]:
			seen_pl[so_name].add(row.parent)
			pick_lists_by_so[so_name].append({"name": pl.name, "docstatus": cint(pl.docstatus)})
		requested_by_so[so_name] += flt(row.get("stock_qty")) or flt(row.get("qty"))
		picked_by_so[so_name] += flt(row.get("picked_qty"))
	for name in sales_orders:
		lists_for_order = pick_lists_by_so.get(name) or []
		lists_for_order.sort(key=lambda pl: (cint(pl.get("docstatus")), pl.get("name") or ""))
		result[name] = {
			"pick_lists": lists_for_order,
			"picked_qty": picked_by_so.get(name, 0.0),
			"requested_qty": requested_by_so.get(name, 0.0),
		}
	return result


def _apply_order_pick_fields(order, progress=None, covering=None, draft_names=None):
	"""Pose pick_lists, quantités et flags de création sur une ligne commande."""
	progress = progress or {}
	lists = list(progress.get("pick_lists") or [])
	if not lists:
		for name in draft_names or []:
			lists.append({"name": name, "docstatus": 0})
		if covering and covering not in {pl.get("name") for pl in lists}:
			lists.append({"name": covering, "docstatus": 0})
	drafts = [pl["name"] for pl in lists if cint(pl.get("docstatus")) == 0]
	submitted = [pl["name"] for pl in lists if cint(pl.get("docstatus")) == 1]
	picked = flt(progress.get("picked_qty"))
	requested = flt(progress.get("requested_qty"))
	if not lists:
		requested = flt(order.get("total_qty"))
		picked = requested * flt(order.get("per_picked")) / 100.0 if flt(order.get("per_picked")) else 0.0
	elif requested <= 0:
		requested = flt(order.get("total_qty"))
	order["pick_lists"] = lists
	order["picked_qty"] = picked
	order["requested_qty"] = requested
	order["draft_pick_lists"] = drafts
	order["draft_pick_list"] = drafts[0] if drafts else None
	order["existing_pick_list"] = covering or (submitted[0] if submitted else None)
	order["can_create_pick_list"] = not lists
	return order


def pick_list_covers_remaining_items(remaining_by_so_item, pick_list_qty_by_so_item) -> bool:
	"""True si une Pick List couvre toutes les lignes encore à prélever de la commande."""
	if not remaining_by_so_item:
		return False
	for so_item, required in remaining_by_so_item.items():
		if flt(pick_list_qty_by_so_item.get(so_item)) + 0.000001 < flt(required):
			return False
	return True


def _remaining_qty_by_so_item(items) -> dict[str, float]:
	remaining = {}
	for item in items:
		if item.get("delivered_by_supplier"):
			continue
		required = _required_pick_qty(item)
		if required <= 0:
			continue
		name = item.get("name")
		if not name:
			continue
		remaining[name] = remaining.get(name, 0.0) + required
	return remaining


def _covering_pick_lists_for_orders(sales_orders) -> dict[str, str]:
	"""Commande → Pick List brouillon qui couvre encore toutes les lignes à prélever."""
	if not sales_orders:
		return {}
	so_items = frappe.get_all(
		"Sales Order Item",
		filters={"parent": ["in", list(sales_orders)]},
		fields=["name", "parent", "qty", "picked_qty", "delivered_qty", "conversion_factor", "delivered_by_supplier"],
	)
	remaining_by_order: dict[str, dict[str, float]] = defaultdict(dict)
	for item in so_items:
		remaining_by_order[item.parent].update(_remaining_qty_by_so_item([item]))

	pl_items = frappe.get_all(
		"Pick List Item",
		filters={"sales_order": ["in", list(sales_orders)]},
		fields=["parent", "sales_order", "sales_order_item", "qty"],
	)
	parents = list({row.parent for row in pl_items})
	if not parents:
		return {}
	active = set(
		frappe.get_all(
			"Pick List",
			filters={"name": ["in", parents], "docstatus": 0, "purpose": "Delivery"},
			pluck="name",
		)
	)
	qty_by_pl_so: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
	orders_on_pl: dict[str, set[str]] = defaultdict(set)
	for row in pl_items:
		if row.parent not in active or not row.sales_order_item:
			continue
		orders_on_pl[row.parent].add(row.sales_order)
		qty_by_pl_so[row.parent][row.sales_order_item] += flt(row.qty)

	covering = {}
	for so_name, remaining in remaining_by_order.items():
		for pl_name, orders in orders_on_pl.items():
			if so_name not in orders:
				continue
			if pick_list_covers_remaining_items(remaining, qty_by_pl_so[pl_name]):
				covering[so_name] = pl_name
				break
	return covering


def _pick_lists_by_so_item(sales_order) -> dict[str, str]:
	"""Ligne commande → Pick List active (brouillon d’abord, sinon la plus récente)."""
	if not sales_order:
		return {}
	rows = frappe.get_all(
		"Pick List Item",
		filters={"sales_order": sales_order},
		fields=["parent", "sales_order_item"],
	)
	if not rows:
		return {}
	parents = list({row.parent for row in rows if row.parent})
	if not parents:
		return {}
	lists = frappe.get_all(
		"Pick List",
		filters={"name": ["in", parents], "docstatus": ["<", 2], "purpose": "Delivery"},
		fields=["name", "docstatus", "modified"],
	)
	if not lists:
		return {}
	lists.sort(key=lambda pl: pl.modified or "", reverse=True)
	lists.sort(key=lambda pl: 0 if pl.docstatus == 0 else 1)
	rank = {pl.name: index for index, pl in enumerate(lists)}
	chosen: dict[str, str] = {}
	for row in rows:
		key = row.sales_order_item
		if not key or row.parent not in rank:
			continue
		previous = chosen.get(key)
		if previous is None or rank[row.parent] < rank[previous]:
			chosen[key] = row.parent
	return chosen


def _delete_stale_draft_pick_list(pick_list_name: str) -> None:
	if _get_delivery_note_names(pick_list_name):
		frappe.throw(
			_("Impossible de recréer : la Pick List {0} a déjà un bon de livraison.").format(pick_list_name)
		)
	frappe.delete_doc("Pick List", pick_list_name, ignore_permissions=True, force=True)


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
		item_code = _child_get(loc, "item_code")
		warehouse = _child_get(loc, "warehouse")
		sales_order = _child_get(loc, "sales_order")
		row = {
			"name": _child_get(loc, "name"),
			"pick_list": doc.name,
			"item_code": item_code,
			"item_name": _child_get(loc, "item_name"),
			"warehouse": warehouse,
			"qty": flt(_child_get(loc, "qty")),
			"stock_qty": flt(_child_get(loc, "stock_qty")),
			"picked_qty": flt(_child_get(loc, "picked_qty")),
			"actual_qty": _location_actual_qty(loc),
			"uom": _child_get(loc, "uom"),
			"stock_uom": _child_get(loc, "stock_uom"),
			"sales_order": sales_order,
			"sales_order_item": _child_get(loc, "sales_order_item"),
			"batch_no": _child_get(loc, "batch_no"),
			"serial_no": _child_get(loc, "serial_no"),
		}
		locations.append(row)
		if sales_order and sales_order not in sales_orders:
			sales_orders.append(sales_order)
		key = (item_code or "", warehouse or "")
		bucket = grouped_map[key]
		bucket["item_code"] = item_code
		bucket["item_name"] = _child_get(loc, "item_name")
		bucket["warehouse"] = warehouse
		bucket["uom"] = _child_get(loc, "stock_uom") or _child_get(loc, "uom")
		bucket["qty"] += flt(_child_get(loc, "qty"))
		bucket["stock_qty"] += flt(_child_get(loc, "stock_qty"))
		bucket["picked_qty"] += flt(_child_get(loc, "picked_qty"))
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
		"custom_order_changed": cint(doc.get("custom_order_changed")),
		"custom_order_changed_reason": doc.get("custom_order_changed_reason") or None,
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
	"""Commandes soumises à préparer, y compris celles déjà couvertes par une pick list."""
	_require_preparation_role()
	limit = min(cint_or_default(limit, 100), 200)
	filters = {
		"docstatus": 1,
		"status": ["!=", "Cancelled"],
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
	if frappe.get_meta("Sales Order").has_field("custom_preparation_status"):
		fields.append("custom_preparation_status")
	if frappe.get_meta("Sales Order").has_field("custom_preparation_accepte_par"):
		fields.append("custom_preparation_accepte_par")
	if frappe.get_meta("Sales Order").has_field("custom_preparation_date_acceptation"):
		fields.append("custom_preparation_date_acceptation")
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
	progress_by_order = _active_pick_progress_for_orders(so_names)
	covering = _covering_pick_lists_for_orders(so_names)
	stock_status = _stock_shortages_for_orders(orders)
	for order in orders:
		status = stock_status.get(order.name) or {}
		_apply_order_pick_fields(
			order,
			progress_by_order.get(order.name),
			covering=covering.get(order.name),
		)
		order["stock_shortages"] = status.get("shortages") or []
		order["has_available_stock"] = status.get("has_available_stock", False)
		order["items"] = status.get("items") or []
	return _attach_commune_names(orders)


def serialize_sales_order_pick_detail(so):
	"""Fiche synthèse : en-tête commande + lignes avec stock disponible."""
	name = so.get("name")
	items = so.get("items") or []
	item_codes = {item.get("item_code") for item in items if item.get("item_code")}
	available_by_item = _company_available_qty(item_codes, so.get("company"))
	bundle_codes = _bundle_item_codes(item_codes)
	pick_by_item = _pick_lists_by_so_item(name)
	lines = _serialize_order_pick_lines(items, available_by_item, pick_by_item)
	covering = _covering_pick_lists_for_orders([name]).get(name)
	draft_names = _draft_pick_list_names_by_order([name]).get(name) or []
	progress = _active_pick_progress_for_orders([name]).get(name) or {}
	header = {
		"name": name,
		"customer": so.get("customer"),
		"customer_name": so.get("customer_name"),
		"transaction_date": str(so.get("transaction_date") or "") or None,
		"delivery_date": str(so.get("delivery_date") or "") or None,
		"grand_total": flt(so.get("grand_total")),
		"total_qty": flt(so.get("total_qty")),
		"per_picked": flt(so.get("per_picked")),
		"per_delivered": flt(so.get("per_delivered")),
		"company": so.get("company"),
		"status": so.get("status"),
		"custom_commune": so.get("custom_commune"),
		"custom_wilaya": so.get("custom_wilaya"),
		"custom_preparation_status": so.get("custom_preparation_status") or None,
		"custom_preparation_accepte_par": so.get("custom_preparation_accepte_par") or None,
		"custom_preparation_date_acceptation": str(so.get("custom_preparation_date_acceptation") or "") or None,
		"has_available_stock": has_available_stock_for_items(
			items, available_by_item=available_by_item, bundle_codes=bundle_codes
		),
		"stock_shortages": stock_shortages_for_items(
			items, available_by_item=available_by_item, bundle_codes=bundle_codes
		),
		"items": lines,
	}
	_apply_order_pick_fields(header, progress, covering=covering, draft_names=draft_names)
	return _attach_commune_names([header])[0]


@frappe.whitelist()
def get_sales_order_pick_detail(sales_order):
	"""Retourne la fiche de préparation d'une commande client."""
	_require_preparation_role()
	if not sales_order or not frappe.db.exists("Sales Order", sales_order):
		frappe.throw(_("Commande introuvable."))
	return serialize_sales_order_pick_detail(frappe.get_doc("Sales Order", sales_order))


def _unique_labels(values):
	labels = []
	seen = set()
	for value in values:
		if value and value not in seen:
			seen.add(value)
			labels.append(value)
	return labels


def _enrich_recent_pick_lists(rows):
	"""Ajoute commandes, clients, wilayas et quantités sans charger chaque Pick List."""
	names = [row.get("name") for row in rows if row.get("name")]
	if not names:
		return []

	items = frappe.get_all(
		"Pick List Item",
		filters={"parent": ["in", names]},
		fields=[
			"parent",
			"sales_order",
			"qty",
			"stock_qty",
			"picked_qty",
			"warehouse",
			"item_code",
			"item_name",
			"uom",
			"stock_uom",
		],
	)
	dn_items = frappe.get_all(
		"Delivery Note Item",
		filters={"against_pick_list": ["in", names]},
		fields=["parent", "against_pick_list"],
	)

	orders_by_pl = defaultdict(list)
	seen_so = defaultdict(set)
	requested_by_pl = defaultdict(float)
	picked_by_pl = defaultdict(float)
	warehouses_by_pl = defaultdict(list)
	seen_wh = defaultdict(set)
	items_by_pl = defaultdict(dict)
	for item in items:
		parent = item.get("parent")
		if not parent:
			continue
		sales_order = item.get("sales_order")
		if sales_order and sales_order not in seen_so[parent]:
			seen_so[parent].add(sales_order)
			orders_by_pl[parent].append(sales_order)
		requested_by_pl[parent] += flt(item.get("stock_qty")) or flt(item.get("qty"))
		picked_by_pl[parent] += flt(item.get("picked_qty"))
		warehouse = item.get("warehouse")
		if warehouse and warehouse not in seen_wh[parent]:
			seen_wh[parent].add(warehouse)
			warehouses_by_pl[parent].append(warehouse)
		item_code = item.get("item_code")
		if not item_code:
			continue
		key = (item_code, warehouse or "", sales_order or "")
		bucket = items_by_pl[parent].get(key)
		if not bucket:
			bucket = {
				"item_code": item_code,
				"item_name": item.get("item_name") or item_code,
				"warehouse": warehouse,
				"sales_order": sales_order,
				"requested_qty": 0.0,
				"picked_qty": 0.0,
				"uom": item.get("stock_uom") or item.get("uom"),
			}
			items_by_pl[parent][key] = bucket
		bucket["requested_qty"] += flt(item.get("stock_qty")) or flt(item.get("qty"))
		bucket["picked_qty"] += flt(item.get("picked_qty"))

	all_so = list(dict.fromkeys(so for orders in orders_by_pl.values() for so in orders))
	so_rows = (
		frappe.get_all(
			"Sales Order",
			filters={"name": ["in", all_so]},
			fields=["name", "customer_name", "customer", "custom_wilaya"],
		)
		if all_so
		else []
	)
	name_by_so = {row.name: (row.customer_name or row.customer or "") for row in so_rows}
	wilaya_by_so = {row.name: (row.get("custom_wilaya") or "") for row in so_rows}

	customers_by_pl = {}
	wilayas_by_pl = {}
	for pick_list, sales_orders in orders_by_pl.items():
		customers_by_pl[pick_list] = _unique_labels(name_by_so.get(sales_order) for sales_order in sales_orders)
		wilayas_by_pl[pick_list] = _unique_labels(wilaya_by_so.get(sales_order) for sales_order in sales_orders)

	notes_by_pl = defaultdict(list)
	seen_dn = defaultdict(set)
	for row in dn_items:
		pick_list = row.get("against_pick_list")
		note = row.get("parent")
		if pick_list and note and note not in seen_dn[pick_list]:
			seen_dn[pick_list].add(note)
			notes_by_pl[pick_list].append(note)

	enriched = []
	for row in rows:
		name = row.get("name")
		sales_orders = list(orders_by_pl.get(name) or [])
		enriched.append(
			{
				"name": name,
				"docstatus": row.get("docstatus"),
				"status": row.get("status"),
				"modified": row.get("modified"),
				"sales_orders": sales_orders,
				"sales_order_count": len(sales_orders),
				"customer_names": customers_by_pl.get(name, []),
				"wilayas": wilayas_by_pl.get(name, []),
				"requested_qty": requested_by_pl.get(name, 0),
				"picked_qty": picked_by_pl.get(name, 0),
				"warehouses": warehouses_by_pl.get(name, []),
				"delivery_notes": list(notes_by_pl.get(name) or []),
				"items": list(items_by_pl.get(name, {}).values()),
				"custom_order_changed": cint(row.get("custom_order_changed")),
				"custom_order_changed_reason": row.get("custom_order_changed_reason") or None,
			}
		)
	return enriched


@frappe.whitelist()
def get_recent_pick_lists(limit=25):
	"""Retourne les dernières sessions et leurs BL pour la vue de préparation."""
	_require_preparation_role()
	fields = ["name", "docstatus", "status", "modified"]
	try:
		rows = frappe.get_all(
			"Pick List",
			filters={"purpose": "Delivery", "docstatus": ["<", 2]},
			fields=fields + ["custom_order_changed", "custom_order_changed_reason"],
			order_by="modified desc",
			limit=min(cint_or_default(limit, 25), 100),
		)
	except Exception:
		rows = frappe.get_all(
			"Pick List",
			filters={"purpose": "Delivery", "docstatus": ["<", 2]},
			fields=fields,
			order_by="modified desc",
			limit=min(cint_or_default(limit, 25), 100),
		)
	return _enrich_recent_pick_lists(rows)


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
	from log.order_change_ops import assert_preparation_modification_accepted

	assert_preparation_modification_accepted(sales_orders)
	for name in sales_orders:
		_sales_order_pickable(name)

	from erpnext.selling.doctype.sales_order.sales_order import create_pick_list

	docs = []
	empty_orders = []
	for so_name in sales_orders:
		covering = _covering_pick_lists_for_orders([so_name]).get(so_name)
		if covering:
			docs.append(frappe.get_doc("Pick List", covering))
			continue
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
		unreserve_sales_order_stock(so_name)
		target = create_pick_list(so_name)
		if not target or not target.get("locations"):
			empty_orders.append(so_name)
			continue
		target.purpose = "Delivery"
		target.pick_manually = 0
		target.insert(ignore_permissions=True)
		docs.append(target)
	if not docs:
		_throw_if_no_available_stock(empty_orders[0] if empty_orders else sales_orders[0])
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
	docs = [frappe.get_doc("Pick List", name) for name in names]
	session = serialize_pick_session(docs)
	from log.order_change_ops import pending_modified_sales_orders, pending_order_change_notice, sales_orders_from_pick_docs

	notice = pending_order_change_notice(docs)
	if notice:
		session["order_changed_notice"] = notice
	pending = pending_modified_sales_orders(sales_orders_from_pick_docs(docs))
	session["pending_sales_orders"] = pending
	session["modification_pending"] = bool(pending)
	return session


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
	from log.order_change_ops import assert_preparation_modification_accepted

	assert_preparation_modification_accepted(session.get("sales_orders") or session.get("pending_sales_orders") or [])
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
	from log.order_change_ops import assert_preparation_modification_accepted, sales_orders_from_pick_docs

	assert_preparation_modification_accepted(sales_orders_from_pick_docs([doc]))
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
	from log.order_change_ops import assert_preparation_modification_accepted, sales_orders_from_pick_docs

	assert_preparation_modification_accepted(sales_orders_from_pick_docs([doc]))
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
		from log.order_change_ops import clear_order_changed_status

		clear_order_changed_status(doc)
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
