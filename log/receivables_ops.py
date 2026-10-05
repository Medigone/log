# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Créances clients au jour : indicateurs globaux et balance âgée par client."""

from __future__ import annotations

import frappe
from frappe.utils import cint, flt, getdate, nowdate

from log.api.distribution import MANAGER_ROLES, _require
from log.receipt_ops import _default_company
from log.services import receivables as rc


def _customer_info(names) -> dict[str, dict]:
	if not names:
		return {}
	fields = ["name", "customer_name", "customer_group"]
	if frappe.db.has_column("Customer", "custom_wilaya"):
		fields.append("custom_wilaya")
	return {row.name: row for row in frappe.get_all("Customer", filters={"name": ["in", list(names)]}, fields=fields)}


def _credit_limits(company, names) -> dict[str, float]:
	if not names:
		return {}
	rows = frappe.get_all(
		"Customer Credit Limit",
		filters={"parenttype": "Customer", "parent": ["in", list(names)], "company": company},
		fields=["parent", "credit_limit"],
	)
	return {row.parent: flt(row.credit_limit) for row in rows if flt(row.credit_limit) > 0}


def _receipts(company) -> tuple[dict[str, float], dict[str, str]]:
	"""Avances non imputées et date du dernier règlement, par client."""
	rows = frappe.db.sql(
		"""
		select party, sum(unallocated_amount) as unallocated, max(posting_date) as last_payment
		from `tabPayment Entry`
		where docstatus = 1 and party_type = 'Customer' and payment_type = 'Receive' and company = %(company)s
		group by party
		""",
		{"company": company},
		as_dict=True,
	)
	return (
		{row.party: flt(row.unallocated) for row in rows},
		{row.party: str(row.last_payment) for row in rows if row.last_payment},
	)


@frappe.whitelist()
def get_receivables(soon_days=None):
	"""Créances clients au jour : indicateurs globaux et balance âgée par client."""
	_require(MANAGER_ROLES)
	company = _default_company()
	today = getdate(nowdate())
	soon = cint(soon_days) or rc.DEFAULT_SOON_DAYS
	invoices = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 1, "company": company, "outstanding_amount": ["!=", 0]},
		fields=["name", "customer", "customer_name", "posting_date", "due_date", "outstanding_amount"],
	)
	by_customer = rc.aging_by_customer(invoices, today, soon)
	advances, last_payments = _receipts(company)
	# Une avance ne compte que pour un client qui doit encore quelque chose.
	rc.apply_advances(by_customer, {name: amount for name, amount in advances.items() if name in by_customer})
	names = list(by_customer)
	rows = rc.finalize(by_customer, _credit_limits(company, names))
	info = _customer_info(names)
	for row in rows:
		customer = info.get(row["customer"]) or {}
		row["customer_name"] = customer.get("customer_name") or row["customer_name"]
		row["customer_group"] = customer.get("customer_group")
		row["wilaya"] = customer.get("custom_wilaya")
		row["last_payment"] = last_payments.get(row["customer"])
	return {"as_of": str(today), "soon_days": soon, "totals": rc.totals(rows), "customers": rows}
