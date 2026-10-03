# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Saisie des commandes client (Sales Order) depuis Distribution : brouillon commercial, validation responsable."""

from __future__ import annotations

import re

import frappe
from frappe import _
from frappe.utils import add_days, cint, cstr, flt, getdate, nowdate

from log.api.distribution import ORDER_ROLES, ORDER_VALIDATION_ROLES, _payload, _require, _roles
from log.api.distribution_rules import has_any_role
from log.pick_list_ops import _barcode_increment, _scan_barcode

DEFAULT_ORDER_TYPE = "BL"
ORDER_TYPES = ("BL", "Facture")
INTERNAL_ORIGIN = "Interne"
PORTAL_ORIGIN = "Portail client"
LEGAL_FORMS = ("EI", "EURL", "SARL", "Personne Physique", "Non Précisé")
CREATED_CUSTOMER_STATUS = "Actif"
SCHEDULE_TOLERANCE = 0.1
SEARCH_LIMIT = 30


# --- Contexte ----------------------------------------------------------------


def _can_validate() -> bool:
	return has_any_role(_roles(), ORDER_VALIDATION_ROLES)


def _company() -> str:
	import erpnext

	company = erpnext.get_default_company() or frappe.db.get_value("Company", {}, "name")
	if not company:
		frappe.throw(_("Aucune société par défaut n'est configurée."))
	return company


def _has_field(doctype, fieldname) -> bool:
	return bool(frappe.db.has_column(doctype, fieldname))


def _default_selling_price_list() -> str | None:
	return frappe.db.get_single_value("Selling Settings", "selling_price_list")


def _customer_price_list(customer) -> str | None:
	"""Liste de prix du client, puis de sa catégorie, puis celle des Paramètres de vente."""
	if customer:
		price_list, group = frappe.db.get_value("Customer", customer, ["default_price_list", "customer_group"]) or (None, None)
		if price_list:
			return price_list
		if group:
			group_list = frappe.db.get_value("Customer Group", group, "default_price_list")
			if group_list:
				return group_list
	return _default_selling_price_list()


def _money(value) -> str:
	from frappe.utils import fmt_money

	return f"{fmt_money(flt(value), precision=2)} DZD"


def _default_warehouse(company, warehouses):
	from log.log.delivery_note_hooks import get_default_company_warehouse

	default = get_default_company_warehouse(company)
	if default in warehouses:
		return default
	return warehouses[0] if warehouses else None


def _sales_warehouses(company) -> list[str]:
	from log.receipt_ops import _receiving_warehouses

	return _receiving_warehouses(company)


@frappe.whitelist()
def get_order_options():
	_require(ORDER_ROLES)
	company = _company()
	warehouses = _sales_warehouses(company)
	tax_templates = frappe.get_all(
		"Sales Taxes and Charges Template",
		filters={"company": company, "disabled": 0},
		fields=["name", "title", "is_default"],
		order_by="is_default desc, name asc",
	)
	return {
		"company": company,
		"currency": frappe.db.get_value("Company", company, "default_currency"),
		"warehouses": warehouses,
		"default_warehouse": _default_warehouse(company, warehouses),
		"price_lists": frappe.get_all(
			"Price List", filters={"selling": 1, "enabled": 1}, pluck="name", order_by="name asc"
		),
		"default_price_list": _default_selling_price_list(),
		"tax_templates": [{"name": row.name, "label": row.title or row.name} for row in tax_templates],
		"default_tax_template": next((row.name for row in tax_templates if cint(row.is_default)), None),
		"payment_terms_templates": frappe.get_all("Payment Terms Template", pluck="name", order_by="name asc"),
		"modes_of_payment": frappe.get_all("Mode of Payment", filters={"enabled": 1}, pluck="name", order_by="name asc"),
		"customer_groups": frappe.get_all(
			"Customer Group", filters={"is_group": 0}, pluck="name", order_by="name asc"
		),
		"legal_forms": list(LEGAL_FORMS),
		"order_types": list(ORDER_TYPES),
		"editable_rate": bool(cint(frappe.db.get_single_value("Selling Settings", "editable_price_list_rate"))),
		"default_delivery_date": str(add_days(nowdate(), 1)),
		"can_validate": _can_validate(),
	}


# --- Clients -----------------------------------------------------------------


def _customer_phone_columns() -> list[str]:
	return [field for field in ("mobile_no", "custom_téléphone") if _has_field("Customer", field)]


def _serialize_customer(row) -> dict:
	phones = [cstr(row.get(field)).strip() for field in _customer_phone_columns()]
	gps = cstr(row.get("custom_gps")).strip()
	return {
		"name": row.name,
		"customer_name": row.customer_name or row.name,
		"customer_group": row.get("customer_group"),
		"commune": row.get("custom_commune"),
		"commune_name": row.get("commune_name") or row.get("custom_commune"),
		"wilaya": row.get("custom_wilaya"),
		"phone": next((phone for phone in phones if phone), None),
		"default_price_list": row.get("default_price_list"),
		"payment_terms": row.get("payment_terms"),
		"has_gps": bool(gps),
		"status": row.get("custom_status"),
	}


def _customer_rows(where: str, values: dict, limit: int) -> list:
	columns = ["c.name", "c.customer_name", "c.customer_group", "c.default_price_list", "c.payment_terms"]
	for field in ("custom_commune", "custom_wilaya", "custom_gps", "custom_status", *_customer_phone_columns()):
		if field not in ("mobile_no",) and not _has_field("Customer", field):
			continue
		columns.append(f"c.`{field}`")
	commune_join = ""
	if _has_field("Customer", "custom_commune") and frappe.db.exists("DocType", "Commune"):
		columns.append("co.nom as commune_name")
		commune_join = "left join `tabCommune` co on co.name = c.custom_commune"
	return frappe.db.sql(
		f"""
		select {", ".join(columns)}
		from `tabCustomer` c
		{commune_join}
		where c.disabled = 0 {where}
		order by c.modified desc
		limit {cint(limit)}
		""",
		values,
		as_dict=True,
	)


@frappe.whitelist()
def search_customers(txt=None, limit=SEARCH_LIMIT):
	_require(ORDER_ROLES)
	term = cstr(txt).strip()
	where = ""
	values = {}
	if term:
		values["like"] = f"%{term}%"
		clauses = ["c.name like %(like)s", "c.customer_name like %(like)s"]
		clauses += [f"c.`{field}` like %(like)s" for field in _customer_phone_columns()]
		if _has_field("Customer", "custom_commune") and frappe.db.exists("DocType", "Commune"):
			clauses.append("co.nom like %(like)s")
		if _has_field("Customer", "custom_wilaya"):
			clauses.append("c.custom_wilaya like %(like)s")
		where = f"and ({' or '.join(clauses)})"
	return [_serialize_customer(row) for row in _customer_rows(where, values, min(cint(limit) or SEARCH_LIMIT, 50))]


def _customer_summary(customer) -> dict | None:
	if not customer:
		return None
	rows = _customer_rows("and c.name = %(name)s", {"name": customer}, 1)
	return _serialize_customer(rows[0]) if rows else None


@frappe.whitelist()
def search_communes(txt=None):
	_require(ORDER_ROLES)
	from log.api.customer_signup import _commune_items

	return _commune_items(txt)[:50]


def _normalise_phone(value) -> str | None:
	phone = re.sub(r"[^\d+]", "", cstr(value))
	if not phone:
		return None
	if len(re.sub(r"\D", "", phone)) < 8:
		frappe.throw(_("Le numéro de téléphone est trop court."))
	return phone


@frappe.whitelist()
def create_customer(payload):
	"""Création rapide d'un client depuis la saisie de commande."""
	_require(ORDER_ROLES)
	from log.api.customer_signup import _resolve_commune, _resolve_customer_group, _territory_for

	data = _payload(payload)
	customer_name = cstr(data.get("customer_name")).strip()
	if not customer_name:
		frappe.throw(_("Saisissez le nom du client."))
	if frappe.db.exists("Customer", {"customer_name": customer_name.upper()}) or frappe.db.exists(
		"Customer", {"customer_name": customer_name}
	):
		frappe.throw(_("Le client {0} existe déjà.").format(customer_name))
	group = _resolve_customer_group(data.get("customer_group"))
	commune = _resolve_commune(data.get("commune"))
	legal_form = data.get("legal_form") or "Non Précisé"
	if legal_form not in LEGAL_FORMS:
		frappe.throw(_("Forme juridique invalide : {0}").format(legal_form))
	phone = _normalise_phone(data.get("phone"))

	doc = frappe.new_doc("Customer")
	doc.customer_name = customer_name
	doc.customer_type = "Company"
	doc.customer_group = group
	territory = _territory_for(commune)
	if territory:
		doc.territory = territory
	optional = {
		"custom_commune": commune.name,
		"custom_wilaya": commune.wilaya,
		"custom_forme_juridique": legal_form,
		"custom_status": CREATED_CUSTOMER_STATUS,
		"custom_téléphone": phone,
		"mobile_no": phone,
		"custom_nº_nif": cstr(data.get("nif")).strip() or None,
		"custom_nº_rc": cstr(data.get("rc")).strip() or None,
		"custom_gps": cstr(data.get("gps")).strip() or None,
	}
	for field, value in optional.items():
		if value and doc.meta.has_field(field):
			doc.set(field, value)
	doc.insert(ignore_permissions=True)
	return _customer_summary(doc.name)


# --- Articles ----------------------------------------------------------------


def _available_stock(item_codes, warehouse, exclude_order=None) -> dict[str, float]:
	"""Stock réel − réservations ouvertes des autres commandes (voir log.stock_reservation)."""
	from log.stock_reservation import available_stock

	return available_stock(item_codes, warehouse, exclude_order)


def _price_map(item_codes, price_list, customer=None) -> dict[str, float]:
	"""Prix de liste par article : tarif propre au client d'abord, puis tarif général."""
	codes = sorted({code for code in item_codes if code})
	if not codes or not price_list:
		return {}
	rows = frappe.get_all(
		"Item Price",
		filters={"item_code": ["in", codes], "price_list": price_list},
		fields=["item_code", "price_list_rate", "customer", "uom"],
		order_by="modified desc",
	)
	stock_uoms = dict(
		frappe.get_all("Item", filters={"name": ["in", codes]}, fields=["name", "stock_uom"], as_list=True)
	)
	prices = {}
	for preferred in (True, False):
		for row in rows:
			if row.item_code in prices:
				continue
			if row.uom and row.uom != stock_uoms.get(row.item_code):
				continue
			if preferred and not (customer and row.customer == customer):
				continue
			if not preferred and row.customer:
				continue
			prices[row.item_code] = flt(row.price_list_rate)
	return prices


def _barcodes(item_codes) -> dict[str, str]:
	codes = sorted({code for code in item_codes if code})
	if not codes:
		return {}
	rows = frappe.get_all(
		"Item Barcode",
		filters={"parent": ["in", codes], "parenttype": "Item"},
		fields=["parent", "barcode"],
		order_by="idx asc",
	)
	result = {}
	for row in rows:
		result.setdefault(row.parent, row.barcode)
	return result


def _item_cards(items, price_list, customer, warehouse) -> list[dict]:
	codes = [row.name for row in items]
	prices = _price_map(codes, price_list, customer)
	stock = _available_stock(codes, warehouse)
	barcodes = _barcodes(codes)
	return [
		{
			"item_code": row.name,
			"item_name": row.item_name or row.name,
			"item_group": row.item_group,
			"brand": row.get("brand"),
			"image": row.get("image"),
			"uom": row.stock_uom,
			"barcode": barcodes.get(row.name),
			"price": prices.get(row.name),
			"available": stock.get(row.name, 0.0),
			"is_stock_item": bool(cint(row.get("is_stock_item"))),
		}
		for row in items
	]


ITEM_FIELDS = ["name", "item_name", "item_group", "brand", "image", "stock_uom", "is_stock_item"]


@frappe.whitelist()
def search_items(txt=None, customer=None, price_list=None, warehouse=None, limit=SEARCH_LIMIT):
	_require(ORDER_ROLES)
	term = cstr(txt).strip()
	filters = {"disabled": 0, "is_sales_item": 1, "has_variants": 0}
	or_filters = None
	if term:
		like = f"%{term}%"
		or_filters = [["name", "like", like], ["item_name", "like", like], ["item_group", "like", like]]
		barcode_items = frappe.get_all(
			"Item Barcode", filters={"barcode": ["like", like], "parenttype": "Item"}, pluck="parent", limit=20
		)
		if barcode_items:
			or_filters.append(["name", "in", barcode_items])
	items = frappe.get_all(
		"Item",
		filters=filters,
		or_filters=or_filters,
		fields=ITEM_FIELDS,
		order_by="item_name asc",
		limit_page_length=min(cint(limit) or SEARCH_LIMIT, 100),
	)
	return _item_cards(items, price_list or _customer_price_list(customer), customer, warehouse)


@frappe.whitelist()
def scan_order_item(search_value, customer=None, price_list=None, warehouse=None):
	"""Résout un code-barres ; un code inconnu renvoie `found: False` sans erreur."""
	_require(ORDER_ROLES)
	code = cstr(search_value).strip()
	if not code:
		frappe.throw(_("Scannez un code-barres."))
	data = _scan_barcode(code)
	item_code = data.get("item_code")
	if item_code and not frappe.db.exists("Item", item_code):
		item_code = None
	if not item_code and data.get("warehouse"):
		frappe.throw(_("Ce code correspond à un entrepôt, pas à un article."))
	if not item_code and frappe.db.exists("Item", code):
		item_code = code
	if not item_code:
		return {"found": False, "barcode": code}
	item = frappe.db.get_value("Item", item_code, ITEM_FIELDS + ["disabled", "is_sales_item"], as_dict=True)
	if cint(item.disabled) or not cint(item.is_sales_item):
		frappe.throw(_("L'article {0} n'est pas vendable.").format(item_code))
	card = _item_cards([item], price_list or _customer_price_list(customer), customer, warehouse)[0]
	card.update(
		{
			"found": True,
			"barcode": data.get("barcode") or code,
			"increment": _barcode_increment(item_code, data.get("uom"), item.stock_uom),
		}
	)
	return card


@frappe.whitelist()
def customer_recent_items(customer, price_list=None, warehouse=None, limit=12):
	"""Articles des dernières commandes soumises du client, avec la dernière quantité commandée."""
	_require(ORDER_ROLES)
	if not customer:
		return []
	orders = frappe.get_all(
		"Sales Order",
		filters={"customer": customer, "docstatus": 1},
		pluck="name",
		order_by="transaction_date desc, creation desc",
		limit_page_length=10,
	)
	if not orders:
		return []
	rows = frappe.get_all(
		"Sales Order Item",
		filters={"parent": ["in", orders], "parenttype": "Sales Order"},
		fields=["item_code", "stock_qty", "parent", "creation"],
		order_by="creation desc",
	)
	last_qty, times = {}, {}
	for row in rows:
		last_qty.setdefault(row.item_code, flt(row.stock_qty))
		times[row.item_code] = times.get(row.item_code, 0) + 1
	codes = list(last_qty)[: cint(limit) or 12]
	items = frappe.get_all(
		"Item", filters={"name": ["in", codes], "disabled": 0, "is_sales_item": 1}, fields=ITEM_FIELDS
	)
	cards = {
		card["item_code"]: card
		for card in _item_cards(items, price_list or _customer_price_list(customer), customer, warehouse)
	}
	result = []
	for code in codes:
		card = cards.get(code)
		if card:
			result.append({**card, "last_qty": last_qty[code], "times_ordered": times[code]})
	return result


# --- Construction de la commande ---------------------------------------------


def _clean_lines(lines) -> list[dict]:
	cleaned = []
	for line in lines or []:
		if not isinstance(line, dict):
			continue
		item_code = cstr(line.get("item_code")).strip()
		qty = flt(line.get("qty"))
		if not item_code or qty <= 0:
			continue
		discount = line.get("discount_percentage")
		if discount is not None and not 0 <= flt(discount) <= 100:
			frappe.throw(_("La remise de {0} doit être comprise entre 0 et 100 %.").format(item_code))
		rate = line.get("rate")
		if rate is not None and flt(rate) < 0:
			frappe.throw(_("Le prix de {0} ne peut pas être négatif.").format(item_code))
		reserved = line.get("reserved_qty")
		if reserved is not None and flt(reserved) < 0:
			frappe.throw(_("La réservation de {0} ne peut pas être négative.").format(item_code))
		cleaned.append(
			{
				"item_code": item_code,
				"qty": qty,
				"discount_percentage": None if discount is None else flt(discount),
				"rate": None if rate is None else flt(rate),
				"reserved_qty": None if reserved is None else flt(reserved),
				"row_name": cstr(line.get("row_name")).strip() or None,
			}
		)
	return cleaned


def _clean_schedule(rows) -> list[dict] | None:
	if rows is None:
		return None
	cleaned = []
	for row in rows:
		if not isinstance(row, dict):
			continue
		amount = flt(row.get("payment_amount"))
		if amount <= 0:
			continue
		if not row.get("due_date"):
			frappe.throw(_("Chaque échéance doit avoir une date."))
		mode = cstr(row.get("mode_of_payment")).strip() or None
		if mode and not frappe.db.exists("Mode of Payment", mode):
			frappe.throw(_("Mode de paiement inconnu : {0}").format(mode))
		cleaned.append({"due_date": str(getdate(row.get("due_date"))), "payment_amount": amount, "mode_of_payment": mode})
	return cleaned


def _apply_line_pricing(doc, lines, editable_rate):
	"""ERPNext garde un `rate` déjà rempli : on recalcule la remise de ligne comme le formulaire Desk."""
	for row, line in zip(doc.get("items") or [], lines):
		if editable_rate and line["rate"] is not None:
			row.rate = line["rate"]
			if flt(row.price_list_rate):
				row.discount_percentage = max(0.0, flt(100 - line["rate"] * 100 / flt(row.price_list_rate), 6))
				row.discount_amount = flt(row.price_list_rate) - line["rate"]
			continue
		if line["discount_percentage"] is None:
			continue
		row.discount_percentage = line["discount_percentage"]
		row.rate = flt(flt(row.price_list_rate) * (1 - line["discount_percentage"] / 100), row.precision("rate"))
		row.discount_amount = flt(row.price_list_rate) - row.rate


def _apply_schedule(doc, template, schedule):
	doc.payment_terms_template = template or ""
	doc.set("payment_schedule", [])
	if schedule:
		doc.payment_terms_template = ""
		for row in schedule:
			doc.append(
				"payment_schedule",
				{
					"due_date": row["due_date"],
					"invoice_portion": 0,
					"payment_amount": row["payment_amount"],
					"mode_of_payment": row["mode_of_payment"],
				},
			)
	doc.set_payment_schedule()


def _order_total(doc) -> float:
	return flt(doc.get("rounded_total") or doc.grand_total)


def schedule_gap(doc) -> float:
	return flt(_order_total(doc) - sum(flt(row.payment_amount) for row in doc.get("payment_schedule") or []), 2)


def _validate_schedule(doc):
	if not doc.get("payment_schedule"):
		return
	gap = schedule_gap(doc)
	if abs(gap) > SCHEDULE_TOLERANCE:
		frappe.throw(
			_("L'échéancier ({0}) ne correspond pas au total de la commande ({1}) : écart de {2}.").format(
				_money(_order_total(doc) - gap),
				_money(_order_total(doc)),
				_money(gap),
			)
		)
	for row in doc.payment_schedule:
		if getdate(row.due_date) < getdate(doc.transaction_date):
			frappe.throw(_("Une échéance ne peut pas précéder la date de la commande."))


def _order_warehouse(doc) -> str | None:
	return doc.get("set_warehouse") or next((row.warehouse for row in doc.get("items") or [] if row.warehouse), None)


def _apply_reservations(doc, lines, reservation_order=None, consumed=None, rows=None):
	"""Pose `custom_qte_reservee` sur chaque ligne (unité de stock), dans la limite du disponible.

	`rows` : lignes ERPNext alignées sur `lines` (par défaut, celles du document dans l'ordre).
	"""
	from log.stock_reservation import RESERVED_FIELD, allocate_reservations

	if not frappe.get_meta("Sales Order Item").has_field(RESERVED_FIELD):
		return
	rows = list(rows if rows is not None else doc.get("items") or [])
	so_details = [None if row.is_new() else row.name for row in rows] if consumed is not None else [None] * len(rows)
	values = allocate_reservations(
		[
			{
				"item_code": row.item_code,
				"qty": flt(row.stock_qty or row.qty),
				"reserved_qty": line.get("reserved_qty"),
				"so_detail": so_detail,
			}
			for row, line, so_detail in zip(rows, lines, so_details)
		],
		_order_warehouse(doc),
		reservation_order,
		consumed,
	)
	for row, value in zip(rows, values):
		row.set(RESERVED_FIELD, value)


def _build_order(data: dict, doc=None, reservation_order=None):
	customer = data.get("customer")
	if not customer or not frappe.db.exists("Customer", customer):
		frappe.throw(_("Choisissez un client."))
	lines = _clean_lines(data.get("lines"))
	if not lines:
		frappe.throw(_("Ajoutez au moins un article."))
	missing = [line["item_code"] for line in lines if not frappe.db.exists("Item", line["item_code"])]
	if missing:
		frappe.throw(_("Article introuvable : {0}").format(", ".join(missing)))

	company = _company()
	warehouse = data.get("warehouse")
	if warehouse and warehouse not in _sales_warehouses(company):
		frappe.throw(_("Entrepôt invalide : {0}").format(warehouse))
	order_type = data.get("order_type") or DEFAULT_ORDER_TYPE
	if order_type not in ORDER_TYPES:
		frappe.throw(_("Type de commande invalide : {0}").format(order_type))
	transaction_date = getdate(doc.transaction_date) if doc and doc.transaction_date else getdate(nowdate())
	delivery_date = getdate(data.get("delivery_date") or add_days(nowdate(), 1))
	if delivery_date < transaction_date:
		frappe.throw(_("La date de livraison ne peut pas précéder la date de la commande."))
	price_list = data.get("price_list") or _customer_price_list(customer)
	if price_list and not frappe.db.exists("Price List", {"name": price_list, "selling": 1, "enabled": 1}):
		frappe.throw(_("Liste de prix invalide : {0}").format(price_list))
	tax_template = data.get("tax_template") or ""
	if tax_template and not frappe.db.exists("Sales Taxes and Charges Template", tax_template):
		frappe.throw(_("Modèle de taxes inconnu : {0}").format(tax_template))
	payment_template = data.get("payment_terms_template") or ""
	if payment_template and not frappe.db.exists("Payment Terms Template", payment_template):
		frappe.throw(_("Conditions de paiement inconnues : {0}").format(payment_template))
	schedule = _clean_schedule(data.get("payment_schedule"))
	editable_rate = bool(cint(frappe.db.get_single_value("Selling Settings", "editable_price_list_rate")))

	doc = doc or frappe.new_doc("Sales Order")
	doc.flags.ignore_permissions = True
	if doc.get("customer") != customer:
		for field in ("customer_address", "shipping_address_name", "contact_person", "customer_name"):
			doc.set(field, None)
	doc.update(
		{
			"customer": customer,
			"company": company,
			"order_type": "Sales",
			"transaction_date": str(transaction_date),
			"delivery_date": str(delivery_date),
			"set_warehouse": warehouse,
			"selling_price_list": price_list,
			# "" et non None : ERPNext ne remplace alors pas le choix par les valeurs du client.
			"taxes_and_charges": tax_template,
			"payment_terms_template": payment_template,
		}
	)
	if doc.meta.has_field("custom_type"):
		doc.custom_type = order_type
	if doc.is_new() and doc.meta.has_field("custom_origine_commande"):
		doc.custom_origine_commande = INTERNAL_ORIGIN
	doc.set("items", [])
	for line in lines:
		doc.append(
			"items",
			{"item_code": line["item_code"], "qty": line["qty"], "delivery_date": str(delivery_date), "warehouse": warehouse},
		)
	doc.set("taxes", [])
	doc.set_missing_values()
	doc.taxes_and_charges = tax_template
	doc.set("taxes", [])
	if tax_template:
		doc.append_taxes_from_master()
	_apply_line_pricing(doc, lines, editable_rate)

	doc.apply_discount_on = "Net Total"
	discount_percentage = flt(data.get("additional_discount_percentage"))
	discount_amount = flt(data.get("discount_amount"))
	if not 0 <= discount_percentage <= 100:
		frappe.throw(_("La remise globale doit être comprise entre 0 et 100 %."))
	if discount_amount < 0:
		frappe.throw(_("La remise globale ne peut pas être négative."))
	doc.additional_discount_percentage = discount_percentage
	doc.discount_amount = 0 if discount_percentage else discount_amount
	doc.calculate_taxes_and_totals()
	_apply_schedule(doc, payment_template, schedule)
	doc.set_qty_as_per_stock_uom()
	_apply_reservations(doc, lines, reservation_order or (None if doc.is_new() else doc.name))
	return doc


# --- Sérialisation -----------------------------------------------------------


def _origin(doc) -> str:
	return cstr(doc.get("custom_origine_commande")) or INTERNAL_ORIGIN


def _editable(doc) -> bool:
	if cint(doc.docstatus) != 0:
		return False
	return _origin(doc) != PORTAL_ORIGIN or _can_validate()


DELIVERY_STATES = ("non_livree", "partielle", "livree")
FINISHED_STATUSES = ("Closed", "Completed")


def _delivery_state(doc) -> str:
	per_delivered = flt(doc.get("per_delivered"))
	if per_delivered >= 100:
		return "livree"
	return "partielle" if per_delivered > 0 else "non_livree"


def _tracking(doc) -> dict:
	"""Préparation et livraisons liées, avec ce qui empêche d'annuler la commande."""
	from log.order_change_ops import get_repreparation_impact_data

	impact = get_repreparation_impact_data(doc.name)
	pick_lists = [
		{"name": row.name, "docstatus": cint(row.docstatus), "status": row.status}
		for row in frappe.get_all(
			"Pick List", filters={"name": ["in", impact["pickLists"] or [""]]}, fields=["name", "docstatus", "status"]
		)
	]
	dn_fields = ["name", "docstatus", "status"]
	for field in ("custom_statut", "custom_tournee"):
		if _has_field("Delivery Note", field):
			dn_fields.append(field)
	delivery_notes = [
		{
			"name": row.name,
			"docstatus": cint(row.docstatus),
			"status": row.get("custom_statut") or row.status,
			"route": row.get("custom_tournee"),
		}
		for row in frappe.get_all(
			"Delivery Note", filters={"name": ["in", impact["deliveryNotes"] or [""]]}, fields=dn_fields
		)
	]
	return {"pick_lists": pick_lists, "delivery_notes": delivery_notes, "blockers": impact["blockers"]}


def serialize_order(doc, *, with_tracking=False, exclude_order=None) -> dict:
	from log.stock_reservation import RESERVED_FIELD

	items = list(doc.get("items") or [])
	exclude_order = exclude_order or (None if doc.is_new() else doc.name)
	stock = _available_stock([row.item_code for row in items], _order_warehouse(doc), exclude_order)
	images = dict(
		frappe.get_all(
			"Item",
			filters={"name": ["in", [row.item_code for row in items] or [""]]},
			fields=["name", "image"],
			as_list=True,
		)
	)
	schedule = list(doc.get("payment_schedule") or [])
	return {
		"name": None if doc.is_new() else doc.name,
		"docstatus": cint(doc.docstatus),
		"status": doc.get("status"),
		"origin": _origin(doc),
		"editable": _editable(doc) if not doc.is_new() else True,
		"owner": doc.get("owner"),
		"customer": _customer_summary(doc.customer),
		"transaction_date": cstr(doc.transaction_date),
		"delivery_date": cstr(doc.delivery_date),
		"order_type": doc.get("custom_type") or DEFAULT_ORDER_TYPE,
		"warehouse": doc.get("set_warehouse"),
		"price_list": doc.get("selling_price_list"),
		"tax_template": doc.get("taxes_and_charges") or "",
		"payment_terms_template": doc.get("payment_terms_template") or "",
		"schedule_mode": "template" if any(row.get("payment_term") for row in schedule) else "manual",
		"additional_discount_percentage": flt(doc.get("additional_discount_percentage")),
		"discount_amount": flt(doc.get("discount_amount")),
		"currency": doc.get("currency"),
		"lines": [
			{
				"item_code": row.item_code,
				"item_name": row.item_name,
				"uom": row.stock_uom or row.uom,
				"qty": flt(row.stock_qty or row.qty),
				"price_list_rate": flt(row.price_list_rate),
				"discount_percentage": flt(row.discount_percentage),
				"rate": flt(row.rate),
				"amount": flt(row.amount),
				"image": images.get(row.item_code),
				"available": stock.get(row.item_code, 0.0),
				"pricing_rules": row.get("pricing_rules") or None,
				"row_name": None if doc.is_new() else row.name,
				"reserved_qty": flt(row.get(RESERVED_FIELD)),
				"delivered_qty": flt(row.get("delivered_qty")) * flt(row.get("conversion_factor") or 1),
				"picked_qty": flt(row.get("picked_qty")),
				"remaining_qty": max(
					0.0,
					flt(row.stock_qty or row.qty) - flt(row.get("delivered_qty")) * flt(row.get("conversion_factor") or 1),
				),
			}
			for row in items
		],
		"taxes": [
			{"description": row.description or row.account_head, "rate": flt(row.rate), "amount": flt(row.tax_amount)}
			for row in doc.get("taxes") or []
		],
		"payment_schedule": [
			{
				"payment_term": row.get("payment_term"),
				"due_date": cstr(row.due_date),
				"invoice_portion": flt(row.invoice_portion),
				"payment_amount": flt(row.payment_amount),
				"mode_of_payment": row.get("mode_of_payment"),
			}
			for row in schedule
		],
		"schedule_gap": schedule_gap(doc),
		"per_delivered": flt(doc.get("per_delivered")),
		"per_picked": flt(doc.get("per_picked")),
		"delivery_state": _delivery_state(doc),
		"can_edit_items": cint(doc.docstatus) == 1 and doc.get("status") not in FINISHED_STATUSES,
		"can_cancel": cint(doc.docstatus) == 1,
		"can_delete": cint(doc.docstatus) == 2 or (cint(doc.docstatus) == 0 and _origin(doc) != PORTAL_ORIGIN) or cint(doc.docstatus) == 1,
		**(
			_tracking(doc)
			if with_tracking and not doc.is_new() and cint(doc.docstatus) > 0
			else {"pick_lists": [], "delivery_notes": [], "blockers": []}
		),
		"totals": {
			"qty": flt(doc.total_qty),
			"total": flt(doc.total),
			"discount_amount": flt(doc.discount_amount),
			"net_total": flt(doc.net_total),
			"taxes": flt(doc.total_taxes_and_charges),
			"grand_total": flt(doc.grand_total),
			"rounding_adjustment": flt(doc.get("rounding_adjustment")),
			"rounded_total": _order_total(doc),
		},
	}


# --- Lecture / écriture ------------------------------------------------------


def _get_order(name):
	if not name or not frappe.db.exists("Sales Order", name):
		frappe.throw(_("Commande introuvable : {0}").format(name))
	return frappe.get_doc("Sales Order", name)


def _assert_editable(doc):
	if cint(doc.docstatus) != 0:
		frappe.throw(_("La commande {0} est déjà validée : utilisez « Modifier » sur la commande.").format(doc.name))
	if _origin(doc) == PORTAL_ORIGIN and not _can_validate():
		frappe.throw(_("Les commandes du portail client sont modifiées par le responsable."))


@frappe.whitelist()
def preview_order(payload):
	_require(ORDER_ROLES)
	data = _payload(payload)
	doc = None
	if data.get("name"):
		doc = _get_order(data["name"])
		_assert_editable(doc)
	return serialize_order(_build_order(data, doc))


@frappe.whitelist()
def save_order(payload):
	_require(ORDER_ROLES)
	data = _payload(payload)
	doc = None
	if data.get("name"):
		doc = _get_order(data["name"])
		_assert_editable(doc)
	doc = _build_order(data, doc)
	_validate_schedule(doc)
	if doc.is_new():
		doc.insert()
	else:
		doc.save()
	return serialize_order(doc)


@frappe.whitelist()
def get_order(name):
	_require(ORDER_ROLES)
	return serialize_order(_get_order(name), with_tracking=True)


@frappe.whitelist()
def submit_order(name):
	_require(ORDER_VALIDATION_ROLES)
	doc = _get_order(name)
	if cint(doc.docstatus) != 0:
		frappe.throw(_("La commande {0} est déjà validée.").format(name))
	if not doc.get("items"):
		frappe.throw(_("La commande {0} ne contient aucun article.").format(name))
	_validate_schedule(doc)
	doc.flags.ignore_permissions = True
	doc.submit()
	return serialize_order(doc, with_tracking=True)


@frappe.whitelist()
def delete_order(name):
	"""Brouillon : suppression. Validée : annulation (préparation défaite) puis suppression. Annulée : suppression."""
	_require(ORDER_ROLES)
	doc = _get_order(name)
	if cint(doc.docstatus) == 0 and _origin(doc) == PORTAL_ORIGIN and not _can_validate():
		frappe.throw(_("Les commandes du portail client sont supprimées par le responsable."))
	from log.order_change_ops import _delivery_notes_for_order, _pick_lists_for_order, discard_order_preparation

	if cint(doc.docstatus) == 1:
		_cancel(doc)
	# Les listes de préparation annulées gardent un lien vers la commande : on les retire aussi.
	discard_order_preparation(
		{"deliveryNotes": _delivery_notes_for_order(name), "pickLists": _pick_lists_for_order(name)},
		delete_cancelled_pick_lists=True,
	)
	# Les notifications portail pointent vers la commande supprimée : elles n'ont plus d'objet.
	if frappe.db.exists("DocType", "Notification Portail"):
		frappe.db.delete("Notification Portail", {"document_type": "Sales Order", "document_name": name})
	frappe.delete_doc("Sales Order", name, ignore_permissions=True)
	return {"deleted": name}


# --- Commandes validées ------------------------------------------------------


def _assert_submitted(doc):
	if cint(doc.docstatus) != 1:
		frappe.throw(_("La commande {0} n'est pas validée.").format(doc.name))
	if doc.get("status") in FINISHED_STATUSES:
		frappe.throw(_("La commande {0} est clôturée.").format(doc.name))


def _cancel(doc):
	"""Annule une commande validée après avoir défait sa préparation ; refuse si la marchandise est partie."""
	from log.order_change_ops import discard_order_preparation, get_repreparation_impact_data

	impact = get_repreparation_impact_data(doc.name)
	if impact["blockers"]:
		frappe.throw("<br>".join(impact["blockers"]), title=_("Annulation impossible"))
	if flt(doc.get("per_delivered")) > 0:
		frappe.throw(_("La commande {0} est déjà (partiellement) livrée.").format(doc.name))
	discard_order_preparation(impact)
	doc.reload()
	doc.flags.ignore_permissions = True
	doc.cancel()
	return impact


@frappe.whitelist()
def cancel_order(name):
	_require(ORDER_ROLES)
	doc = _get_order(name)
	if cint(doc.docstatus) == 2:
		return serialize_order(doc, with_tracking=True)
	if cint(doc.docstatus) != 1:
		frappe.throw(_("Un brouillon se supprime, il ne s'annule pas."))
	_cancel(doc)
	return serialize_order(_get_order(name), with_tracking=True)


AMEND_RESET_FIELDS = (
	"custom_preparation_status",
	"custom_preparation_accepte_par",
	"custom_preparation_date_acceptation",
	"custom_distribution_revision",
)


@frappe.whitelist()
def amend_order(name):
	"""« Modifier entièrement » : annule la commande validée et ouvre un brouillon modifiable."""
	_require(ORDER_ROLES)
	doc = _get_order(name)
	if cint(doc.docstatus) == 0:
		frappe.throw(_("Un brouillon se modifie directement."))
	if cint(doc.docstatus) == 1:
		_cancel(doc)
		doc = _get_order(name)
	draft = frappe.copy_doc(doc)
	draft.amended_from = doc.name
	draft.transaction_date = nowdate()
	if getdate(draft.delivery_date) < getdate(draft.transaction_date):
		draft.delivery_date = draft.transaction_date
		for row in draft.items:
			row.delivery_date = draft.delivery_date
	for field in AMEND_RESET_FIELDS:
		if draft.meta.has_field(field):
			draft.set(field, None)
	draft.flags.ignore_permissions = True
	draft.insert()
	return {"name": draft.name, "amended_from": doc.name}


def _row_rate(row_or_none, line, price_list_rate, editable_rate):
	if editable_rate and line["rate"] is not None:
		return line["rate"]
	discount = line["discount_percentage"]
	if discount is None:
		discount = flt(row_or_none.discount_percentage) if row_or_none else 0
	return flt(flt(price_list_rate) * (1 - flt(discount) / 100), 2)


def _submitted_lines(doc, data):
	"""Lignes demandées pour une commande validée, contrôlées contre ce qui est déjà livré."""
	lines = _clean_lines(data.get("lines"))
	if not lines:
		frappe.throw(_("Une commande validée doit garder au moins un article. Annulez-la pour la vider."))
	rows = {row.name: row for row in doc.get("items")}
	kept = {line["row_name"] for line in lines if line["row_name"]}
	unknown = kept - set(rows)
	if unknown:
		frappe.throw(_("Ligne de commande inconnue : {0}. Actualisez la commande.").format(", ".join(sorted(unknown))))
	for row in doc.get("items"):
		delivered = flt(row.delivered_qty)
		if row.name not in kept and delivered > 0:
			frappe.throw(_("{0} est déjà livré ({1}) : la ligne ne peut pas être retirée.").format(row.item_name, delivered))
	for line in lines:
		row = rows.get(line["row_name"])
		if row and row.item_code != line["item_code"]:
			frappe.throw(_("La ligne {0} ne peut pas changer d'article.").format(row.idx))
		if row and line["qty"] + 1e-9 < flt(row.delivered_qty) * flt(row.conversion_factor or 1):
			frappe.throw(
				_("{0} : la quantité ne peut pas descendre sous la quantité livrée ({1}).").format(
					row.item_name, flt(row.delivered_qty) * flt(row.conversion_factor or 1)
				)
			)
	return lines


def _is_manual_schedule(doc) -> bool:
	rows = list(doc.get("payment_schedule") or [])
	return bool(rows) and not any(row.get("payment_term") for row in rows) and len(rows) > 1


def _scaled_manual_schedule(doc, new_total):
	"""Échéancier saisi à la main : on garde les dates et on répartit le nouveau total au prorata."""
	if not _is_manual_schedule(doc):
		return None
	rows = list(doc.get("payment_schedule") or [])
	old_total = sum(flt(row.payment_amount) for row in rows)
	if old_total <= 0:
		return None
	scaled, allocated = [], 0.0
	for index, row in enumerate(rows):
		amount = flt(new_total - allocated, 2) if index == len(rows) - 1 else flt(new_total * flt(row.payment_amount) / old_total, 2)
		allocated += amount
		scaled.append({"due_date": str(row.due_date), "payment_amount": amount, "mode_of_payment": row.get("mode_of_payment")})
	return scaled


def _header_payload(doc, data, lines):
	return {
		"customer": doc.customer,
		"lines": lines,
		"order_type": doc.get("custom_type") or DEFAULT_ORDER_TYPE,
		"delivery_date": data.get("delivery_date") or str(doc.delivery_date),
		"warehouse": doc.get("set_warehouse"),
		"price_list": doc.selling_price_list,
		"tax_template": doc.get("taxes_and_charges") or "",
		"additional_discount_percentage": flt(doc.additional_discount_percentage),
		"discount_amount": 0 if flt(doc.additional_discount_percentage) else flt(doc.discount_amount),
		"payment_terms_template": doc.get("payment_terms_template") or "",
	}


def _apply_reservations_preview(doc, lines, order, consumed):
	from log.stock_reservation import RESERVED_FIELD, allocate_reservations

	if not frappe.get_meta("Sales Order Item").has_field(RESERVED_FIELD):
		return
	values = allocate_reservations(
		[
			{"item_code": row.item_code, "qty": flt(row.stock_qty or row.qty), "reserved_qty": line.get("reserved_qty"), "so_detail": line["row_name"]}
			for row, line in zip(doc.items, lines)
		],
		_order_warehouse(doc),
		order,
		consumed,
	)
	for row, value in zip(doc.items, values):
		row.set(RESERVED_FIELD, value)


@frappe.whitelist()
def preview_order_update(payload):
	"""Aperçu d'une commande validée modifiée (rien n'est enregistré)."""
	_require(ORDER_ROLES)
	from log.stock_reservation import consumed_qty_by_so_item

	data = _payload(payload)
	doc = _get_order(data.get("name"))
	_assert_submitted(doc)
	lines = _submitted_lines(doc, data)
	copy = frappe.copy_doc(doc)
	copy.transaction_date = doc.transaction_date
	built = _build_order(_header_payload(doc, data, lines), copy, reservation_order=doc.name)
	consumed = consumed_qty_by_so_item(line["row_name"] for line in lines if line["row_name"])
	if consumed:
		_apply_reservations_preview(built, lines, doc.name, consumed)
	manual = _scaled_manual_schedule(doc, _order_total(built))
	if manual:
		_apply_schedule(built, "", manual)
	result = serialize_order(built, exclude_order=doc.name)
	rows = {row.name: row for row in doc.items}
	for line, out in zip(lines, result["lines"]):
		row = rows.get(line["row_name"])
		out["row_name"] = line["row_name"]
		out["delivered_qty"] = flt(row.delivered_qty) * flt(row.conversion_factor or 1) if row else 0.0
		out["picked_qty"] = flt(row.picked_qty) if row else 0.0
		out["remaining_qty"] = max(0.0, out["qty"] - out["delivered_qty"])
	result.update(
		{
			"name": doc.name,
			"docstatus": 1,
			"status": doc.status,
			"origin": _origin(doc),
			"editable": False,
			"per_delivered": flt(doc.per_delivered),
			"delivery_state": _delivery_state(doc),
			"can_edit_items": True,
			"can_cancel": True,
		}
	)
	return result


@frappe.whitelist()
def update_submitted_order(payload):
	"""Modifie les articles, la date de livraison et les réservations d'une commande validée."""
	_require(ORDER_ROLES)
	from log.order_change_ops import update_child_qty_rate
	from log.stock_reservation import RESERVED_FIELD, consumed_qty_by_so_item

	data = _payload(payload)
	doc = _get_order(data.get("name"))
	_assert_submitted(doc)
	lines = _submitted_lines(doc, data)
	rows = {row.name: row for row in doc.items}
	editable_rate = bool(cint(frappe.db.get_single_value("Selling Settings", "editable_price_list_rate")))
	delivery_date = getdate(data.get("delivery_date") or doc.delivery_date)
	if delivery_date < getdate(doc.transaction_date):
		frappe.throw(_("La date de livraison ne peut pas précéder la date de la commande."))
	new_codes = [line["item_code"] for line in lines if not line["row_name"]]
	prices = _price_map(new_codes, doc.selling_price_list, doc.customer)
	stock_uoms = dict(
		frappe.get_all("Item", filters={"name": ["in", new_codes or [""]]}, fields=["name", "stock_uom"], as_list=True)
	)
	warehouse = _order_warehouse(doc)

	trans_items, changed = [], len(lines) != len(doc.items)
	for index, line in enumerate(lines, start=1):
		row = rows.get(line["row_name"])
		price_list_rate = flt(row.price_list_rate) if row else flt(prices.get(line["item_code"]))
		rate = _row_rate(row, line, price_list_rate, editable_rate)
		trans_items.append(
			{
				"docname": row.name if row else None,
				"item_code": line["item_code"],
				"qty": line["qty"] / flt(row.conversion_factor or 1) if row else line["qty"],
				"rate": rate,
				"uom": row.uom if row else stock_uoms.get(line["item_code"]),
				"conversion_factor": flt(row.conversion_factor or 1) if row else 1,
				"delivery_date": str(delivery_date),
				"warehouse": row.warehouse if row else warehouse,
				"idx": index,
			}
		)
		if not row or abs(flt(row.stock_qty) - line["qty"]) > 1e-9 or abs(flt(row.rate) - rate) > 0.005:
			changed = True
		if row and getdate(row.delivery_date) != delivery_date:
			changed = True

	if changed:
		if _is_manual_schedule(doc):
			_portion_manual_schedule(doc)
		update_child_qty_rate("Sales Order", frappe.as_json(trans_items), doc.name)
		doc = _get_order(doc.name)

	if getdate(doc.delivery_date) != delivery_date:
		doc.delivery_date = str(delivery_date)
		doc.flags.ignore_permissions = True
		doc.save()
		doc = _get_order(doc.name)

	if frappe.get_meta("Sales Order Item").has_field(RESERVED_FIELD):
		ordered = _rows_for_lines(doc, lines)
		consumed = consumed_qty_by_so_item(row.name for row in ordered)
		_apply_reservations(doc, lines, doc.name, consumed, ordered)
		for row in ordered:
			frappe.db.set_value("Sales Order Item", row.name, RESERVED_FIELD, row.get(RESERVED_FIELD), update_modified=False)
	return serialize_order(_get_order(doc.name), with_tracking=True)


def _rows_for_lines(doc, lines):
	"""Aligne les lignes enregistrées sur les lignes demandées : par nom, puis les nouvelles par article."""
	by_name = {row.name: row for row in doc.get("items")}
	used = {line["row_name"] for line in lines if line["row_name"] in by_name}
	fresh = [row for row in sorted(doc.get("items"), key=lambda row: row.idx) if row.name not in used]
	rows = []
	for line in lines:
		row = by_name.get(line["row_name"])
		if not row:
			row = next((candidate for candidate in fresh if candidate.item_code == line["item_code"]), None)
			if row:
				fresh.remove(row)
		if not row:
			frappe.throw(_("Ligne introuvable après la mise à jour : {0}.").format(line["item_code"]))
		rows.append(row)
	return rows


def _portion_manual_schedule(doc):
	"""ERPNext recalcule l'échéancier au prorata des parts : on convertit les montants saisis en parts."""
	rows = list(doc.get("payment_schedule") or [])
	total = sum(flt(row.payment_amount) for row in rows)
	if total <= 0:
		return
	allocated = 0.0
	for index, row in enumerate(rows):
		portion = 100 - allocated if index == len(rows) - 1 else flt(flt(row.payment_amount) * 100 / total, 9)
		allocated += portion
		frappe.db.set_value("Payment Schedule", row.name, "invoice_portion", portion, update_modified=False)


def _list_filters(status, origin, mine):
	filters = {}
	if status == "brouillon":
		filters["docstatus"] = 0
	elif status == "a_livrer":
		filters.update({"docstatus": 1, "per_delivered": ["<", 100], "status": ["not in", list(FINISHED_STATUSES) + ["On Hold"]]})
	elif status == "partielle":
		filters.update({"docstatus": 1, "per_delivered": ["between", [0.000001, 99.999999]]})
	elif status == "soumise":
		filters["docstatus"] = 1
	elif status == "annulee":
		filters["docstatus"] = 2
	else:
		filters["docstatus"] = ["<", 2]
	if origin in (INTERNAL_ORIGIN, PORTAL_ORIGIN) and _has_field("Sales Order", "custom_origine_commande"):
		filters["custom_origine_commande"] = origin if origin == PORTAL_ORIGIN else ["!=", PORTAL_ORIGIN]
	if cint(mine):
		filters["owner"] = frappe.session.user
	return filters


def _order_counts() -> dict:
	today = nowdate()
	drafts = frappe.get_all(
		"Sales Order",
		filters={"docstatus": 0},
		fields=["custom_origine_commande"] if _has_field("Sales Order", "custom_origine_commande") else ["name"],
	)
	portal = sum(1 for row in drafts if row.get("custom_origine_commande") == PORTAL_ORIGIN)
	submitted_today = frappe.get_all(
		"Sales Order",
		filters={"docstatus": 1, "transaction_date": today},
		fields=["rounded_total", "grand_total"],
	)
	to_deliver = frappe.db.count(
		"Sales Order",
		{"docstatus": 1, "per_delivered": ["<", 100], "status": ["not in", list(FINISHED_STATUSES) + ["On Hold"]]},
	)
	return {
		"a_livrer": to_deliver,
		"brouillons": len(drafts),
		"brouillons_portail": portal,
		"soumises_aujourdhui": len(submitted_today),
		"montant_aujourdhui": sum(flt(row.rounded_total or row.grand_total) for row in submitted_today),
	}


@frappe.whitelist()
def get_order_counts():
	_require(ORDER_ROLES)
	return _order_counts()


@frappe.whitelist()
def list_orders(status=None, origin=None, mine=0, limit=200):
	_require(ORDER_ROLES)
	fields = [
		"name",
		"customer",
		"customer_name",
		"transaction_date",
		"delivery_date",
		"total_qty",
		"grand_total",
		"rounded_total",
		"status",
		"docstatus",
		"per_delivered",
		"owner",
		"modified",
	]
	for field in ("custom_origine_commande", "custom_type", "custom_commune", "custom_wilaya"):
		if _has_field("Sales Order", field):
			fields.append(field)
	rows = frappe.get_all(
		"Sales Order",
		filters=_list_filters(status or "all", origin, mine),
		fields=fields,
		order_by="docstatus asc, modified desc",
		limit_page_length=min(cint(limit) or 200, 500),
	)
	owners = {row.owner for row in rows}
	names = dict(
		frappe.get_all("User", filters={"name": ["in", list(owners) or [""]]}, fields=["name", "full_name"], as_list=True)
	)
	return {
		"orders": [
			{
				"name": row.name,
				"customer": row.customer,
				"customer_name": row.customer_name or row.customer,
				"transaction_date": cstr(row.transaction_date),
				"delivery_date": cstr(row.delivery_date),
				"total_qty": flt(row.total_qty),
				"total": flt(row.rounded_total or row.grand_total),
				"status": row.status,
				"docstatus": cint(row.docstatus),
				"per_delivered": flt(row.per_delivered),
				"delivery_state": _delivery_state(row),
				"origin": row.get("custom_origine_commande") or INTERNAL_ORIGIN,
				"order_type": row.get("custom_type"),
				"wilaya": row.get("custom_wilaya"),
				"owner": row.owner,
				"owner_name": names.get(row.owner) or row.owner,
				"modified": cstr(row.modified),
			}
			for row in rows
		],
		"counts": _order_counts(),
	}
