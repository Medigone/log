# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Inventaire : comptage à l'aveugle par scan, sans bloquer l'activité.

On ne passe pas en stock la quantité comptée mais l'écart constaté au moment
du comptage : quantité finale = stock actuel + (compté − théorique au comptage).
Les mouvements survenus entre le comptage et la validation sont ainsi conservés.
"""

from __future__ import annotations

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, now_datetime

from log.api.distribution import (
	MANAGER_ROLES,
	PREPARATION_ROLES,
	RECEIPT_ROLES,
	_payload,
	_require,
)
from log.pick_list_ops import _parse_list, _uom_conversion_factor
from log.utils.batches import batch_expiry_map

INVENTORY_ROLES = RECEIPT_ROLES | PREPARATION_ROLES
COUNTING_STATUSES = ("En cours",)
OPEN_STATUSES = ("Brouillon", "En cours", "En revue")
SCOPE_DOCTYPES = ("Warehouse", "Item Group", "Brand", "Item")
LINE_FIELDS = (
	"name",
	"item_code",
	"item_name",
	"warehouse",
	"batch_no",
	"stock_uom",
	"status",
	"hors_liste",
	"round",
	"snapshot_qty",
	"expected_at_count",
	"counted_qty",
	"first_count_qty",
	"valuation_rate",
	"last_counted_at",
	"last_counted_by",
)
QUEUE_THRESHOLD = 300


# --- Calculs purs ---------------------------------------------------------------


def target_qty(current, counted, expected_at_count) -> float:
	"""Quantité à passer en stock : stock actuel + écart constaté, jamais négative."""
	return max(flt(current) + flt(counted) - flt(expected_at_count), 0.0)


def needs_recount(expected, counted, threshold_qty=0, threshold_pct=0) -> bool:
	"""Écart au-delà des deux seuils (quantité ET pourcentage)."""
	diff = abs(flt(counted) - flt(expected))
	if diff <= 0 or diff <= flt(threshold_qty):
		return False
	if not flt(expected):
		return True
	return diff * 100 / abs(flt(expected)) > flt(threshold_pct)


def line_key(item_code, warehouse, batch_no=None) -> tuple[str, str, str]:
	return (cstr(item_code), cstr(warehouse), cstr(batch_no))


def scope_from_rows(rows) -> dict[str, list[str]]:
	scope: dict[str, list[str]] = {doctype: [] for doctype in SCOPE_DOCTYPES}
	for row in rows or []:
		doctype = row.get("link_doctype")
		value = row.get("link_name")
		if doctype in scope and value and value not in scope[doctype]:
			scope[doctype].append(value)
	return scope


# --- Accès & lecture ----------------------------------------------------------


def _can_validate() -> bool:
	from log.api.distribution import _roles
	from log.api.distribution_rules import has_any_role

	return has_any_role(_roles(), MANAGER_ROLES)


def _get_inventory(name, statuses=None):
	if not name or not frappe.db.exists("Inventaire", name):
		frappe.throw(_("Inventaire introuvable : {0}").format(name))
	doc = frappe.get_doc("Inventaire", name)
	if statuses and doc.status not in statuses:
		frappe.throw(_("L'inventaire {0} est « {1} ».").format(name, doc.status))
	return doc


def _default_company():
	from log.receipt_ops import _default_company as default_company

	return default_company()


def _company_warehouses(company) -> list[str]:
	from log.receipt_ops import _receiving_warehouses

	return _receiving_warehouses(company)


def _scope_warehouses(doc) -> list[str]:
	selected = scope_from_rows(doc.get("perimetre"))["Warehouse"]
	return selected or _company_warehouses(doc.company)


def _scope_item_filters(scope) -> dict:
	from frappe.utils.nestedset import get_descendants_of

	filters: dict = {"is_stock_item": 1, "disabled": 0, "has_serial_no": 0}
	if scope["Item Group"]:
		groups = set(scope["Item Group"])
		for group in scope["Item Group"]:
			groups.update(get_descendants_of("Item Group", group) or [])
		filters["item_group"] = ["in", sorted(groups)]
	if scope["Brand"]:
		filters["brand"] = ["in", scope["Brand"]]
	if scope["Item"]:
		filters["name"] = ["in", scope["Item"]]
	return filters


def _scope_items(doc) -> dict:
	scope = scope_from_rows(doc.get("perimetre"))
	rows = frappe.get_all(
		"Item",
		filters=_scope_item_filters(scope),
		fields=["name", "item_name", "stock_uom", "has_batch_no", "has_expiry_date", "valuation_rate"],
		limit_page_length=0,
	)
	return {row.name: row for row in rows}


def _bin_rows(item_codes, warehouses) -> list:
	if not item_codes or not warehouses:
		return []
	return frappe.get_all(
		"Bin",
		filters={"item_code": ["in", list(item_codes)], "warehouse": ["in", list(warehouses)]},
		fields=["item_code", "warehouse", "actual_qty", "valuation_rate"],
		limit_page_length=0,
	)


def _batch_balances(item_code, warehouses) -> list:
	from erpnext.stock.doctype.batch.batch import get_batch_qty

	rows = get_batch_qty(item_code=item_code, for_stock_levels=True, ignore_reserved_stock=True) or []
	allowed = set(warehouses)
	totals = defaultdict(float)
	for row in rows:
		if row.get("warehouse") in allowed and row.get("batch_no"):
			totals[(row.get("batch_no"), row.get("warehouse"))] += flt(row.get("qty"))
	return [
		{"batch_no": batch_no, "warehouse": warehouse, "qty": qty}
		for (batch_no, warehouse), qty in totals.items()
		if qty
	]


def _current_qty(item_code, warehouse, batch_no=None) -> float:
	if batch_no:
		from erpnext.stock.doctype.batch.batch import get_batch_qty

		return flt(
			get_batch_qty(
				batch_no=batch_no,
				warehouse=warehouse,
				item_code=item_code,
				for_stock_levels=True,
				ignore_reserved_stock=True,
			)
		)
	return flt(frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": warehouse}, "actual_qty"))


def _progress(name) -> dict:
	rows = frappe.db.sql(
		"""select status, count(*) as n from `tabLigne Inventaire`
		where inventaire = %s group by status""",
		name,
		as_dict=True,
	)
	by_status = {row.status: cint(row.n) for row in rows}
	total = sum(by_status.values())
	counted = by_status.get("Compté", 0)
	return {
		"total": total,
		"counted": counted,
		"to_count": by_status.get("À compter", 0),
		"to_recount": by_status.get("À recompter", 0),
		"percent": round(counted * 100 / total, 1) if total else 0,
	}


def serialize_inventory(doc, with_progress=True) -> dict:
	scope = scope_from_rows(doc.get("perimetre"))
	data = {
		"name": doc.name,
		"titre": doc.titre,
		"company": doc.company,
		"status": doc.status,
		"scope_type": doc.scope_type,
		"blind": bool(cint(doc.blind)),
		"include_zero_stock": bool(cint(doc.include_zero_stock)),
		"recount_threshold_qty": flt(doc.recount_threshold_qty),
		"recount_threshold_pct": flt(doc.recount_threshold_pct),
		"warehouses": scope["Warehouse"],
		"item_groups": scope["Item Group"],
		"brands": scope["Brand"],
		"items": scope["Item"],
		"opened_by": doc.opened_by,
		"opened_at": str(doc.opened_at) if doc.opened_at else None,
		"validated_by": doc.validated_by,
		"validated_at": str(doc.validated_at) if doc.validated_at else None,
		"stock_reconciliation": doc.stock_reconciliation,
		"notes": doc.notes,
		"owner": doc.owner,
		"creation": str(doc.creation) if doc.get("creation") else None,
		"can_validate": _can_validate(),
	}
	if with_progress:
		data["progress"] = _progress(doc.name)
	return data


# --- Options & périmètre ------------------------------------------------------


@frappe.whitelist()
def get_inventory_options():
	_require(INVENTORY_ROLES)
	from log.catalog_ops import _group_tree

	company = _default_company()
	return {
		"company": company,
		"warehouses": _company_warehouses(company) if company else [],
		"item_groups": _group_tree(),
		"brands": sorted(frappe.get_all("Brand", pluck="name")),
		"can_validate": _can_validate(),
	}


def _scope_rows(data) -> list[dict]:
	rows = []
	for key, doctype in (
		("warehouses", "Warehouse"),
		("item_groups", "Item Group"),
		("brands", "Brand"),
		("items", "Item"),
	):
		for value in _parse_list(data.get(key) or []):
			if not frappe.db.exists(doctype, value):
				frappe.throw(_("{0} introuvable : {1}").format(_(doctype), value))
			rows.append({"link_doctype": doctype, "link_name": value})
	return rows


@frappe.whitelist()
def preview_scope(payload):
	_require(MANAGER_ROLES)
	data = _payload(payload)
	doc = frappe._dict(company=data.get("company") or _default_company(), perimetre=_scope_rows(data))
	warehouses = _scope_warehouses(doc)
	items = _scope_items(doc)
	bins = [row for row in _bin_rows(items.keys(), warehouses) if flt(row.actual_qty)]
	return {
		"warehouses": len(warehouses),
		"items": len(items),
		"items_in_stock": len({row.item_code for row in bins}),
		"stock_lines": len(bins),
		"batch_items": sum(1 for item in items.values() if cint(item.has_batch_no)),
	}


@frappe.whitelist()
def list_inventories(status=None, limit=100):
	_require(INVENTORY_ROLES)
	filters = {}
	if status:
		filters["status"] = ["in", _parse_list(status)] if str(status).startswith("[") else status
	names = frappe.get_all(
		"Inventaire",
		filters=filters,
		pluck="name",
		order_by="creation desc",
		limit_page_length=min(cint(limit) or 100, 500),
	)
	return [serialize_inventory(frappe.get_doc("Inventaire", name)) for name in names]


@frappe.whitelist()
def get_inventory(name):
	_require(INVENTORY_ROLES)
	return serialize_inventory(_get_inventory(name))


@frappe.whitelist()
def create_inventory(payload):
	_require(MANAGER_ROLES)
	data = _payload(payload)
	titre = (data.get("titre") or "").strip()
	if not titre:
		frappe.throw(_("Saisissez un titre pour l'inventaire."))
	rows = _scope_rows(data)
	scope_type = "Partiel" if rows else "Global"
	doc = frappe.get_doc(
		{
			"doctype": "Inventaire",
			"titre": titre,
			"company": data.get("company") or _default_company(),
			"status": "Brouillon",
			"scope_type": scope_type,
			"blind": 1 if data.get("blind", True) else 0,
			"include_zero_stock": 1 if data.get("include_zero_stock") else 0,
			"recount_threshold_qty": flt(data.get("recount_threshold_qty")),
			"recount_threshold_pct": flt(data.get("recount_threshold_pct", 5)),
			"notes": data.get("notes"),
			"perimetre": rows,
		}
	)
	doc.insert(ignore_permissions=True)
	return serialize_inventory(doc)


# --- Ouverture : génération des lignes ----------------------------------------


def build_lines(items, warehouses, bins, batch_balances, include_zero_stock) -> list[dict]:
	"""Lignes à compter : (article, entrepôt[, lot]) avec le stock à l'ouverture."""
	lines: dict[tuple, dict] = {}
	rates = {(row.item_code, row.warehouse): flt(row.valuation_rate) for row in bins}

	def add(item, warehouse, qty, batch_no=None):
		key = line_key(item.name, warehouse, batch_no)
		if key in lines:
			lines[key]["snapshot_qty"] += flt(qty)
			return
		lines[key] = {
			"item_code": item.name,
			"item_name": item.item_name,
			"warehouse": warehouse,
			"batch_no": batch_no,
			"stock_uom": item.stock_uom,
			"snapshot_qty": flt(qty),
			"valuation_rate": rates.get((item.name, warehouse)) or flt(item.valuation_rate),
		}

	for row in bins:
		item = items.get(row.item_code)
		if item and not cint(item.has_batch_no) and flt(row.actual_qty):
			add(item, row.warehouse, row.actual_qty)
	for item_code, balances in batch_balances.items():
		for balance in balances:
			add(items[item_code], balance["warehouse"], balance["qty"], balance["batch_no"])
	if include_zero_stock:
		for item in items.values():
			if cint(item.has_batch_no):
				continue
			for warehouse in warehouses:
				if line_key(item.name, warehouse) not in lines:
					add(item, warehouse, 0)
	return sorted(lines.values(), key=lambda line: (line["warehouse"], line["item_code"], cstr(line["batch_no"])))


def _insert_lines(inventory, lines):
	if not lines:
		return
	now = now_datetime()
	user = frappe.session.user
	fields = [
		"name",
		"creation",
		"modified",
		"owner",
		"modified_by",
		"docstatus",
		"inventaire",
		"item_code",
		"item_name",
		"warehouse",
		"batch_no",
		"stock_uom",
		"status",
		"hors_liste",
		"round",
		"snapshot_qty",
		"expected_at_count",
		"counted_qty",
		"first_count_qty",
		"valuation_rate",
	]
	values = [
		(
			frappe.generate_hash(length=12),
			now,
			now,
			user,
			user,
			0,
			inventory,
			line["item_code"],
			line.get("item_name"),
			line["warehouse"],
			line.get("batch_no"),
			line.get("stock_uom"),
			line.get("status") or "À compter",
			cint(line.get("hors_liste")),
			1,
			flt(line.get("snapshot_qty")),
			flt(line.get("snapshot_qty")),
			0,
			0,
			flt(line.get("valuation_rate")),
		)
		for line in lines
	]
	frappe.db.bulk_insert("Ligne Inventaire", fields, values, chunk_size=1000)


@frappe.whitelist()
def start_inventory(name):
	_require(MANAGER_ROLES)
	doc = _get_inventory(name, ("Brouillon",))
	warehouses = _scope_warehouses(doc)
	if not warehouses:
		frappe.throw(_("Aucun entrepôt dans le périmètre."))
	items = _scope_items(doc)
	if not items:
		frappe.throw(_("Aucun article stockable dans le périmètre."))
	bins = _bin_rows(items.keys(), warehouses)
	batch_items = {row.item_code for row in bins if flt(row.actual_qty) and cint(items[row.item_code].has_batch_no)}
	batch_balances = {code: _batch_balances(code, warehouses) for code in sorted(batch_items)}
	lines = build_lines(items, warehouses, bins, batch_balances, cint(doc.include_zero_stock))
	_insert_lines(doc.name, lines)
	doc.db_set({"status": "En cours", "opened_by": frappe.session.user, "opened_at": now_datetime()})
	return serialize_inventory(doc)


# --- Comptage -----------------------------------------------------------------


@frappe.whitelist()
def get_scan_index(name):
	"""Codes-barres et unités du périmètre, pour résoudre les scans sur l'appareil."""
	_require(INVENTORY_ROLES)
	doc = _get_inventory(name)
	items = _scope_items(doc)
	codes = list(items.keys())
	uoms = defaultdict(dict)
	barcodes = {}
	if codes:
		for row in frappe.get_all(
			"UOM Conversion Detail",
			filters={"parent": ["in", codes], "parenttype": "Item"},
			fields=["parent", "uom", "conversion_factor"],
			limit_page_length=0,
		):
			uoms[row.parent][row.uom] = flt(row.conversion_factor) or 1
		for row in frappe.get_all(
			"Item Barcode",
			filters={"parent": ["in", codes], "parenttype": "Item"},
			fields=["parent", "barcode", "uom"],
			limit_page_length=0,
		):
			if row.barcode:
				barcodes[cstr(row.barcode).strip()] = {"item_code": row.parent, "uom": row.uom or None}
	return {
		"warehouses": _scope_warehouses(doc),
		"items": {
			code: {
				"item_name": item.item_name,
				"stock_uom": item.stock_uom,
				"has_batch_no": bool(cint(item.has_batch_no)),
				"has_expiry_date": bool(cint(item.has_expiry_date)),
				"uoms": {item.stock_uom: 1, **uoms.get(code, {})},
			}
			for code, item in items.items()
		},
		"barcodes": barcodes,
	}


@frappe.whitelist()
def get_count_sheet(name, warehouse=None, status=None, search=None):
	"""Lignes à compter, sans quantité théorique quand le comptage est à l'aveugle."""
	_require(INVENTORY_ROLES)
	doc = _get_inventory(name)
	filters = {"inventaire": doc.name}
	if warehouse:
		filters["warehouse"] = warehouse
	if status:
		filters["status"] = status
	or_filters = None
	search = (search or "").strip()
	if search:
		or_filters = [["item_code", "like", f"%{search}%"], ["item_name", "like", f"%{search}%"]]
	rows = frappe.get_all(
		"Ligne Inventaire",
		filters=filters,
		or_filters=or_filters,
		fields=list(LINE_FIELDS),
		order_by="warehouse asc, item_code asc, batch_no asc",
		limit_page_length=0,
	)
	expiry = batch_expiry_map(row.batch_no for row in rows)
	show_expected = not cint(doc.blind) or _can_validate()
	return [_serialize_line(row, expiry, show_expected) for row in rows]


def _serialize_line(row, expiry, show_expected=False) -> dict:
	data = {
		"name": row.name,
		"item_code": row.item_code,
		"item_name": row.item_name,
		"warehouse": row.warehouse,
		"batch_no": row.batch_no,
		"expiry_date": expiry.get(row.batch_no),
		"stock_uom": row.stock_uom,
		"status": row.status,
		"hors_liste": bool(cint(row.hors_liste)),
		"round": cint(row.round) or 1,
		"counted_qty": flt(row.counted_qty),
		"last_counted_at": str(row.last_counted_at) if row.last_counted_at else None,
		"last_counted_by": row.last_counted_by,
	}
	if show_expected:
		data["snapshot_qty"] = flt(row.snapshot_qty)
		data["expected_at_count"] = flt(row.expected_at_count)
	return data


@frappe.whitelist()
def item_batches(name, item_code, warehouse):
	_require(INVENTORY_ROLES)
	doc = _get_inventory(name)
	known = set(
		frappe.get_all(
			"Ligne Inventaire",
			filters={"inventaire": doc.name, "item_code": item_code, "warehouse": warehouse},
			pluck="batch_no",
		)
	)
	known.update(frappe.get_all("Batch", filters={"item": item_code, "disabled": 0}, pluck="name"))
	known.discard(None)
	expiry = batch_expiry_map(known)
	batches = [{"batch_no": batch, "expiry_date": expiry.get(batch)} for batch in known]
	return sorted(batches, key=lambda row: (row["expiry_date"] or "9999-12-31", row["batch_no"]))


def _scope_allows_item(doc, item_code) -> bool:
	filters = _scope_item_filters(scope_from_rows(doc.get("perimetre")))
	if "name" in filters and item_code not in filters["name"][1]:
		return False
	filters["name"] = item_code
	return bool(frappe.db.exists("Item", filters))


def _find_or_create_line(doc, item_code, warehouse, batch_no) -> str:
	name = frappe.db.get_value(
		"Ligne Inventaire",
		{"inventaire": doc.name, "item_code": item_code, "warehouse": warehouse, "batch_no": batch_no or ["is", "not set"]},
		"name",
	)
	if name:
		return name
	if not _scope_allows_item(doc, item_code):
		frappe.throw(_("L'article {0} est hors du périmètre de l'inventaire.").format(item_code))
	item = frappe.db.get_value("Item", item_code, ["name", "item_name", "stock_uom", "valuation_rate"], as_dict=True)
	snapshot = _current_qty(item_code, warehouse, batch_no)
	_insert_lines(
		doc.name,
		[
			{
				"item_code": item_code,
				"item_name": item.item_name,
				"warehouse": warehouse,
				"batch_no": batch_no,
				"stock_uom": item.stock_uom,
				"snapshot_qty": snapshot,
				"valuation_rate": flt(item.valuation_rate),
				"hors_liste": 1,
			}
		],
	)
	return frappe.db.get_value(
		"Ligne Inventaire",
		{"inventaire": doc.name, "item_code": item_code, "warehouse": warehouse, "batch_no": batch_no or ["is", "not set"]},
		"name",
	)


def _refresh_line(line_name, expected=None, user=None):
	"""Recalcule la quantité comptée du tour courant à partir du journal."""
	line = frappe.db.get_value("Ligne Inventaire", line_name, ["round", "status"], as_dict=True)
	total, entries = frappe.db.sql(
		"""select coalesce(sum(qty), 0), count(*) from `tabSaisie Inventaire`
		where ligne = %s and `round` = %s and annulee = 0""",
		(line_name, cint(line["round"]) or 1),
	)[0]
	if flt(total) < 0:
		frappe.throw(_("La quantité comptée ne peut pas être négative."))
	if entries:
		status = "Compté"
	else:
		status = "À recompter" if cint(line["round"]) > 1 else "À compter"
	values = {"counted_qty": flt(total), "status": status}
	if expected is not None:
		values.update(
			{"expected_at_count": flt(expected), "last_counted_at": now_datetime(), "last_counted_by": user}
		)
	frappe.db.set_value("Ligne Inventaire", line_name, values, update_modified=True)
	return values


def _record_one(doc, entry, warehouses, user) -> dict:
	from log.receipt_ops import _ensure_batch

	client_uuid = cstr(entry.get("client_uuid")).strip()
	if not client_uuid:
		frappe.throw(_("Identifiant de saisie manquant."))
	existing = frappe.db.get_value("Saisie Inventaire", {"client_uuid": client_uuid}, ["ligne"], as_dict=True)
	if existing:
		return {"client_uuid": client_uuid, "status": "duplicate", "line": existing.ligne}

	item_code = cstr(entry.get("item_code")).strip()
	warehouse = cstr(entry.get("warehouse")).strip()
	if warehouse not in warehouses:
		frappe.throw(_("L'entrepôt {0} n'est pas dans l'inventaire.").format(warehouse))
	item = frappe.db.get_value(
		"Item", item_code, ["name", "stock_uom", "has_batch_no", "has_serial_no"], as_dict=True
	)
	if not item:
		frappe.throw(_("Article introuvable : {0}").format(item_code))
	if cint(item.has_serial_no):
		frappe.throw(_("Les articles avec numéro de série ne sont pas gérés par l'inventaire."))
	batch_no = cstr(entry.get("batch_no")).strip() or None
	if cint(item.has_batch_no):
		if not batch_no:
			frappe.throw(_("Choisissez le lot de l'article {0}.").format(item_code))
		_ensure_batch(item_code, batch_no, entry.get("expiry_date"))
	else:
		batch_no = None

	uom = entry.get("uom") or item.stock_uom
	factor = 1.0 if uom == item.stock_uom else _uom_conversion_factor(item_code, uom)
	if factor <= 0:
		frappe.throw(_("Unité {0} non définie pour l'article {1}.").format(uom, item_code))
	qty = flt(entry.get("qty")) * factor
	if not qty:
		frappe.throw(_("Quantité nulle."))

	line_name = _find_or_create_line(doc, item_code, warehouse, batch_no)
	line_round = cint(frappe.db.get_value("Ligne Inventaire", line_name, "round")) or 1
	frappe.get_doc(
		{
			"doctype": "Saisie Inventaire",
			"inventaire": doc.name,
			"ligne": line_name,
			"client_uuid": client_uuid,
			"round": line_round,
			"qty": qty,
			"uom": uom,
			"conversion_factor": factor,
			"mode": "manuel" if entry.get("mode") == "manuel" else "scan",
			"barcode": entry.get("barcode"),
			"counted_at": now_datetime(),
			"user": user,
		}
	).insert(ignore_permissions=True)
	values = _refresh_line(line_name, _current_qty(item_code, warehouse, batch_no), user)
	return {
		"client_uuid": client_uuid,
		"status": "ok",
		"line": line_name,
		"counted_qty": values["counted_qty"],
	}


@frappe.whitelist()
def record_counts(name, entries):
	"""Enregistre un lot de saisies ; rejouer un même client_uuid est sans effet."""
	_require(INVENTORY_ROLES)
	doc = _get_inventory(name, COUNTING_STATUSES)
	warehouses = set(_scope_warehouses(doc))
	user = frappe.session.user
	results = []
	for entry in _parse_list(entries):
		if not isinstance(entry, dict):
			continue
		savepoint = "inventory_entry"
		frappe.db.savepoint(savepoint)
		try:
			results.append(_record_one(doc, entry, warehouses, user))
		except frappe.ValidationError as exc:
			frappe.db.rollback(save_point=savepoint)
			frappe.clear_messages()
			results.append(
				{"client_uuid": entry.get("client_uuid"), "status": "error", "message": cstr(exc) or _("Erreur")}
			)
	return results


@frappe.whitelist()
def undo_count(name, client_uuid):
	_require(INVENTORY_ROLES)
	doc = _get_inventory(name, COUNTING_STATUSES)
	entry = frappe.db.get_value(
		"Saisie Inventaire",
		{"client_uuid": client_uuid, "inventaire": doc.name},
		["name", "ligne", "user", "annulee"],
		as_dict=True,
	)
	if not entry:
		return {"status": "missing"}
	if entry.user != frappe.session.user and not _can_validate():
		frappe.throw(_("Seul le compteur ou un responsable peut annuler cette saisie."))
	if not cint(entry.annulee):
		frappe.db.set_value("Saisie Inventaire", entry.name, "annulee", 1)
		_refresh_line(entry.ligne)
	return {"status": "ok", "line": entry.ligne}


@frappe.whitelist()
def get_line_entries(name, line):
	_require(INVENTORY_ROLES)
	doc = _get_inventory(name)
	filters = {"inventaire": doc.name, "ligne": line}
	if not _can_validate():
		filters["user"] = frappe.session.user
	return frappe.get_all(
		"Saisie Inventaire",
		filters=filters,
		fields=["client_uuid", "round", "qty", "uom", "mode", "counted_at", "user", "annulee"],
		order_by="counted_at desc",
	)


# --- Revue, recomptage, validation --------------------------------------------


def review_line(row, threshold_qty, threshold_pct) -> dict:
	counted = row.status == "Compté"
	expected = flt(row.expected_at_count if counted else row.snapshot_qty)
	variance = flt(row.counted_qty) - expected if counted else None
	return {
		"name": row.name,
		"item_code": row.item_code,
		"item_name": row.item_name,
		"warehouse": row.warehouse,
		"batch_no": row.batch_no,
		"stock_uom": row.stock_uom,
		"status": row.status,
		"hors_liste": bool(cint(row.hors_liste)),
		"round": cint(row.round) or 1,
		"snapshot_qty": flt(row.snapshot_qty),
		"expected_qty": expected,
		"counted_qty": flt(row.counted_qty) if counted else None,
		"first_count_qty": flt(row.first_count_qty) if cint(row.round) > 1 else None,
		"variance": variance,
		"variance_value": flt(variance) * flt(row.valuation_rate) if counted else None,
		"valuation_rate": flt(row.valuation_rate),
		"needs_recount": counted and needs_recount(expected, row.counted_qty, threshold_qty, threshold_pct),
		"last_counted_by": row.last_counted_by,
		"last_counted_at": str(row.last_counted_at) if row.last_counted_at else None,
	}


@frappe.whitelist()
def get_review(name):
	_require(MANAGER_ROLES)
	doc = _get_inventory(name)
	rows = frappe.get_all(
		"Ligne Inventaire",
		filters={"inventaire": doc.name},
		fields=list(LINE_FIELDS),
		order_by="warehouse asc, item_code asc, batch_no asc",
		limit_page_length=0,
	)
	expiry = batch_expiry_map(row.batch_no for row in rows)
	lines = []
	for row in rows:
		line = review_line(row, doc.recount_threshold_qty, doc.recount_threshold_pct)
		line["expiry_date"] = expiry.get(row.batch_no)
		lines.append(line)
	counted = [line for line in lines if line["counted_qty"] is not None]
	return {
		"inventory": serialize_inventory(doc),
		"lines": lines,
		"totals": {
			"lines": len(lines),
			"counted": len(counted),
			"uncounted": len(lines) - len(counted),
			"with_variance": sum(1 for line in counted if line["variance"]),
			"to_recount": sum(1 for line in counted if line["needs_recount"]),
			"variance_value": sum(flt(line["variance_value"]) for line in counted),
			"uncounted_value": sum(
				line["expected_qty"] * line["valuation_rate"] for line in lines if line["counted_qty"] is None
			),
		},
	}


@frappe.whitelist()
def request_recount(name, lines):
	_require(MANAGER_ROLES)
	doc = _get_inventory(name, ("En cours", "En revue"))
	names = _parse_list(lines)
	rows = frappe.get_all(
		"Ligne Inventaire",
		filters={"inventaire": doc.name, "name": ["in", names or [""]]},
		fields=["name", "round", "counted_qty"],
	)
	for row in rows:
		frappe.db.set_value(
			"Ligne Inventaire",
			row.name,
			{
				"round": (cint(row.round) or 1) + 1,
				"status": "À recompter",
				"first_count_qty": flt(row.counted_qty),
				"counted_qty": 0,
			},
		)
	if doc.status != "En cours":
		doc.db_set("status", "En cours")
	return {"recount": len(rows), "inventory": serialize_inventory(doc)}


@frappe.whitelist()
def finish_counting(name):
	_require(MANAGER_ROLES)
	doc = _get_inventory(name, ("En cours",))
	doc.db_set("status", "En revue")
	return serialize_inventory(doc)


@frappe.whitelist()
def reopen_counting(name):
	_require(MANAGER_ROLES)
	doc = _get_inventory(name, ("En revue",))
	doc.db_set("status", "En cours")
	return serialize_inventory(doc)


def reconciliation_rows(lines, zero_uncounted, current_qty=_current_qty) -> list[dict]:
	"""Lignes de Stock Reconciliation ; seules celles qui changent le stock sont gardées."""
	rows = []
	for line in lines:
		current = flt(current_qty(line.item_code, line.warehouse, line.batch_no))
		if line.status == "Compté":
			qty = target_qty(current, line.counted_qty, line.expected_at_count)
		elif zero_uncounted:
			qty = 0.0
		else:
			continue
		if abs(qty - current) < 1e-9:
			continue
		row = {"item_code": line.item_code, "warehouse": line.warehouse, "qty": qty}
		if line.batch_no:
			row.update({"batch_no": line.batch_no, "use_serial_batch_fields": 1})
		if not current:
			row["valuation_rate"] = flt(line.valuation_rate) or None
			if not row["valuation_rate"]:
				row["allow_zero_valuation_rate"] = 1
		rows.append(row)
	return rows


def _submit_reconciliation(name, zero_uncounted, user):
	doc = frappe.get_doc("Inventaire", name)
	lines = frappe.get_all(
		"Ligne Inventaire",
		filters={"inventaire": name},
		fields=["item_code", "warehouse", "batch_no", "status", "counted_qty", "expected_at_count", "valuation_rate"],
		limit_page_length=0,
	)
	rows = reconciliation_rows(lines, zero_uncounted)
	reconciliation = None
	if rows:
		sr = frappe.get_doc(
			{
				"doctype": "Stock Reconciliation",
				"company": doc.company,
				"purpose": "Stock Reconciliation",
				"items": rows,
			}
		)
		sr.flags.ignore_permissions = True
		sr.insert()
		sr.submit()
		reconciliation = sr.name
	doc.db_set(
		{
			"status": "Validé",
			"validated_by": user,
			"validated_at": now_datetime(),
			"zero_uncounted": 1 if zero_uncounted else 0,
			"stock_reconciliation": reconciliation,
		}
	)
	return reconciliation


def run_queued_validation(name, zero_uncounted, user):
	try:
		_submit_reconciliation(name, zero_uncounted, user)
		frappe.db.commit()
	except Exception:
		frappe.db.rollback()
		frappe.db.set_value("Inventaire", name, "status", "En revue")
		frappe.db.commit()
		frappe.log_error(title=f"Validation inventaire {name}")
		raise


@frappe.whitelist()
def validate_inventory(name, zero_uncounted=0):
	_require(MANAGER_ROLES)
	doc = _get_inventory(name, ("En cours", "En revue"))
	zero_uncounted = cint(zero_uncounted)
	pending = frappe.db.count("Ligne Inventaire", {"inventaire": doc.name, "status": "À recompter"})
	if pending:
		frappe.throw(_("{0} ligne(s) attendent encore un recomptage.").format(pending))
	user = frappe.session.user
	if frappe.db.count("Ligne Inventaire", {"inventaire": doc.name}) > QUEUE_THRESHOLD:
		doc.db_set("status", "En validation")
		frappe.enqueue(
			"log.inventory_ops.run_queued_validation",
			queue="long",
			timeout=3600,
			enqueue_after_commit=True,
			name=doc.name,
			zero_uncounted=zero_uncounted,
			user=user,
		)
		return {"queued": True, "inventory": serialize_inventory(doc)}
	reconciliation = _submit_reconciliation(doc.name, zero_uncounted, user)
	doc.reload()
	return {"queued": False, "stock_reconciliation": reconciliation, "inventory": serialize_inventory(doc)}


@frappe.whitelist()
def cancel_inventory(name):
	_require(MANAGER_ROLES)
	doc = _get_inventory(name, OPEN_STATUSES)
	doc.db_set("status", "Annulé")
	return serialize_inventory(doc)
