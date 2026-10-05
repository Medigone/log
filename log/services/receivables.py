# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Créances clients : balance âgée et indicateurs, calculés sans accès base (testables)."""

from __future__ import annotations

from datetime import date

from frappe.utils import flt, getdate

# Tranches de retard (jours après l'échéance) ; « not_due » = pas encore échue.
BUCKETS = ("not_due", "d30", "d60", "d90", "d90_plus")
DEFAULT_SOON_DAYS = 7


def bucket_for(days_overdue: int) -> str:
	if days_overdue <= 0:
		return "not_due"
	if days_overdue <= 30:
		return "d30"
	if days_overdue <= 60:
		return "d60"
	if days_overdue <= 90:
		return "d90"
	return "d90_plus"


def _empty_customer(customer: str) -> dict:
	return {
		"customer": customer,
		"customer_name": customer,
		"invoices": 0,
		"gross": 0.0,
		"credits": 0.0,
		**{bucket: 0.0 for bucket in BUCKETS},
		"overdue": 0.0,
		"due_soon": 0.0,
		"oldest_due_date": None,
		"max_days_overdue": 0,
	}


def aging_by_customer(invoices, today: date, soon_days: int = DEFAULT_SOON_DAYS) -> dict[str, dict]:
	"""Ventile les restes à payer par client et par tranche de retard.

	Un reste négatif (avoir non imputé) diminue la créance nette sans entrer dans les tranches.
	"""
	result: dict[str, dict] = {}
	today = getdate(today)
	for row in invoices:
		amount = flt(row.get("outstanding_amount"))
		if not amount:
			continue
		customer = row.get("customer")
		entry = result.setdefault(customer, _empty_customer(customer))
		if row.get("customer_name"):
			entry["customer_name"] = row.get("customer_name")
		if amount < 0:
			entry["credits"] += -amount
			continue
		due = getdate(row.get("due_date") or row.get("posting_date") or today)
		days = (today - due).days
		entry["invoices"] += 1
		entry["gross"] += amount
		entry[bucket_for(days)] += amount
		if days > 0:
			entry["overdue"] += amount
			entry["max_days_overdue"] = max(entry["max_days_overdue"], days)
		elif -days <= soon_days:
			entry["due_soon"] += amount
		if entry["oldest_due_date"] is None or due < entry["oldest_due_date"]:
			entry["oldest_due_date"] = due
	return result


def apply_advances(customers: dict[str, dict], advances: dict[str, float]) -> None:
	"""Règlements non imputés (avances) : déduits de la créance nette comme les avoirs."""
	for customer, amount in advances.items():
		if flt(amount) <= 0:
			continue
		entry = customers.setdefault(customer, _empty_customer(customer))
		entry["credits"] += flt(amount)


def finalize(customers: dict[str, dict], limits: dict[str, float]) -> list[dict]:
	rows = []
	for entry in customers.values():
		net = round(entry["gross"] - entry["credits"], 2)
		limit = flt(limits.get(entry["customer"])) or None
		rows.append(
			{
				**{key: round(value, 2) if isinstance(value, float) else value for key, value in entry.items()},
				"net": net,
				"credit_limit": limit,
				"over_limit": bool(limit and net > limit),
				"oldest_due_date": str(entry["oldest_due_date"]) if entry["oldest_due_date"] else None,
			}
		)
	# Les plus urgents d'abord : retard, puis montant échu, puis créance.
	rows.sort(key=lambda row: (-row["overdue"], -row["max_days_overdue"], -row["gross"]))
	return rows


def totals(rows: list[dict]) -> dict:
	gross = sum(row["gross"] for row in rows)
	overdue = sum(row["overdue"] for row in rows)
	return {
		"gross": round(gross, 2),
		"credits": round(sum(row["credits"] for row in rows), 2),
		"net": round(sum(row["net"] for row in rows), 2),
		"overdue": round(overdue, 2),
		"overdue_share": round(overdue / gross, 4) if gross else None,  # ratio, comme les autres taux
		"due_soon": round(sum(row["due_soon"] for row in rows), 2),
		"d90_plus": round(sum(row["d90_plus"] for row in rows), 2),
		"buckets": {bucket: round(sum(row[bucket] for row in rows), 2) for bucket in BUCKETS},
		"customers": sum(1 for row in rows if row["gross"] > 0),
		"overdue_customers": sum(1 for row in rows if row["overdue"] > 0),
		"due_soon_customers": sum(1 for row in rows if row["due_soon"] > 0),
		"d90_customers": sum(1 for row in rows if row["d90_plus"] > 0),
		"over_limit_customers": sum(1 for row in rows if row["over_limit"]),
		"invoices": sum(row["invoices"] for row in rows),
	}
