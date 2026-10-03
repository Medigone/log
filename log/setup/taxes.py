# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""TVA algérienne en vigueur (19 % normal, 9 % réduit).

Le plan comptable ERPNext pour l'Algérie crée encore des modèles à 17 % et 7 % : on crée les
comptes et modèles à jour, on fait du 19 % le modèle par défaut et on désactive les anciens
modèles. Les documents déjà soumis gardent leurs taxes ; rien n'est supprimé.
"""

from __future__ import annotations

import frappe

ALGERIA = "Algeria"
VAT_RATES = (
	{"title": "TVA 19%", "rate": 19, "default": True},
	{"title": "TVA 9%", "rate": 9, "default": False},
)
OBSOLETE_RATES = (17, 7)
TEMPLATE_DOCTYPES = (
	("Sales Taxes and Charges Template", "Sales Taxes and Charges"),
	("Purchase Taxes and Charges Template", "Purchase Taxes and Charges"),
)


def ensure_algeria_vat():
	if not frappe.db.exists("DocType", "Sales Taxes and Charges Template"):
		return
	for company in frappe.get_all("Company", filters={"country": ALGERIA}, fields=["name", "abbr"]):
		_ensure_company_vat(company)


def _tax_group(company: str) -> str | None:
	"""Compte de regroupement des taxes : celui des comptes de TVA existants, sinon un groupe « Tax »."""
	existing = frappe.db.get_value(
		"Account", {"company": company, "account_type": "Tax", "is_group": 0}, "parent_account"
	)
	if existing:
		return existing
	return frappe.db.get_value(
		"Account", {"company": company, "account_type": "Tax", "is_group": 1, "root_type": "Liability"}, "name"
	)


def _ensure_account(company, title, rate) -> str | None:
	name = frappe.db.get_value("Account", {"company": company.name, "account_name": title}, "name")
	if name:
		return name
	parent = _tax_group(company.name)
	if not parent:
		return None
	account = frappe.get_doc(
		{
			"doctype": "Account",
			"account_name": title,
			"company": company.name,
			"parent_account": parent,
			"account_type": "Tax",
			"tax_rate": rate,
			"is_group": 0,
		}
	)
	account.insert(ignore_permissions=True)
	return account.name


def _ensure_template(doctype, child_doctype, company, title, rate, account, is_default):
	name = f"{title} - {company.abbr}"
	if frappe.db.exists(doctype, name):
		if is_default and not frappe.db.get_value(doctype, name, "is_default"):
			frappe.db.set_value(doctype, name, "is_default", 1)
		return name
	row = {
		"charge_type": "On Net Total",
		"account_head": account,
		"rate": rate,
		"description": title,
	}
	if child_doctype == "Purchase Taxes and Charges":
		row.update({"category": "Total", "add_deduct_tax": "Add"})
	template = frappe.get_doc(
		{
			"doctype": doctype,
			"title": title,
			"company": company.name,
			"is_default": 1 if is_default else 0,
			"taxes": [row],
		}
	)
	template.insert(ignore_permissions=True)
	return template.name


def _ensure_item_tax_template(company, title, rate, accounts):
	"""Modèle de taxe article : le même taux sur chaque compte de TVA.

	Une ligne de taxe de commande (TVA 19 % ou 9 %) applique alors le taux de l'article, quel que
	soit le modèle de taxe choisi sur le document.
	"""
	if not frappe.db.exists("DocType", "Item Tax Template"):
		return None
	name = f"{title} - {company.abbr}"
	if frappe.db.exists("Item Tax Template", name):
		return name
	template = frappe.get_doc(
		{
			"doctype": "Item Tax Template",
			"title": title,
			"company": company.name,
			"taxes": [{"tax_type": account, "tax_rate": rate} for account in accounts],
		}
	)
	template.insert(ignore_permissions=True)
	return template.name


def _disable_obsolete(doctype, child_doctype, company, keep: set[str]):
	"""Désactive les modèles dont toutes les lignes portent un ancien taux (17 % / 7 %)."""
	for name in frappe.get_all(doctype, filters={"company": company.name, "disabled": 0}, pluck="name"):
		if name in keep:
			continue
		rates = frappe.get_all(
			child_doctype, filters={"parent": name, "parenttype": doctype}, pluck="rate"
		)
		if rates and all(float(rate) in OBSOLETE_RATES for rate in rates):
			frappe.db.set_value(doctype, name, {"disabled": 1, "is_default": 0})


def _ensure_company_vat(company):
	accounts = {}
	for vat in VAT_RATES:
		account = _ensure_account(company, vat["title"], vat["rate"])
		if not account:
			frappe.log_error(
				title="TVA Algérie",
				message=f"Aucun compte de regroupement des taxes pour {company.name} : TVA {vat['rate']} % non créée.",
			)
			return
		accounts[vat["title"]] = account

	for doctype, child_doctype in TEMPLATE_DOCTYPES:
		created = set()
		for vat in VAT_RATES:
			created.add(
				_ensure_template(
					doctype, child_doctype, company, vat["title"], vat["rate"], accounts[vat["title"]], vat["default"]
				)
			)
		_disable_obsolete(doctype, child_doctype, company, created)

	for vat in VAT_RATES:
		_ensure_item_tax_template(company, vat["title"], vat["rate"], accounts.values())
