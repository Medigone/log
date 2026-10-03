"""Association des codes-barres articles depuis la console Distribution."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, cstr

from log.api.distribution import STOCK_ROLES, _require


def normalize_barcode(value) -> str:
	return cstr(value).strip()


def clamp_limit(limit, default=30, maximum=50) -> int:
	parsed = cint(limit)
	if parsed <= 0:
		return default
	return min(parsed, maximum)


def like_pattern(query: str) -> str:
	escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
	return f"%{escaped}%"


def serialize_barcode(row) -> dict[str, Any]:
	return {
		"name": row.get("name"),
		"barcode": row.get("barcode"),
		"barcodeType": row.get("barcode_type") or "",
		"uom": row.get("uom") or "",
	}


def serialize_uom(row) -> dict[str, Any]:
	return {
		"uom": row.get("uom"),
		"conversionFactor": float(row.get("conversion_factor") or 1),
	}


def item_uoms(item_code: str, stock_uom: str) -> list[dict[str, Any]]:
	rows = frappe.get_all(
		"UOM Conversion Detail",
		filters={"parent": item_code, "parenttype": "Item"},
		fields=["uom", "conversion_factor"],
		order_by="idx",
	)
	seen: set[str] = set()
	uoms: list[dict[str, Any]] = []
	if stock_uom:
		uoms.append({"uom": stock_uom, "conversionFactor": 1.0})
		seen.add(stock_uom)
	for row in rows:
		uom = cstr(row.get("uom"))
		if not uom or uom in seen:
			continue
		seen.add(uom)
		uoms.append(serialize_uom(row))
	return uoms


def serialize_item(item_code: str) -> dict[str, Any]:
	item = frappe.db.get_value(
		"Item",
		item_code,
		["name", "item_code", "item_name", "stock_uom", "image", "disabled"],
		as_dict=True,
	)
	if not item:
		frappe.throw(_("Article introuvable."), frappe.DoesNotExistError)
	barcodes = frappe.get_all(
		"Item Barcode",
		filters={"parent": item.name, "parenttype": "Item"},
		fields=["name", "barcode", "barcode_type", "uom"],
		order_by="idx",
	)
	return {
		"itemCode": item.item_code or item.name,
		"itemName": item.item_name or item.item_code or item.name,
		"stockUom": item.stock_uom or "",
		"image": item.image or "",
		"disabled": int(item.disabled or 0),
		"barcodes": [serialize_barcode(row) for row in barcodes],
		"uoms": item_uoms(item.name, item.stock_uom or ""),
	}


def serialize_search_row(row) -> dict[str, Any]:
	return {
		"itemCode": row.get("item_code") or row.get("name"),
		"itemName": row.get("item_name") or row.get("item_code") or row.get("name"),
		"stockUom": row.get("stock_uom") or "",
		"image": row.get("image") or "",
		"barcodeCount": int(row.get("barcode_count") or 0),
	}


def find_barcode_parent(barcode: str) -> dict[str, Any] | None:
	if not barcode:
		return None
	return frappe.db.get_value(
		"Item Barcode",
		{"barcode": barcode},
		["name", "parent", "barcode", "barcode_type", "uom"],
		as_dict=True,
	)


def allowed_uoms(item_code: str, stock_uom: str) -> set[str]:
	return {row["uom"] for row in item_uoms(item_code, stock_uom) if row.get("uom")}


def item_display_name(item_code: str) -> tuple[str, str]:
	other = frappe.db.get_value("Item", item_code, ["item_code", "item_name"], as_dict=True) or {}
	code_label = cstr(other.get("item_code") or item_code)
	return code_label, cstr(other.get("item_name") or code_label)


@frappe.whitelist()
def search_items(query=None, missing_only=0, limit=30):
	_require(STOCK_ROLES)
	query = normalize_barcode(query)
	missing = bool(cint(missing_only))
	limit = clamp_limit(limit)
	conditions = ["i.disabled = 0"]
	values: dict[str, Any] = {"limit": limit}
	if query:
		conditions.append("(i.item_code LIKE %(q)s OR i.item_name LIKE %(q)s)")
		values["q"] = like_pattern(query)
	if missing:
		conditions.append("NOT EXISTS (SELECT 1 FROM `tabItem Barcode` b WHERE b.parent = i.name)")
	rows = frappe.db.sql(
		f"""
		SELECT i.name, i.item_code, i.item_name, i.stock_uom, i.image,
			(SELECT COUNT(*) FROM `tabItem Barcode` b WHERE b.parent = i.name) AS barcode_count
		FROM `tabItem` i
		WHERE {' AND '.join(conditions)}
		ORDER BY i.modified DESC
		LIMIT %(limit)s
		""",
		values,
		as_dict=True,
	)
	results = [serialize_search_row(row) for row in rows]
	if query:
		owner = find_barcode_parent(query)
		if owner and owner.get("parent"):
			item_code = owner.parent
			if not any(row["itemCode"] == item_code for row in results):
				item = frappe.db.get_value(
					"Item",
					item_code,
					["name", "item_code", "item_name", "stock_uom", "image"],
					as_dict=True,
				)
				if item and not cint(frappe.db.get_value("Item", item_code, "disabled")):
					count = frappe.db.count("Item Barcode", {"parent": item_code})
					results.insert(0, serialize_search_row({**item, "barcode_count": count}))
	return results


@frappe.whitelist()
def get_item(item_code):
	_require(STOCK_ROLES)
	item_code = cstr(item_code).strip()
	if not item_code:
		frappe.throw(_("Indiquez un article."))
	return serialize_item(item_code)


@frappe.whitelist(methods=["POST"])
def lookup_barcode(barcode):
	_require(STOCK_ROLES)
	code = normalize_barcode(barcode)
	if not code:
		frappe.throw(_("Scannez un code-barres."))
	owner = find_barcode_parent(code)
	if not owner or not owner.get("parent"):
		return {"barcode": code, "item": None}
	return {"barcode": code, "item": serialize_item(owner.parent)}


def _load_item(item_code: str):
	item_code = cstr(item_code).strip()
	if not item_code:
		frappe.throw(_("Indiquez un article."))
	if not frappe.db.exists("Item", item_code):
		frappe.throw(_("Article introuvable."), frappe.DoesNotExistError)
	return frappe.get_doc("Item", item_code)


@frappe.whitelist(methods=["POST"])
def add_barcode(item_code, barcode, uom=None):
	_require(STOCK_ROLES)
	code = normalize_barcode(barcode)
	if not code:
		frappe.throw(_("Scannez un code-barres."))
	item = _load_item(item_code)
	if cint(item.disabled):
		frappe.throw(_("Cet article est désactivé."))
	owner = find_barcode_parent(code)
	if owner and owner.get("parent"):
		if owner.parent == item.name:
			payload = serialize_item(item.name)
			payload["already"] = True
			return payload
		code_label, label = item_display_name(owner.parent)
		frappe.throw(_("Le code-barres {0} est déjà associé à {1} · {2}.").format(code, code_label, label))
	chosen_uom = cstr(uom).strip() or item.stock_uom
	allowed = allowed_uoms(item.name, item.stock_uom)
	if chosen_uom and allowed and chosen_uom not in allowed:
		frappe.throw(_("L’unité {0} n’est pas définie pour cet article.").format(chosen_uom))
	item.append(
		"barcodes",
		{
			"barcode": code,
			"uom": chosen_uom,
		},
	)
	item.save(ignore_permissions=True)
	payload = serialize_item(item.name)
	payload["already"] = False
	return payload


@frappe.whitelist(methods=["POST"])
def remove_barcode(item_code, barcode):
	_require(STOCK_ROLES)
	code = normalize_barcode(barcode)
	if not code:
		frappe.throw(_("Indiquez le code-barres à retirer."))
	item = _load_item(item_code)
	removed = False
	for row in list(item.barcodes):
		if cstr(row.barcode) == code:
			item.remove(row)
			removed = True
	if not removed:
		frappe.throw(_("Ce code-barres n’est pas associé à cet article."))
	item.save(ignore_permissions=True)
	return serialize_item(item.name)
