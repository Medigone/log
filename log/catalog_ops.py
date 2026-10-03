# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Catalogue articles depuis Distribution : fiches, prix, promotions, groupes, marques et rayons Store."""

from __future__ import annotations

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, getdate, nowdate

from log.api.distribution import CATALOG_ROLES, _payload, _require
from log.receipt_ops import (
	_barcode_owner,
	_buying_price_list,
	_default_company,
	_default_stock_uom,
	_receiving_warehouses,
	_selling_price_list,
	_upsert_item_price,
	barcode_type_for,
)

LIST_LIMIT = 50
ITEM_STATUSES = ("tous", "actifs", "desactives", "sans_prix", "hors_store")
STORE_FIELD = "custom_afficher_dans_store"
STORE_PRICE_FIELD = "custom_afficher_prix_store"
PPA_FIELD = "custom_ppa"
RULE_TYPES = {"Discount Percentage", "Discount Amount", "Rate"}
RULE_APPLY_ON = {"Item Code": ("items", "item_code"), "Item Group": ("item_groups", "item_group"), "Brand": ("brands", "brand")}
RULE_TARGETS = {"": None, "Customer": "customer", "Customer Group": "customer_group"}


def _has(field: str) -> bool:
	return bool(frappe.db.has_column("Item", field))


def _text(value) -> str:
	return cstr(value).strip()


def _optional_date(value):
	return str(getdate(value)) if value else None


# --- Options ------------------------------------------------------------------


def _group_tree() -> list[dict]:
	rows = frappe.get_all(
		"Item Group", fields=["name", "parent_item_group", "is_group", "lft"], order_by="lft asc"
	)
	counts = defaultdict(int)
	for group in frappe.get_all("Item", fields=["item_group"], filters={"disabled": 0}, pluck="item_group"):
		counts[group] += 1
	return [
		{
			"name": row.name,
			"parent": row.parent_item_group or None,
			"is_group": bool(cint(row.is_group)),
			"item_count": counts.get(row.name, 0),
		}
		for row in rows
	]


def _price_lists() -> list[dict]:
	rows = frappe.get_all(
		"Price List",
		fields=["name", "currency", "selling", "buying", "enabled"],
		order_by="selling desc, name asc",
	)
	return [
		{
			"name": row.name,
			"currency": row.currency,
			"selling": bool(cint(row.selling)),
			"buying": bool(cint(row.buying)),
			"enabled": bool(cint(row.enabled)),
		}
		for row in rows
	]


def _item_tax_templates(company) -> list[dict]:
	if not frappe.db.exists("DocType", "Item Tax Template"):
		return []
	filters = {"disabled": 0}
	if company:
		filters["company"] = company
	from log.setup.taxes import OBSOLETE_RATES

	rows = frappe.get_all("Item Tax Template", filters=filters, fields=["name", "title"], order_by="title asc")
	if not rows:
		return []
	rates = defaultdict(set)
	for detail in frappe.get_all(
		"Item Tax Template Detail", filters={"parent": ["in", [row.name for row in rows]]}, fields=["parent", "tax_rate"]
	):
		rates[detail.parent].add(flt(detail.tax_rate))
	# Les modèles 17 % / 7 % du plan comptable ERPNext ne sont plus en vigueur.
	return [
		{"name": row.name, "title": row.title or row.name}
		for row in rows
		if not rates[row.name] or not rates[row.name] <= set(map(float, OBSOLETE_RATES))
	]


@frappe.whitelist()
def get_catalog_options():
	_require(CATALOG_ROLES)
	company = _default_company()
	return {
		"company": company,
		"currency": frappe.db.get_value("Company", company, "default_currency") if company else None,
		"item_groups": _group_tree(),
		"brands": sorted(frappe.get_all("Brand", pluck="name")),
		"uoms": sorted(frappe.get_all("UOM", filters={"enabled": 1}, pluck="name")),
		"default_uom": _default_stock_uom(),
		"price_lists": _price_lists(),
		"selling_price_list": _selling_price_list(),
		"buying_price_list": _buying_price_list(),
		"item_tax_templates": _item_tax_templates(company),
		"warehouses": _receiving_warehouses(company) if company else [],
		"customer_groups": sorted(frappe.get_all("Customer Group", filters={"is_group": 0}, pluck="name")),
	}


# --- Liste des articles -------------------------------------------------------


def _priced_items(price_list) -> set[str]:
	if not price_list:
		return set()
	return set(
		frappe.get_all(
			"Item Price",
			filters={"price_list": price_list, "customer": ["is", "not set"], "supplier": ["is", "not set"]},
			pluck="item_code",
		)
	)


def _price_by_item(item_codes, price_list) -> dict[str, float]:
	if not item_codes or not price_list:
		return {}
	rows = frappe.get_all(
		"Item Price",
		filters={
			"price_list": price_list,
			"item_code": ["in", list(item_codes)],
			"customer": ["is", "not set"],
			"supplier": ["is", "not set"],
		},
		fields=["item_code", "price_list_rate"],
		order_by="valid_from desc",
	)
	result: dict[str, float] = {}
	for row in rows:
		result.setdefault(row.item_code, flt(row.price_list_rate))
	return result


def _stock_totals(item_codes) -> dict[str, float]:
	if not item_codes:
		return {}
	totals: dict[str, float] = defaultdict(float)
	for row in frappe.get_all(
		"Bin", filters={"item_code": ["in", list(item_codes)]}, fields=["item_code", "actual_qty"]
	):
		totals[row.item_code] += flt(row.actual_qty)
	return dict(totals)


def _search_filters(search) -> list | None:
	term = _text(search)
	if not term:
		return None
	like = f"%{term}%"
	or_filters = [["name", "like", like], ["item_name", "like", like]]
	barcode_items = frappe.get_all(
		"Item Barcode", filters={"barcode": ["like", like], "parenttype": "Item"}, pluck="parent", limit=200
	)
	if barcode_items:
		or_filters.append(["name", "in", sorted(set(barcode_items))])
	return or_filters


def _status_filters(status, selling_list) -> dict:
	filters: dict = {"has_variants": 0}
	if status == "actifs":
		filters["disabled"] = 0
	elif status == "desactives":
		filters["disabled"] = 1
	elif status == "sans_prix":
		filters["disabled"] = 0
		priced = _priced_items(selling_list)
		if priced:
			filters["name"] = ["not in", sorted(priced)]
	elif status == "hors_store" and _has(STORE_FIELD):
		filters["disabled"] = 0
		filters[STORE_FIELD] = 0
	return filters


def _item_counts(selling_list) -> dict:
	active = frappe.db.count("Item", {"disabled": 0, "has_variants": 0})
	priced = _priced_items(selling_list)
	active_names = set(frappe.get_all("Item", filters={"disabled": 0, "has_variants": 0}, pluck="name"))
	return {
		"actifs": active,
		"desactives": frappe.db.count("Item", {"disabled": 1, "has_variants": 0}),
		"sans_prix": len(active_names - priced),
		"hors_store": frappe.db.count("Item", {"disabled": 0, "has_variants": 0, STORE_FIELD: 0})
		if _has(STORE_FIELD)
		else 0,
	}


@frappe.whitelist()
def list_items(search=None, item_group=None, brand=None, status="actifs", start=0, limit=LIST_LIMIT):
	_require(CATALOG_ROLES)
	status = status if status in ITEM_STATUSES else "actifs"
	selling_list = _selling_price_list()
	buying_list = _buying_price_list()
	filters = _status_filters(status, selling_list)
	if item_group:
		filters["item_group"] = item_group
	if brand:
		filters["brand"] = brand

	names = frappe.get_all(
		"Item", filters=filters, or_filters=_search_filters(search), pluck="name", order_by="item_name asc"
	)
	start = max(cint(start), 0)
	limit = min(max(cint(limit) or LIST_LIMIT, 1), 200)
	page = names[start : start + limit]

	fields = ["name", "item_name", "item_group", "brand", "stock_uom", "image", "disabled"]
	fields += [field for field in (STORE_FIELD, PPA_FIELD) if _has(field)]
	rows = {row.name: row for row in frappe.get_all("Item", filters={"name": ["in", page]}, fields=fields)} if page else {}
	selling = _price_by_item(page, selling_list)
	buying = _price_by_item(page, buying_list)
	stock = _stock_totals(page)
	items = []
	for code in page:
		row = rows.get(code)
		if not row:
			continue
		items.append(
			{
				"item_code": row.name,
				"item_name": row.item_name or row.name,
				"item_group": row.item_group,
				"brand": row.brand,
				"stock_uom": row.stock_uom,
				"image": row.image,
				"disabled": bool(cint(row.disabled)),
				"show_in_store": bool(cint(row.get(STORE_FIELD))),
				"ppa": flt(row.get(PPA_FIELD)),
				"selling_rate": selling.get(code),
				"buying_rate": buying.get(code),
				"stock_qty": stock.get(code, 0.0),
			}
		)
	return {
		"items": items,
		"total": len(names),
		"start": start,
		"limit": limit,
		"counts": _item_counts(selling_list),
		"selling_price_list": selling_list,
		"buying_price_list": buying_list,
	}


# --- Fiche article ------------------------------------------------------------


def _get_item(item_code):
	if not item_code or not frappe.db.exists("Item", item_code):
		frappe.throw(_("Article introuvable : {0}").format(item_code))
	return frappe.get_doc("Item", item_code)


def _has_stock_moves(item_code) -> bool:
	return bool(frappe.db.exists("Stock Ledger Entry", {"item_code": item_code, "is_cancelled": 0}))


def _item_stock(item_code) -> list[dict]:
	from log.stock_reservation import open_reservations

	rows = frappe.get_all(
		"Bin",
		filters={"item_code": item_code},
		fields=["warehouse", "actual_qty", "projected_qty"],
		order_by="warehouse asc",
	)
	result = []
	for row in rows:
		reserved = open_reservations([item_code], row.warehouse).get(item_code, 0.0)
		actual = flt(row.actual_qty)
		if not actual and not reserved:
			continue
		result.append(
			{
				"warehouse": row.warehouse,
				"actual_qty": actual,
				"reserved_qty": reserved,
				"available_qty": actual - reserved,
				"projected_qty": flt(row.projected_qty),
			}
		)
	return result


def serialize_item(doc) -> dict:
	selling_list = _selling_price_list()
	buying_list = _buying_price_list()
	return {
		"item_code": doc.name,
		"item_name": doc.item_name or doc.name,
		"description": doc.description or "",
		"item_group": doc.item_group,
		"brand": doc.brand,
		"stock_uom": doc.stock_uom,
		"image": doc.image,
		"disabled": bool(cint(doc.disabled)),
		"is_stock_item": bool(cint(doc.is_stock_item)),
		"has_batch_no": bool(cint(doc.has_batch_no)),
		"ppa": flt(doc.get(PPA_FIELD)),
		"show_in_store": bool(cint(doc.get(STORE_FIELD))),
		"show_price_in_store": bool(cint(doc.get(STORE_PRICE_FIELD))) if _has(STORE_PRICE_FIELD) else True,
		"barcodes": [
			{"barcode": row.barcode, "barcode_type": row.barcode_type or "", "uom": row.uom or None}
			for row in doc.get("barcodes") or []
		],
		"uoms": [
			{"uom": row.uom, "conversion_factor": flt(row.conversion_factor)}
			for row in doc.get("uoms") or []
			if row.uom != doc.stock_uom
		],
		"taxes": [{"item_tax_template": row.item_tax_template} for row in doc.get("taxes") or [] if row.item_tax_template],
		"has_stock_moves": _has_stock_moves(doc.name),
		"stock": _item_stock(doc.name),
		"selling_price_list": selling_list,
		"buying_price_list": buying_list,
		"selling_rate": _price_by_item([doc.name], selling_list).get(doc.name),
		"buying_rate": _price_by_item([doc.name], buying_list).get(doc.name),
		"modified": str(doc.modified),
	}


@frappe.whitelist()
def get_item(item_code):
	_require(CATALOG_ROLES)
	return serialize_item(_get_item(item_code))


def _clean_barcodes(rows, item_code=None) -> list[dict]:
	result, seen = [], set()
	for row in rows or []:
		barcode = _text(row.get("barcode"))
		if not barcode:
			continue
		if barcode in seen:
			frappe.throw(_("Le code-barres {0} est saisi deux fois.").format(barcode))
		seen.add(barcode)
		owner = _barcode_owner(barcode)
		if owner and owner != item_code:
			frappe.throw(_("Le code-barres {0} est déjà utilisé par l'article {1}.").format(barcode, owner))
		uom = row.get("uom") or None
		if uom and not frappe.db.exists("UOM", uom):
			frappe.throw(_("Unité inconnue : {0}").format(uom))
		result.append({"barcode": barcode, "barcode_type": barcode_type_for(barcode), "uom": uom})
	return result


def _clean_uoms(rows, stock_uom) -> list[dict]:
	result, seen = [], set()
	for row in rows or []:
		uom = row.get("uom")
		if not uom or uom == stock_uom:
			continue
		if uom in seen:
			frappe.throw(_("L'unité {0} est saisie deux fois.").format(uom))
		if not frappe.db.exists("UOM", uom):
			frappe.throw(_("Unité inconnue : {0}").format(uom))
		factor = flt(row.get("conversion_factor"))
		if factor <= 0:
			frappe.throw(_("Le facteur de conversion de {0} doit être positif.").format(uom))
		seen.add(uom)
		result.append({"uom": uom, "conversion_factor": factor})
	return [{"uom": stock_uom, "conversion_factor": 1}, *result]


def _clean_taxes(rows) -> list[dict]:
	result, seen = [], set()
	for row in rows or []:
		template = row.get("item_tax_template")
		if not template or template in seen:
			continue
		if not frappe.db.exists("Item Tax Template", template):
			frappe.throw(_("Modèle de taxe inconnu : {0}").format(template))
		seen.add(template)
		result.append({"item_tax_template": template})
	return result


def _check_references(data):
	item_group = data.get("item_group")
	if not item_group or not frappe.db.exists("Item Group", {"name": item_group, "is_group": 0}):
		frappe.throw(_("Choisissez un groupe d'articles (pas un groupe parent)."))
	if data.get("brand") and not frappe.db.exists("Brand", data.get("brand")):
		frappe.throw(_("Marque inconnue : {0}").format(data.get("brand")))


def _apply_custom_fields(doc, data):
	if "ppa" in data and _has(PPA_FIELD):
		doc.set(PPA_FIELD, flt(data.get("ppa")))
	if "show_in_store" in data and _has(STORE_FIELD):
		doc.set(STORE_FIELD, cint(data.get("show_in_store")))
	if "show_price_in_store" in data and _has(STORE_PRICE_FIELD):
		doc.set(STORE_PRICE_FIELD, cint(data.get("show_price_in_store")))


def insert_item(data: dict):
	"""Crée un article ; partagé avec la création rapide des réceptions."""
	barcode = _text(data.get("barcode"))
	item_name = _text(data.get("item_name"))
	item_code = _text(data.get("item_code")) or barcode
	stock_uom = data.get("stock_uom") or _default_stock_uom()
	has_batch_no = cint(data.get("has_batch_no"))

	if not item_name:
		frappe.throw(_("Saisissez la désignation de l'article."))
	if not item_code:
		frappe.throw(_("Saisissez le code article."))
	if frappe.db.exists("Item", item_code):
		frappe.throw(_("L'article {0} existe déjà.").format(item_code))
	barcode_rows = data.get("barcodes")
	if barcode_rows is None:
		barcode_rows = [{"barcode": barcode}] if barcode else []
	barcodes = _clean_barcodes(barcode_rows)
	_check_references(data)
	if not frappe.db.exists("UOM", stock_uom):
		frappe.throw(_("Unité inconnue : {0}").format(stock_uom))

	company = data.get("company") or _default_company()
	warehouse = data.get("warehouse")
	doc = frappe.get_doc(
		{
			"doctype": "Item",
			"item_code": item_code,
			"item_name": item_name,
			"description": _text(data.get("description")) or item_name,
			"item_group": data.get("item_group"),
			"brand": data.get("brand") or None,
			"stock_uom": stock_uom,
			"is_stock_item": 1,
			"is_purchase_item": 1,
			"is_sales_item": 1,
			"include_item_in_manufacturing": 0,
			"has_batch_no": has_batch_no,
			"has_expiry_date": has_batch_no,
			"create_new_batch": 0,
			"barcodes": barcodes,
			"uoms": _clean_uoms(data.get("uoms"), stock_uom),
			"taxes": _clean_taxes(data.get("taxes")),
			"item_defaults": [{"company": company, "default_warehouse": warehouse}] if company else [],
		}
	)
	_apply_custom_fields(doc, data)
	doc.insert(ignore_permissions=True)

	_upsert_item_price(doc.name, _buying_price_list(), data.get("buying_rate"), stock_uom, buying=True)
	_upsert_item_price(doc.name, _selling_price_list(), data.get("selling_rate"), stock_uom, buying=False)
	return doc


@frappe.whitelist(methods=["POST"])
def create_item(payload):
	_require(CATALOG_ROLES)
	doc = insert_item(_payload(payload))
	return serialize_item(doc)


@frappe.whitelist(methods=["POST"])
def update_item(payload):
	_require(CATALOG_ROLES)
	data = _payload(payload)
	doc = _get_item(data.get("item_code"))

	if "item_name" in data:
		item_name = _text(data.get("item_name"))
		if not item_name:
			frappe.throw(_("Saisissez la désignation de l'article."))
		doc.item_name = item_name
	if "description" in data:
		doc.description = _text(data.get("description")) or doc.item_name
	if "item_group" in data or "brand" in data:
		_check_references(
			{"item_group": data.get("item_group", doc.item_group), "brand": data.get("brand", doc.brand)}
		)
		doc.item_group = data.get("item_group", doc.item_group)
		doc.brand = data.get("brand", doc.brand) or None
	if "stock_uom" in data and data.get("stock_uom") != doc.stock_uom:
		if not frappe.db.exists("UOM", data.get("stock_uom")):
			frappe.throw(_("Unité inconnue : {0}").format(data.get("stock_uom")))
		if _has_stock_moves(doc.name):
			frappe.throw(_("L'unité de stock ne peut plus changer : l'article a déjà des mouvements de stock."))
		doc.stock_uom = data.get("stock_uom")
	if "has_batch_no" in data and cint(data.get("has_batch_no")) != cint(doc.has_batch_no):
		if _has_stock_moves(doc.name):
			frappe.throw(_("Le suivi par lot ne peut plus changer : l'article a déjà des mouvements de stock."))
		doc.has_batch_no = cint(data.get("has_batch_no"))
		doc.has_expiry_date = doc.has_batch_no
	if "disabled" in data:
		doc.disabled = cint(data.get("disabled"))
	if "image" in data:
		doc.image = data.get("image") or None
	if "barcodes" in data:
		doc.set("barcodes", _clean_barcodes(data.get("barcodes"), doc.name))
	if "uoms" in data or "stock_uom" in data:
		rows = data.get("uoms") if "uoms" in data else serialize_item(doc)["uoms"]
		doc.set("uoms", _clean_uoms(rows, doc.stock_uom))
	if "taxes" in data:
		doc.set("taxes", _clean_taxes(data.get("taxes")))
	_apply_custom_fields(doc, data)
	doc.save(ignore_permissions=True)
	return serialize_item(doc)


@frappe.whitelist(methods=["POST"])
def set_item_image(item_code, file_url=None):
	_require(CATALOG_ROLES)
	doc = _get_item(item_code)
	doc.image = file_url or None
	doc.save(ignore_permissions=True)
	return {"item_code": doc.name, "image": doc.image}


# --- Prix ---------------------------------------------------------------------


def _serialize_price(row) -> dict:
	return {
		"name": row.name,
		"item_code": row.item_code,
		"price_list": row.price_list,
		"selling": bool(cint(row.selling)),
		"buying": bool(cint(row.buying)),
		"customer": row.customer or None,
		"customer_name": row.get("customer_name") or None,
		"supplier": row.supplier or None,
		"uom": row.uom,
		"rate": flt(row.price_list_rate),
		"currency": row.currency,
		"valid_from": _optional_date(row.valid_from),
		"valid_upto": _optional_date(row.valid_upto),
	}


PRICE_FIELDS = [
	"name",
	"item_code",
	"price_list",
	"selling",
	"buying",
	"customer",
	"supplier",
	"uom",
	"price_list_rate",
	"currency",
	"valid_from",
	"valid_upto",
]


def _customer_names(customers) -> dict[str, str]:
	names = sorted({name for name in customers if name})
	if not names:
		return {}
	return {
		row.name: row.customer_name
		for row in frappe.get_all("Customer", filters={"name": ["in", names]}, fields=["name", "customer_name"])
	}


@frappe.whitelist()
def get_item_prices(item_code):
	_require(CATALOG_ROLES)
	doc = _get_item(item_code)
	rows = frappe.get_all(
		"Item Price",
		filters={"item_code": doc.name},
		fields=PRICE_FIELDS,
		order_by="selling desc, price_list asc, customer asc, valid_from desc",
	)
	customer_names = _customer_names(row.customer for row in rows)
	for row in rows:
		row.customer_name = customer_names.get(row.customer)
	return {
		"item_code": doc.name,
		"stock_uom": doc.stock_uom,
		"ppa": flt(doc.get(PPA_FIELD)),
		"prices": [_serialize_price(row) for row in rows],
		"pricing_rules": _rules_for_item(doc),
	}


def _check_price_overlap(name, item_code, price_list, customer, valid_from, valid_upto):
	filters = {"item_code": item_code, "price_list": price_list, "customer": customer or ["is", "not set"]}
	if name:
		filters["name"] = ["!=", name]
	start = getdate(valid_from) if valid_from else None
	end = getdate(valid_upto) if valid_upto else None
	for row in frappe.get_all("Item Price", filters=filters, fields=["name", "valid_from", "valid_upto"]):
		other_start = getdate(row.valid_from) if row.valid_from else None
		other_end = getdate(row.valid_upto) if row.valid_upto else None
		if (end is None or other_start is None or other_start <= end) and (
			start is None or other_end is None or start <= other_end
		):
			who = _("pour ce client") if customer else _("générique")
			frappe.throw(_("Un prix {0} existe déjà dans {1} sur cette période.").format(who, price_list))


@frappe.whitelist(methods=["POST"])
def save_item_price(payload):
	_require(CATALOG_ROLES)
	data = _payload(payload)
	name = data.get("name")
	item = _get_item(data.get("item_code"))
	price_list = data.get("price_list")
	if not price_list or not frappe.db.exists("Price List", price_list):
		frappe.throw(_("Liste de prix inconnue : {0}").format(price_list))
	rate = flt(data.get("rate"))
	if rate < 0:
		frappe.throw(_("Le prix ne peut pas être négatif."))
	customer = data.get("customer") or None
	if customer and not frappe.db.exists("Customer", customer):
		frappe.throw(_("Client inconnu : {0}").format(customer))
	valid_from, valid_upto = data.get("valid_from") or None, data.get("valid_upto") or None
	if valid_from and valid_upto and getdate(valid_upto) < getdate(valid_from):
		frappe.throw(_("La date de fin doit suivre la date de début."))
	_check_price_overlap(name, item.name, price_list, customer, valid_from, valid_upto)

	selling, buying = frappe.db.get_value("Price List", price_list, ["selling", "buying"])
	if name:
		doc = frappe.get_doc("Item Price", name)
		if doc.item_code != item.name:
			frappe.throw(_("Ce prix n'appartient pas à l'article {0}.").format(item.name))
	else:
		doc = frappe.new_doc("Item Price")
		doc.item_code = item.name
	# Les commandes ignorent les prix saisis dans une autre unité que l'unité de stock.
	doc.update(
		{
			"price_list": price_list,
			"price_list_rate": rate,
			"uom": item.stock_uom,
			"customer": customer,
			"selling": cint(selling),
			"buying": cint(buying),
			"valid_from": valid_from,
			"valid_upto": valid_upto,
		}
	)
	doc.save(ignore_permissions=True)
	row = frappe._dict(doc.as_dict())
	row.customer_name = _customer_names([customer]).get(customer)
	return _serialize_price(row)


@frappe.whitelist(methods=["POST"])
def delete_item_price(name):
	_require(CATALOG_ROLES)
	if not name or not frappe.db.exists("Item Price", name):
		frappe.throw(_("Prix introuvable."))
	frappe.delete_doc("Item Price", name, ignore_permissions=True)
	return {"deleted": name}


@frappe.whitelist(methods=["POST"])
def save_item_ppa(item_code, ppa):
	_require(CATALOG_ROLES)
	doc = _get_item(item_code)
	if not _has(PPA_FIELD):
		frappe.throw(_("Le champ PPA n'est pas installé."))
	doc.set(PPA_FIELD, flt(ppa))
	doc.save(ignore_permissions=True)
	return {"item_code": doc.name, "ppa": flt(doc.get(PPA_FIELD))}


@frappe.whitelist()
def search_customers(txt=None):
	_require(CATALOG_ROLES)
	term = _text(txt)
	or_filters = [["name", "like", f"%{term}%"], ["customer_name", "like", f"%{term}%"]] if term else None
	return [
		{"name": row.name, "customer_name": row.customer_name, "customer_group": row.customer_group}
		for row in frappe.get_all(
			"Customer",
			filters={"disabled": 0},
			or_filters=or_filters,
			fields=["name", "customer_name", "customer_group"],
			order_by="customer_name asc",
			limit_page_length=20,
		)
	]


@frappe.whitelist()
def list_price_lists():
	_require(CATALOG_ROLES)
	lists = _price_lists()
	counts = defaultdict(int)
	for price_list in frappe.get_all("Item Price", filters={"customer": ["is", "not set"]}, pluck="price_list"):
		counts[price_list] += 1
	for row in lists:
		row["item_count"] = counts.get(row["name"], 0)
	return lists


@frappe.whitelist(methods=["POST"])
def save_price_list(payload):
	_require(CATALOG_ROLES)
	data = _payload(payload)
	name = _text(data.get("name"))
	new_name = _text(data.get("price_list_name")) or name
	if not new_name:
		frappe.throw(_("Saisissez le nom de la liste de prix."))
	selling, buying = cint(data.get("selling")), cint(data.get("buying"))
	if not selling and not buying:
		frappe.throw(_("Une liste de prix sert à la vente, à l'achat, ou aux deux."))
	currency = data.get("currency") or frappe.db.get_value("Company", _default_company(), "default_currency")
	if name:
		if not frappe.db.exists("Price List", name):
			frappe.throw(_("Liste de prix introuvable : {0}").format(name))
		if new_name != name:
			if frappe.db.exists("Price List", new_name):
				frappe.throw(_("La liste de prix {0} existe déjà.").format(new_name))
			frappe.rename_doc("Price List", name, new_name, force=True)
		doc = frappe.get_doc("Price List", new_name)
		doc.price_list_name = new_name
	else:
		if frappe.db.exists("Price List", new_name):
			frappe.throw(_("La liste de prix {0} existe déjà.").format(new_name))
		doc = frappe.new_doc("Price List")
		doc.price_list_name = new_name
	doc.update(
		{
			"currency": currency,
			"selling": selling,
			"buying": buying,
			"enabled": cint(data.get("enabled", 1)),
		}
	)
	doc.save(ignore_permissions=True)
	return next(row for row in _price_lists() if row["name"] == doc.name)


@frappe.whitelist()
def get_price_grid(price_list, search=None, item_group=None, brand=None, start=0, limit=LIST_LIMIT):
	"""Prix génériques d'une liste pour une page d'articles actifs, avec le prix de référence."""
	_require(CATALOG_ROLES)
	if not price_list or not frappe.db.exists("Price List", price_list):
		frappe.throw(_("Liste de prix inconnue : {0}").format(price_list))
	filters: dict = {"disabled": 0, "has_variants": 0}
	if item_group:
		filters["item_group"] = item_group
	if brand:
		filters["brand"] = brand
	names = frappe.get_all(
		"Item", filters=filters, or_filters=_search_filters(search), pluck="name", order_by="item_name asc"
	)
	start = max(cint(start), 0)
	limit = min(max(cint(limit) or LIST_LIMIT, 1), 200)
	page = names[start : start + limit]
	fields = ["name", "item_name", "item_group", "brand", "stock_uom"] + ([PPA_FIELD] if _has(PPA_FIELD) else [])
	rows = {row.name: row for row in frappe.get_all("Item", filters={"name": ["in", page]}, fields=fields)} if page else {}
	price_rows = (
		frappe.get_all(
			"Item Price",
			filters={
				"price_list": price_list,
				"item_code": ["in", page],
				"customer": ["is", "not set"],
				"supplier": ["is", "not set"],
			},
			fields=["name", "item_code", "price_list_rate"],
			order_by="valid_from desc",
		)
		if page
		else []
	)
	prices: dict[str, dict] = {}
	for row in price_rows:
		prices.setdefault(row.item_code, row)
	buying = _price_by_item(page, _buying_price_list())
	items = []
	for code in page:
		row = rows.get(code)
		if not row:
			continue
		price = prices.get(code)
		items.append(
			{
				"item_code": code,
				"item_name": row.item_name or code,
				"item_group": row.item_group,
				"brand": row.brand,
				"stock_uom": row.stock_uom,
				"ppa": flt(row.get(PPA_FIELD)),
				"buying_rate": buying.get(code),
				"price_name": price.name if price else None,
				"rate": flt(price.price_list_rate) if price else None,
			}
		)
	return {"price_list": price_list, "items": items, "total": len(names), "start": start, "limit": limit}


@frappe.whitelist(methods=["POST"])
def set_grid_price(price_list, item_code, rate):
	"""Prix générique d'un article dans une liste (création ou mise à jour)."""
	_require(CATALOG_ROLES)
	item = _get_item(item_code)
	if not price_list or not frappe.db.exists("Price List", price_list):
		frappe.throw(_("Liste de prix inconnue : {0}").format(price_list))
	if flt(rate) < 0:
		frappe.throw(_("Le prix ne peut pas être négatif."))
	existing = frappe.db.get_value(
		"Item Price",
		{"item_code": item.name, "price_list": price_list, "customer": ["is", "not set"], "supplier": ["is", "not set"]},
		"name",
	)
	return _save_price(existing, item, price_list, rate)


def _save_price(name, item, price_list, rate):
	selling, buying = frappe.db.get_value("Price List", price_list, ["selling", "buying"])
	doc = frappe.get_doc("Item Price", name) if name else frappe.new_doc("Item Price")
	doc.update(
		{
			"item_code": item.name,
			"price_list": price_list,
			"price_list_rate": flt(rate),
			"uom": item.stock_uom,
			"selling": cint(selling),
			"buying": cint(buying),
		}
	)
	doc.save(ignore_permissions=True)
	return {"item_code": item.name, "price_name": doc.name, "rate": flt(doc.price_list_rate)}


BULK_OPERATIONS = {"percent", "amount", "fixed", "from_buying"}


def _bulk_rate(current, operation, value, buying):
	if operation == "percent":
		return current * (1 + value / 100) if current is not None else None
	if operation == "amount":
		return current + value if current is not None else None
	if operation == "fixed":
		return value
	if operation == "from_buying":
		return buying * (1 + value / 100) if buying else None
	return None


@frappe.whitelist(methods=["POST"])
def bulk_update_prices(payload):
	"""Mise à jour en masse des prix génériques d'une liste. `dry_run` renvoie l'aperçu sans écrire."""
	_require(CATALOG_ROLES)
	data = _payload(payload)
	price_list = data.get("price_list")
	if not price_list or not frappe.db.exists("Price List", price_list):
		frappe.throw(_("Liste de prix inconnue : {0}").format(price_list))
	operation = data.get("operation")
	if operation not in BULK_OPERATIONS:
		frappe.throw(_("Opération inconnue."))
	value = flt(data.get("value"))
	precision = cint(data.get("round_to")) if data.get("round_to") is not None else 2
	filters: dict = {"disabled": 0, "has_variants": 0}
	if data.get("item_group"):
		filters["item_group"] = data.get("item_group")
	if data.get("brand"):
		filters["brand"] = data.get("brand")
	codes = frappe.get_all("Item", filters=filters, pluck="name", order_by="item_name asc")
	if not codes:
		return {"count": 0, "changes": [], "applied": False}

	current = _price_by_item(codes, price_list)
	buying = _price_by_item(codes, _buying_price_list())
	names = dict(frappe.get_all("Item", filters={"name": ["in", codes]}, fields=["name", "item_name"], as_list=True))
	changes = []
	for code in codes:
		new_rate = _bulk_rate(current.get(code), operation, value, buying.get(code))
		if new_rate is None or new_rate < 0:
			continue
		new_rate = round(new_rate, precision)
		if current.get(code) is not None and abs(new_rate - current[code]) < 1e-9:
			continue
		changes.append({"item_code": code, "item_name": names.get(code) or code, "old_rate": current.get(code), "new_rate": new_rate})

	applied = not cint(data.get("dry_run", 1))
	if applied:
		for change in changes:
			item = frappe._dict(name=change["item_code"], stock_uom=frappe.db.get_value("Item", change["item_code"], "stock_uom"))
			existing = frappe.db.get_value(
				"Item Price",
				{"item_code": item.name, "price_list": price_list, "customer": ["is", "not set"], "supplier": ["is", "not set"]},
				"name",
			)
			_save_price(existing, item, price_list, change["new_rate"])
	return {"count": len(changes), "changes": changes[:200], "applied": applied}


# --- Promotions (Pricing Rules) -----------------------------------------------


def _rule_targets(doc) -> list[str]:
	table, field = RULE_APPLY_ON.get(doc.apply_on, (None, None))
	if not table:
		return []
	return [row.get(field) for row in doc.get(table) or [] if row.get(field)]


def _rule_state(doc) -> str:
	if cint(doc.disable):
		return "desactivee"
	today = getdate(nowdate())
	if doc.valid_upto and getdate(doc.valid_upto) < today:
		return "expiree"
	if doc.valid_from and getdate(doc.valid_from) > today:
		return "a_venir"
	return "active"


def serialize_rule(doc) -> dict:
	target_field = RULE_TARGETS.get(doc.applicable_for or "")
	return {
		"name": doc.name,
		"title": doc.title,
		"apply_on": doc.apply_on,
		"targets": _rule_targets(doc),
		"rate_or_discount": doc.rate_or_discount,
		"discount_percentage": flt(doc.discount_percentage),
		"discount_amount": flt(doc.discount_amount),
		"rate": flt(doc.rate),
		"min_qty": flt(doc.min_qty),
		"valid_from": _optional_date(doc.valid_from),
		"valid_upto": _optional_date(doc.valid_upto),
		"applicable_for": doc.applicable_for or "",
		"party": doc.get(target_field) if target_field else None,
		"for_price_list": doc.for_price_list or None,
		"priority": cint(doc.priority) or None,
		"disabled": bool(cint(doc.disable)),
		"state": _rule_state(doc),
		"editable": doc.apply_on in RULE_APPLY_ON
		and cint(doc.selling)
		and (doc.price_or_product_discount or "Price") == "Price"
		and (doc.applicable_for or "") in RULE_TARGETS,
	}


def _rules_for_item(item) -> list[dict]:
	names = set()
	for doctype, field, value in (
		("Pricing Rule Item Code", "item_code", item.name),
		("Pricing Rule Item Group", "item_group", item.item_group),
		("Pricing Rule Brand", "brand", item.brand),
	):
		if value:
			names.update(frappe.get_all(doctype, filters={field: value, "parenttype": "Pricing Rule"}, pluck="parent"))
	rules = [serialize_rule(frappe.get_doc("Pricing Rule", name)) for name in sorted(names)]
	return [rule for rule in rules if rule["state"] in ("active", "a_venir")]


@frappe.whitelist()
def list_pricing_rules(state=None, search=None):
	_require(CATALOG_ROLES)
	filters = {"selling": 1}
	or_filters = [["title", "like", f"%{_text(search)}%"], ["name", "like", f"%{_text(search)}%"]] if _text(search) else None
	names = frappe.get_all("Pricing Rule", filters=filters, or_filters=or_filters, pluck="name", order_by="modified desc", limit_page_length=500)
	rules = [serialize_rule(frappe.get_doc("Pricing Rule", name)) for name in names]
	counts = defaultdict(int)
	for rule in rules:
		counts[rule["state"]] += 1
	if state:
		rules = [rule for rule in rules if rule["state"] == state]
	return {"rules": rules, "counts": dict(counts)}


def _check_rule_targets(apply_on, targets):
	doctype = {"Item Code": "Item", "Item Group": "Item Group", "Brand": "Brand"}[apply_on]
	for target in targets:
		if not frappe.db.exists(doctype, target):
			frappe.throw(_("{0} inconnu : {1}").format(_(doctype), target))


@frappe.whitelist(methods=["POST"])
def save_pricing_rule(payload):
	_require(CATALOG_ROLES)
	data = _payload(payload)
	title = _text(data.get("title"))
	if not title:
		frappe.throw(_("Saisissez le titre de la promotion."))
	apply_on = data.get("apply_on") or "Item Code"
	if apply_on not in RULE_APPLY_ON:
		frappe.throw(_("Une promotion s'applique à des articles, des groupes ou des marques."))
	targets = [target for target in dict.fromkeys(data.get("targets") or []) if target]
	if not targets:
		frappe.throw(_("Choisissez au moins un élément concerné par la promotion."))
	_check_rule_targets(apply_on, targets)
	rate_or_discount = data.get("rate_or_discount") or "Discount Percentage"
	if rate_or_discount not in RULE_TYPES:
		frappe.throw(_("Type de remise inconnu."))
	value = flt(data.get("value"))
	if value <= 0:
		frappe.throw(_("Saisissez une remise ou un prix positif."))
	if rate_or_discount == "Discount Percentage" and value > 100:
		frappe.throw(_("La remise ne peut pas dépasser 100 %."))
	applicable_for = data.get("applicable_for") or ""
	if applicable_for not in RULE_TARGETS:
		frappe.throw(_("Cible inconnue."))
	party = data.get("party") or None
	if applicable_for and not party:
		frappe.throw(_("Choisissez le client ou le groupe de clients."))
	valid_from, valid_upto = data.get("valid_from") or nowdate(), data.get("valid_upto") or None
	if valid_upto and getdate(valid_upto) < getdate(valid_from):
		frappe.throw(_("La date de fin doit suivre la date de début."))
	price_list = data.get("for_price_list") or None
	if price_list and not frappe.db.exists("Price List", price_list):
		frappe.throw(_("Liste de prix inconnue : {0}").format(price_list))
	if data.get("priority") and not 1 <= cint(data.get("priority")) <= 20:
		frappe.throw(_("La priorité va de 1 à 20."))

	name = data.get("name")
	if name:
		doc = frappe.get_doc("Pricing Rule", name)
		if not serialize_rule(doc)["editable"]:
			frappe.throw(_("Cette règle de prix est trop complexe pour être modifiée ici : utilisez le Desk."))
	else:
		doc = frappe.new_doc("Pricing Rule")
	company = _default_company()
	table, field = RULE_APPLY_ON[apply_on]
	doc.update(
		{
			"title": title,
			"apply_on": apply_on,
			"price_or_product_discount": "Price",
			"selling": 1,
			"buying": 0,
			"company": company,
			"currency": frappe.db.get_value("Company", company, "default_currency") if company else None,
			"applicable_for": applicable_for,
			"customer": party if applicable_for == "Customer" else None,
			"customer_group": party if applicable_for == "Customer Group" else None,
			"min_qty": flt(data.get("min_qty")),
			"valid_from": valid_from,
			"valid_upto": valid_upto,
			"rate_or_discount": rate_or_discount,
			"discount_percentage": value if rate_or_discount == "Discount Percentage" else 0,
			"discount_amount": value if rate_or_discount == "Discount Amount" else 0,
			"rate": value if rate_or_discount == "Rate" else 0,
			"for_price_list": price_list,
			"has_priority": 1 if data.get("priority") else 0,
			"priority": str(cint(data.get("priority"))) if data.get("priority") else None,
			"disable": cint(data.get("disabled")),
		}
	)
	for other_table, _other in RULE_APPLY_ON.values():
		doc.set(other_table, [])
	doc.set(table, [{field: target} for target in targets])
	doc.save(ignore_permissions=True)
	return serialize_rule(doc)


@frappe.whitelist(methods=["POST"])
def set_pricing_rule_disabled(name, disabled):
	_require(CATALOG_ROLES)
	if not name or not frappe.db.exists("Pricing Rule", name):
		frappe.throw(_("Promotion introuvable."))
	doc = frappe.get_doc("Pricing Rule", name)
	doc.disable = cint(disabled)
	doc.save(ignore_permissions=True)
	return serialize_rule(doc)


# --- Référentiels -------------------------------------------------------------


@frappe.whitelist(methods=["POST"])
def save_item_group(payload):
	_require(CATALOG_ROLES)
	from frappe.utils.nestedset import get_root_of

	data = _payload(payload)
	name = _text(data.get("name"))
	new_name = _text(data.get("item_group_name")) or name
	if not new_name:
		frappe.throw(_("Saisissez le nom du groupe."))
	parent = data.get("parent") or get_root_of("Item Group")
	if not frappe.db.exists("Item Group", {"name": parent, "is_group": 1}):
		frappe.throw(_("Le parent doit être un groupe parent."))
	is_group = cint(data.get("is_group"))
	if name:
		if not frappe.db.exists("Item Group", name):
			frappe.throw(_("Groupe introuvable : {0}").format(name))
		if parent == name:
			frappe.throw(_("Un groupe ne peut pas être son propre parent."))
		if new_name != name:
			if frappe.db.exists("Item Group", new_name):
				frappe.throw(_("Le groupe {0} existe déjà.").format(new_name))
			frappe.rename_doc("Item Group", name, new_name, force=True)
		doc = frappe.get_doc("Item Group", new_name)
		if is_group and not cint(doc.is_group) and frappe.db.exists("Item", {"item_group": doc.name}):
			frappe.throw(_("Ce groupe contient des articles : il ne peut pas devenir un groupe parent."))
		if not is_group and cint(doc.is_group) and frappe.db.exists("Item Group", {"parent_item_group": doc.name}):
			frappe.throw(_("Ce groupe a des sous-groupes : il doit rester un groupe parent."))
	else:
		if frappe.db.exists("Item Group", new_name):
			frappe.throw(_("Le groupe {0} existe déjà.").format(new_name))
		doc = frappe.new_doc("Item Group")
		doc.item_group_name = new_name
	doc.parent_item_group = parent
	doc.is_group = is_group
	doc.save(ignore_permissions=True)
	return {"item_groups": _group_tree(), "name": doc.name}


@frappe.whitelist(methods=["POST"])
def save_brand(payload):
	_require(CATALOG_ROLES)
	data = _payload(payload)
	name = _text(data.get("name"))
	new_name = _text(data.get("brand")) or name
	if not new_name:
		frappe.throw(_("Saisissez le nom de la marque."))
	if name:
		if not frappe.db.exists("Brand", name):
			frappe.throw(_("Marque introuvable : {0}").format(name))
		if new_name != name:
			if frappe.db.exists("Brand", new_name):
				frappe.throw(_("La marque {0} existe déjà.").format(new_name))
			frappe.rename_doc("Brand", name, new_name, force=True)
	else:
		if frappe.db.exists("Brand", new_name):
			frappe.throw(_("La marque {0} existe déjà.").format(new_name))
		frappe.get_doc({"doctype": "Brand", "brand": new_name}).insert(ignore_permissions=True)
	return {"brands": list_brands_with_counts(), "name": new_name}


def list_brands_with_counts() -> list[dict]:
	counts = defaultdict(int)
	for brand in frappe.get_all("Item", filters={"disabled": 0, "brand": ["is", "set"]}, pluck="brand"):
		counts[brand] += 1
	return [{"name": name, "item_count": counts.get(name, 0)} for name in sorted(frappe.get_all("Brand", pluck="name"))]


@frappe.whitelist()
def list_brands():
	_require(CATALOG_ROLES)
	return list_brands_with_counts()


STORE_SETTINGS = "Parametres Boutique Portail"
STORE_FLAGS = ("show_categories", "show_promotions", "show_featured")


def _store_settings_payload(doc) -> dict:
	from log.setup.item_groups import effective_store_groups

	configured = [row.item_group for row in sorted(doc.get("store_groups") or [], key=lambda row: cint(row.display_order)) if row.item_group]
	return {
		"store_groups": configured,
		"effective_store_groups": list(effective_store_groups(doc.get("store_groups"))),
		"featured_groups": [
			row.item_group
			for row in sorted(doc.get("featured_groups") or [], key=lambda row: cint(row.display_order))
			if row.item_group
		],
		"rail_limit": cint(doc.rail_limit),
		**{flag: bool(cint(doc.get(flag))) for flag in STORE_FLAGS},
		"leaf_groups": sorted(frappe.get_all("Item Group", filters={"is_group": 0}, pluck="name")),
	}


@frappe.whitelist()
def get_store_settings():
	_require(CATALOG_ROLES)
	if not frappe.db.exists("DocType", STORE_SETTINGS):
		frappe.throw(_("Les paramètres du Store ne sont pas installés."))
	return _store_settings_payload(frappe.get_single(STORE_SETTINGS))


@frappe.whitelist(methods=["POST"])
def save_store_settings(payload):
	_require(CATALOG_ROLES)
	data = _payload(payload)
	doc = frappe.get_single(STORE_SETTINGS)
	if "store_groups" in data:
		doc.set(
			"store_groups",
			[{"item_group": name, "display_order": index + 1} for index, name in enumerate(data.get("store_groups") or [])],
		)
	if "featured_groups" in data:
		doc.set(
			"featured_groups",
			[{"item_group": name, "display_order": index + 1} for index, name in enumerate(data.get("featured_groups") or [])],
		)
	if "rail_limit" in data:
		doc.rail_limit = cint(data.get("rail_limit"))
	for flag in STORE_FLAGS:
		if flag in data:
			doc.set(flag, cint(data.get(flag)))
	doc.save(ignore_permissions=True)
	return _store_settings_payload(doc)
