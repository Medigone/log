# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Réception marchandise : Reçu d'Achat (Purchase Receipt) libre, saisi par scan."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

from log.api.distribution import RECEIPT_ROLES, RECEIPT_VALIDATION_ROLES, _payload, _require
from log.pick_list_ops import _barcode_increment, _parse_list, _scan_barcode
from log.utils.batches import batch_expiry_map

DEFAULT_BUYING_PRICE_LIST = "Achat standard"
DEFAULT_SELLING_PRICE_LIST = "Vente standard"
DEFAULT_STOCK_UOM = "N°"
READY_FIELD = "custom_saisie_terminee"
RECEIPT_STATUSES = ("en_cours", "a_valider", "valide", "annule")


# --- Statut & sérialisation ---------------------------------------------------


def receipt_status(docstatus, ready) -> str:
	docstatus = cint(docstatus)
	if docstatus == 1:
		return "valide"
	if docstatus == 2:
		return "annule"
	return "a_valider" if cint(ready) else "en_cours"


def _has_ready_field() -> bool:
	return bool(frappe.db.has_column("Purchase Receipt", READY_FIELD))


def _item_flags(item_codes) -> dict:
	codes = sorted({code for code in item_codes if code})
	if not codes:
		return {}
	rows = frappe.get_all(
		"Item",
		filters={"name": ["in", codes]},
		fields=["name", "stock_uom", "has_batch_no", "has_expiry_date"],
	)
	return {row.name: row for row in rows}


def _batch_expiry(batch_names) -> dict:
	return batch_expiry_map(batch_names)


def serialize_receipt(doc) -> dict:
	items = list(doc.get("items") or [])
	flags = _item_flags(row.item_code for row in items)
	expiry = _batch_expiry(row.get("batch_no") for row in items)
	ready = doc.get(READY_FIELD)
	return {
		"name": doc.name,
		"supplier": doc.supplier,
		"supplier_name": doc.get("supplier_name") or doc.supplier,
		"company": doc.company,
		"posting_date": str(doc.posting_date) if doc.posting_date else None,
		"warehouse": doc.get("set_warehouse"),
		"supplier_delivery_note": doc.get("supplier_delivery_note"),
		"currency": doc.get("currency"),
		"docstatus": cint(doc.docstatus),
		"status": receipt_status(doc.docstatus, ready),
		"ready": bool(cint(ready)),
		"linked_to_purchase_order": any(row.get("purchase_order") for row in items),
		"total_qty": flt(doc.get("total_qty")),
		"net_total": flt(doc.get("net_total")),
		"grand_total": flt(doc.get("grand_total")),
		"modified": str(doc.modified) if doc.get("modified") else None,
		"owner": doc.get("owner"),
		"lines": [
			{
				"item_code": row.item_code,
				"item_name": row.item_name,
				"uom": row.get("stock_uom") or row.uom,
				"qty": flt(row.get("received_qty") or row.qty),
				"rate": flt(row.rate),
				"amount": flt(row.amount),
				"barcode": row.get("barcode"),
				"batch_no": row.get("batch_no"),
				"expiry_date": expiry.get(row.get("batch_no")),
				"has_batch_no": bool(cint((flags.get(row.item_code) or {}).get("has_batch_no"))),
				"has_expiry_date": bool(cint((flags.get(row.item_code) or {}).get("has_expiry_date"))),
			}
			for row in items
		],
	}


def _get_draft(receipt):
	if not receipt or not frappe.db.exists("Purchase Receipt", receipt):
		frappe.throw(_("Réception introuvable : {0}").format(receipt))
	doc = frappe.get_doc("Purchase Receipt", receipt)
	if cint(doc.docstatus) != 0:
		frappe.throw(_("La réception {0} est déjà validée.").format(receipt))
	return doc


# --- Options ------------------------------------------------------------------


def _default_company():
	import erpnext

	return erpnext.get_default_company() or frappe.db.get_value("Company", {}, "name")


def _vehicle_warehouses() -> set[str]:
	if not frappe.db.exists("DocType", "Vehicule"):
		return set()
	return {name for name in frappe.get_all("Vehicule", pluck="warehouse") if name}


def _receiving_warehouses(company) -> list[str]:
	rows = frappe.get_all(
		"Warehouse",
		filters={"company": company, "is_group": 0, "disabled": 0},
		fields=["name", "warehouse_type"],
		order_by="name asc",
	)
	excluded = _vehicle_warehouses()
	return [row.name for row in rows if row.name not in excluded and row.get("warehouse_type") != "Transit"]


def _default_warehouse(company, warehouses):
	from log.log.delivery_note_hooks import get_default_company_warehouse

	default = get_default_company_warehouse(company)
	if default in warehouses:
		return default
	return warehouses[0] if warehouses else None


def _buying_price_list() -> str | None:
	name = frappe.db.get_single_value("Buying Settings", "buying_price_list") or DEFAULT_BUYING_PRICE_LIST
	return name if frappe.db.exists("Price List", name) else None


def _selling_price_list() -> str | None:
	name = frappe.db.get_single_value("Selling Settings", "selling_price_list") or DEFAULT_SELLING_PRICE_LIST
	return name if frappe.db.exists("Price List", name) else None


def _default_stock_uom() -> str:
	return frappe.db.get_single_value("Stock Settings", "stock_uom") or DEFAULT_STOCK_UOM


def _item_uoms(default_uom) -> list[str]:
	used = frappe.get_all("Item", filters={"disabled": 0}, pluck="stock_uom", distinct=True)
	names = {name for name in used if name}
	if default_uom:
		names.add(default_uom)
	return sorted(names)


def _item_groups() -> list[str]:
	from log.setup.item_groups import CANONICAL_LEAF_GROUPS

	existing = set(frappe.get_all("Item Group", filters={"is_group": 0}, pluck="name"))
	canonical = [name for name in CANONICAL_LEAF_GROUPS if name in existing]
	others = sorted(existing - set(canonical))
	return canonical + others


def _default_supplier_group() -> str | None:
	from frappe.utils.nestedset import get_root_of

	return frappe.db.get_single_value("Buying Settings", "supplier_group") or get_root_of("Supplier Group")


@frappe.whitelist()
def get_receipt_options():
	_require(RECEIPT_ROLES)
	company = _default_company()
	warehouses = _receiving_warehouses(company) if company else []
	default_uom = _default_stock_uom()
	return {
		"company": company,
		"currency": frappe.db.get_value("Company", company, "default_currency") if company else None,
		"warehouses": warehouses,
		"default_warehouse": _default_warehouse(company, warehouses),
		"buying_price_list": _buying_price_list(),
		"selling_price_list": _selling_price_list(),
		"item_groups": _item_groups(),
		"brands": sorted(frappe.get_all("Brand", pluck="name")),
		"uoms": _item_uoms(default_uom),
		"default_uom": default_uom,
		"supplier_groups": sorted(frappe.get_all("Supplier Group", pluck="name")),
		"default_supplier_group": _default_supplier_group(),
		"can_validate": _can_validate(),
	}


def _can_validate() -> bool:
	from log.api.distribution import _roles
	from log.api.distribution_rules import has_any_role

	return has_any_role(_roles(), RECEIPT_VALIDATION_ROLES)


# --- Fournisseurs -------------------------------------------------------------


@frappe.whitelist()
def search_suppliers(txt=None, limit=20):
	_require(RECEIPT_ROLES)
	txt = (txt or "").strip()
	or_filters = None
	if txt:
		or_filters = [["name", "like", f"%{txt}%"], ["supplier_name", "like", f"%{txt}%"]]
	rows = frappe.get_all(
		"Supplier",
		filters={"disabled": 0},
		or_filters=or_filters,
		fields=["name", "supplier_name", "supplier_group"],
		order_by="supplier_name asc",
		limit_page_length=min(cint(limit) or 20, 50),
	)
	return [
		{"name": row.name, "supplier_name": row.supplier_name or row.name, "supplier_group": row.supplier_group}
		for row in rows
	]


@frappe.whitelist()
def create_supplier(payload):
	_require(RECEIPT_ROLES)
	data = _payload(payload)
	supplier_name = (data.get("supplier_name") or "").strip()
	if not supplier_name:
		frappe.throw(_("Saisissez le nom du fournisseur."))
	existing = frappe.db.get_value("Supplier", {"supplier_name": supplier_name}, "name")
	if existing:
		frappe.throw(_("Le fournisseur {0} existe déjà.").format(supplier_name))
	group = data.get("supplier_group") or _default_supplier_group()
	if group and not frappe.db.exists("Supplier Group", group):
		frappe.throw(_("Groupe de fournisseurs inconnu : {0}").format(group))
	doc = frappe.get_doc(
		{
			"doctype": "Supplier",
			"supplier_name": supplier_name,
			"supplier_group": group,
			"supplier_type": "Company",
		}
	)
	doc.insert(ignore_permissions=True)
	return {"name": doc.name, "supplier_name": doc.supplier_name, "supplier_group": doc.supplier_group}


# --- Liste & lecture ----------------------------------------------------------


def _status_filters(status, has_ready):
	if status == "valide":
		return {"docstatus": 1}
	if status == "a_valider":
		return {"docstatus": 0, READY_FIELD: 1} if has_ready else None
	if status == "en_cours":
		return {"docstatus": 0, READY_FIELD: 0} if has_ready else {"docstatus": 0}
	if status == "ouvertes":
		return {"docstatus": 0}
	return {"docstatus": ["<", 2]}


def _receipt_counts(has_ready) -> dict:
	drafts = frappe.get_all(
		"Purchase Receipt",
		filters={"docstatus": 0},
		fields=[READY_FIELD] if has_ready else ["name"],
	)
	ready = sum(1 for row in drafts if has_ready and cint(row.get(READY_FIELD)))
	validated = frappe.db.count(
		"Purchase Receipt",
		{"docstatus": 1, "posting_date": [">=", frappe.utils.add_days(nowdate(), -30)]},
	)
	return {"en_cours": len(drafts) - ready, "a_valider": ready, "valide_30j": validated}


@frappe.whitelist()
def list_receipts(status=None, limit=100):
	_require(RECEIPT_ROLES)
	has_ready = _has_ready_field()
	fields = [
		"name",
		"supplier",
		"supplier_name",
		"posting_date",
		"set_warehouse",
		"supplier_delivery_note",
		"total_qty",
		"grand_total",
		"currency",
		"docstatus",
		"owner",
		"modified",
	]
	if has_ready:
		fields.append(READY_FIELD)
	filters = _status_filters(status or "all", has_ready)
	rows = (
		frappe.get_all(
			"Purchase Receipt",
			filters=filters,
			fields=fields,
			order_by="docstatus asc, modified desc",
			limit_page_length=min(cint(limit) or 100, 500),
		)
		if filters is not None
		else []
	)
	line_counts = {}
	names = [row.name for row in rows]
	if names:
		for row in frappe.get_all(
			"Purchase Receipt Item",
			filters={"parent": ["in", names], "parenttype": "Purchase Receipt"},
			fields=["parent", "count(name) as line_count"],
			group_by="parent",
			order_by="parent asc",
		):
			line_counts[row.parent] = cint(row.line_count)
	return {
		"receipts": [
			{
				"name": row.name,
				"supplier": row.supplier,
				"supplier_name": row.supplier_name or row.supplier,
				"posting_date": str(row.posting_date) if row.posting_date else None,
				"warehouse": row.set_warehouse,
				"supplier_delivery_note": row.supplier_delivery_note,
				"total_qty": flt(row.total_qty),
				"grand_total": flt(row.grand_total),
				"currency": row.currency,
				"lines": line_counts.get(row.name, 0),
				"status": receipt_status(row.docstatus, row.get(READY_FIELD)),
				"owner": row.owner,
				"modified": str(row.modified) if row.modified else None,
			}
			for row in rows
		],
		"counts": _receipt_counts(has_ready),
	}


@frappe.whitelist()
def get_receipt_counts():
	"""Compteurs légers pour le badge de navigation."""
	_require(RECEIPT_ROLES)
	return _receipt_counts(_has_ready_field())


@frappe.whitelist()
def get_receipt(name):
	_require(RECEIPT_ROLES)
	if not name or not frappe.db.exists("Purchase Receipt", name):
		frappe.throw(_("Réception introuvable : {0}").format(name))
	return serialize_receipt(frappe.get_doc("Purchase Receipt", name))


# --- Création & lignes --------------------------------------------------------


def _assert_po_not_required():
	if (frappe.db.get_single_value("Buying Settings", "po_required") or "No") == "Yes":
		frappe.throw(
			_(
				"Les Paramètres d'Achat exigent une Commande d'Achat pour chaque Reçu d'Achat. "
				"Désactivez « Commande d'achat requise » pour réceptionner sans commande."
			)
		)


def _save_draft(doc):
	doc.flags.ignore_permissions = True
	# Un brouillon peut rester sans ligne le temps de scanner le premier article :
	# les contrôles ERPNext (totaux, lignes obligatoires) ne s'appliquent qu'avec des lignes.
	empty = not doc.get("items")
	doc.flags.ignore_mandatory = empty
	doc.flags.ignore_validate = empty
	if empty:
		doc.set_missing_values()
	if doc.is_new():
		doc.insert()
	else:
		doc.save()
	return doc


@frappe.whitelist()
def create_receipt(payload):
	_require(RECEIPT_ROLES)
	_assert_po_not_required()
	data = _payload(payload)
	supplier = data.get("supplier")
	if not supplier or not frappe.db.exists("Supplier", supplier):
		frappe.throw(_("Choisissez un fournisseur."))
	company = data.get("company") or _default_company()
	warehouse = data.get("warehouse")
	if not warehouse or warehouse not in _receiving_warehouses(company):
		frappe.throw(_("Choisissez un entrepôt de réception."))
	posting_date = data.get("posting_date") or nowdate()
	if getdate(posting_date) > getdate(nowdate()):
		frappe.throw(_("La date de réception ne peut pas être dans le futur."))

	doc = frappe.new_doc("Purchase Receipt")
	doc.update(
		{
			"supplier": supplier,
			"company": company,
			"posting_date": posting_date,
			"set_posting_time": 1 if getdate(posting_date) != getdate(nowdate()) else 0,
			"set_warehouse": warehouse,
			"supplier_delivery_note": (data.get("supplier_delivery_note") or "").strip() or None,
			"buying_price_list": _buying_price_list(),
		}
	)
	_save_draft(doc)
	return serialize_receipt(doc)


def _default_buying_rate(item_code, supplier=None, price_list=None, stock_uom=None) -> float:
	"""Prix d'achat proposé : tarif fournisseur → tarif d'achat → dernier prix d'achat."""
	price_list = price_list or _buying_price_list()
	if price_list:
		prices = frappe.get_all(
			"Item Price",
			filters={"item_code": item_code, "price_list": price_list},
			fields=["price_list_rate", "supplier", "uom"],
			order_by="modified desc",
		)
		usable = [row for row in prices if not row.uom or not stock_uom or row.uom == stock_uom]
		for row in usable:
			if supplier and row.supplier == supplier:
				return flt(row.price_list_rate)
		for row in usable:
			if not row.supplier:
				return flt(row.price_list_rate)
	return flt(frappe.db.get_value("Item", item_code, "last_purchase_rate"))


def _item_exists(item_code) -> bool:
	return bool(frappe.db.exists("Item", item_code))


def _scanned_item_payload(item_code, barcode, barcode_uom, supplier, price_list):
	item = frappe.db.get_value(
		"Item",
		item_code,
		["item_name", "stock_uom", "disabled", "has_batch_no", "has_expiry_date", "is_stock_item"],
		as_dict=True,
	)
	if not item:
		frappe.throw(_("Article introuvable : {0}").format(item_code))
	if cint(item.disabled):
		frappe.throw(_("L'article {0} est désactivé.").format(item_code))
	return {
		"found": True,
		"item_code": item_code,
		"item_name": item.item_name or item_code,
		"uom": item.stock_uom,
		"increment": _barcode_increment(item_code, barcode_uom, item.stock_uom),
		"rate": _default_buying_rate(item_code, supplier, price_list, item.stock_uom),
		"has_batch_no": bool(cint(item.has_batch_no)),
		"has_expiry_date": bool(cint(item.has_expiry_date)),
		"is_stock_item": bool(cint(item.is_stock_item)),
		"barcode": barcode,
	}


@frappe.whitelist()
def scan_receipt_item(receipt, search_value):
	"""Résout un code-barres pour une réception. Un code inconnu renvoie `found: False`."""
	_require(RECEIPT_ROLES)
	search_value = (search_value or "").strip()
	if not search_value:
		frappe.throw(_("Scannez un code-barres."))
	supplier, price_list = (
		frappe.db.get_value("Purchase Receipt", receipt, ["supplier", "buying_price_list"]) or (None, None)
	)
	data = _scan_barcode(search_value)
	item_code = data.get("item_code")
	if item_code and not _item_exists(item_code):
		# ERPNext garde le résultat du scan en cache : l'article a pu être supprimé entre-temps.
		item_code = None
	if not item_code and data.get("warehouse"):
		frappe.throw(_("Ce code correspond à un entrepôt, pas à un article."))
	if not item_code and _item_exists(search_value):
		item_code = search_value
	if not item_code:
		return {"found": False, "barcode": search_value}
	return _scanned_item_payload(
		item_code, data.get("barcode") or search_value, data.get("uom"), supplier, price_list
	)


def _ensure_batch(item_code, batch_no, expiry_date):
	"""Crée le lot s'il n'existe pas ; met à jour la péremption d'un lot encore sans mouvement."""
	existing = frappe.db.get_value("Batch", batch_no, ["item", "expiry_date"], as_dict=True)
	if not existing:
		frappe.get_doc(
			{
				"doctype": "Batch",
				"batch_id": batch_no,
				"item": item_code,
				"expiry_date": expiry_date or None,
			}
		).insert(ignore_permissions=True)
		return
	if existing.item != item_code:
		frappe.throw(_("Le lot {0} existe déjà pour l'article {1}.").format(batch_no, existing.item))
	if expiry_date and str(existing.expiry_date or "") != str(getdate(expiry_date)):
		if frappe.db.exists("Serial and Batch Entry", {"batch_no": batch_no, "docstatus": 1}):
			frappe.throw(
				_("Le lot {0} a déjà du stock avec la péremption {1}.").format(batch_no, existing.expiry_date)
			)
		frappe.db.set_value("Batch", batch_no, "expiry_date", expiry_date)


def _clean_lines(lines) -> list[dict]:
	cleaned = []
	for line in lines:
		if not isinstance(line, dict):
			continue
		item_code = (line.get("item_code") or "").strip()
		qty = flt(line.get("qty"))
		if not item_code or qty <= 0:
			continue
		if flt(line.get("rate")) < 0:
			frappe.throw(_("Le prix d'achat de {0} ne peut pas être négatif.").format(item_code))
		cleaned.append(
			{
				"item_code": item_code,
				"qty": qty,
				"rate": flt(line.get("rate")),
				"barcode": (line.get("barcode") or "").strip() or None,
				"batch_no": (line.get("batch_no") or "").strip() or None,
				"expiry_date": line.get("expiry_date") or None,
			}
		)
	return cleaned


@frappe.whitelist()
def save_receipt_lines(receipt, lines):
	"""Remplace les lignes du brouillon par la saisie du magasinier (quantités en unité de stock)."""
	_require(RECEIPT_ROLES)
	doc = _get_draft(receipt)
	if any(row.get("purchase_order") for row in doc.get("items") or []):
		frappe.throw(_("Cette réception est liée à une commande d'achat : modifiez-la dans le Desk."))
	cleaned = _clean_lines(_parse_list(lines))
	flags = _item_flags(line["item_code"] for line in cleaned)
	missing = sorted({line["item_code"] for line in cleaned} - set(flags))
	if missing:
		frappe.throw(_("Article introuvable : {0}").format(", ".join(missing)))

	doc.set("items", [])
	for line in cleaned:
		if line["batch_no"]:
			if not cint(flags[line["item_code"]].has_batch_no):
				frappe.throw(_("L'article {0} n'est pas géré par lot.").format(line["item_code"]))
			_ensure_batch(line["item_code"], line["batch_no"], line["expiry_date"])
		stock_uom = flags[line["item_code"]].stock_uom
		row = {
			"item_code": line["item_code"],
			"qty": line["qty"],
			"received_qty": line["qty"],
			"rejected_qty": 0,
			"uom": stock_uom,
			"stock_uom": stock_uom,
			"conversion_factor": 1,
			"rate": line["rate"],
			"price_list_rate": line["rate"],
			"warehouse": doc.set_warehouse,
			"barcode": line["barcode"],
		}
		if line["batch_no"]:
			row.update({"use_serial_batch_fields": 1, "batch_no": line["batch_no"]})
		doc.append("items", row)
	if _has_ready_field():
		doc.set(READY_FIELD, 0)
	_save_draft(doc)
	return serialize_receipt(doc)


def receipt_blocking_issues(doc) -> list[str]:
	items = list(doc.get("items") or [])
	if not items:
		return [_("Aucun article n'a été scanné.")]
	flags = _item_flags(row.item_code for row in items)
	expiry = _batch_expiry(row.get("batch_no") for row in items)
	issues = []
	for row in items:
		label = row.item_name or row.item_code
		item = flags.get(row.item_code) or {}
		if flt(row.qty) <= 0:
			issues.append(_("{0} : quantité nulle.").format(label))
		if cint(item.get("has_batch_no")) and not row.get("batch_no"):
			issues.append(_("{0} : numéro de lot manquant.").format(label))
		elif cint(item.get("has_expiry_date")) and row.get("batch_no") and not expiry.get(row.batch_no):
			issues.append(_("{0} : date de péremption manquante.").format(label))
	return issues


def _throw_issues(issues):
	if issues:
		frappe.throw("<br>".join(issues), title=_("Réception incomplète"))


@frappe.whitelist()
def mark_receipt_ready(receipt, ready=1):
	_require(RECEIPT_ROLES)
	doc = _get_draft(receipt)
	if not _has_ready_field():
		frappe.throw(_("Le champ « Saisie terminée » n'est pas encore synchronisé. Lancez la migration Bench."))
	ready = cint(ready)
	if ready:
		_throw_issues(receipt_blocking_issues(doc))
	doc.db_set(READY_FIELD, ready, update_modified=True)
	return serialize_receipt(doc)


@frappe.whitelist()
def submit_receipt(receipt):
	_require(RECEIPT_VALIDATION_ROLES)
	doc = _get_draft(receipt)
	_throw_issues(receipt_blocking_issues(doc))
	doc.flags.ignore_permissions = True
	doc.submit()
	return serialize_receipt(doc)


@frappe.whitelist()
def delete_receipt(receipt):
	_require(RECEIPT_ROLES)
	_get_draft(receipt)
	frappe.delete_doc("Purchase Receipt", receipt, ignore_permissions=True)
	return {"deleted": receipt}


# --- Création rapide d'article ------------------------------------------------


def _gtin_check_digit_ok(code: str) -> bool:
	digits = [int(char) for char in code]
	body, check = digits[:-1], digits[-1]
	total = sum(value * (3 if index % 2 == 0 else 1) for index, value in enumerate(reversed(body)))
	return (10 - total % 10) % 10 == check


def barcode_type_for(barcode: str) -> str:
	"""Type ERPNext pour un code numérique valide ; vide sinon (aucun contrôle ERPNext)."""
	code = (barcode or "").strip()
	if not code.isdigit() or len(code) not in (8, 12, 13) or not _gtin_check_digit_ok(code):
		return ""
	return "UPC-A" if len(code) == 12 else "EAN"


def _barcode_owner(barcode):
	return frappe.db.get_value("Item Barcode", {"barcode": barcode, "parenttype": "Item"}, "parent")


def _upsert_item_price(item_code, price_list, rate, uom, buying):
	if not price_list or flt(rate) <= 0:
		return
	existing = frappe.db.get_value(
		"Item Price", {"item_code": item_code, "price_list": price_list, "supplier": ["is", "not set"]}, "name"
	)
	if existing:
		frappe.db.set_value("Item Price", existing, "price_list_rate", flt(rate))
		return
	frappe.get_doc(
		{
			"doctype": "Item Price",
			"item_code": item_code,
			"price_list": price_list,
			"price_list_rate": flt(rate),
			"uom": uom,
			"buying": 1 if buying else 0,
			"selling": 0 if buying else 1,
		}
	).insert(ignore_permissions=True)


@frappe.whitelist()
def create_receipt_item(payload):
	"""Crée un article à partir d'un code-barres inconnu scanné pendant une réception."""
	_require(RECEIPT_ROLES)
	from log.catalog_ops import insert_item

	data = _payload(payload)
	barcode = (data.get("barcode") or "").strip()
	doc = insert_item(data)

	supplier, price_list = None, None
	if data.get("receipt"):
		supplier, price_list = (
			frappe.db.get_value("Purchase Receipt", data.get("receipt"), ["supplier", "buying_price_list"])
			or (None, None)
		)
	result = _scanned_item_payload(doc.name, barcode or doc.name, None, supplier, price_list)
	if flt(data.get("buying_rate")) > 0:
		result["rate"] = flt(data.get("buying_rate"))
	return result
