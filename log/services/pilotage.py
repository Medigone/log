# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Pilotage : calculs purs (sans accès base) des tableaux de bord trésorerie, livraison, stock,
clients et objectifs."""

from __future__ import annotations

import calendar
from datetime import date, timedelta
from statistics import median

from frappe.utils import flt, getdate

DELIVERED = "Livré"
PARTIAL = "Partiellement Livré"
FAILED = "Non Livré"
OUTCOMES = (DELIVERED, PARTIAL, FAILED)


def ratio(numerator, denominator) -> float | None:
	"""Ratio 0-1 arrondi, ou None sans dénominateur (affiché « — »)."""
	return round(flt(numerator) / flt(denominator), 4) if flt(denominator) else None


def money(value) -> float:
	return round(flt(value), 2)


# --- Trésorerie ------------------------------------------------------------------


def daily_series(rows, from_date, to_date, *, date_key="date", value_key="amount") -> list[dict]:
	"""Série quotidienne complète (jours sans mouvement à 0) pour les graphiques."""
	start, end = getdate(from_date), getdate(to_date)
	totals: dict[date, float] = {}
	for row in rows:
		day = getdate(row.get(date_key))
		if start <= day <= end:
			totals[day] = totals.get(day, 0.0) + flt(row.get(value_key))
	series, day = [], start
	while day <= end:
		series.append({"date": str(day), "amount": money(totals.get(day, 0))})
		day += timedelta(days=1)
	return series


def forecast_weeks(invoices, schedules, today, weeks: int = 4) -> list[dict]:
	"""Encaissements attendus : échu à date, puis semaine par semaine (factures et échéances de commandes)."""
	today = getdate(today)
	buckets = [
		{
			"label": "Échu",
			"from_date": None,
			"to_date": str(today - timedelta(days=1)),
			"invoices": 0.0,
			"orders": 0.0,
		}
	]
	for index in range(weeks):
		start = today + timedelta(days=7 * index)
		buckets.append(
			{
				"label": f"S+{index + 1}",
				"from_date": str(start),
				"to_date": str(start + timedelta(days=6)),
				"invoices": 0.0,
				"orders": 0.0,
			}
		)
	horizon = today + timedelta(days=7 * weeks)

	def place(due, amount, key):
		due = getdate(due) if due else today
		if due >= horizon or flt(amount) <= 0:
			return
		index = 0 if due < today else 1 + (due - today).days // 7
		buckets[index][key] += flt(amount)

	for row in invoices:
		place(row.get("due_date"), row.get("outstanding_amount"), "invoices")
	for row in schedules:
		place(row.get("due_date"), row.get("amount"), "orders")
	for bucket in buckets:
		bucket["invoices"] = money(bucket["invoices"])
		bucket["orders"] = money(bucket["orders"])
		bucket["total"] = money(bucket["invoices"] + bucket["orders"])
	return buckets


# --- Livraison -------------------------------------------------------------------


def delivery_outcomes(rows) -> dict:
	"""Issues des BL clôturés : livrés, partiels, échecs et livrés du premier coup."""
	counts = {DELIVERED: 0, PARTIAL: 0, FAILED: 0}
	first_attempt = 0
	reasons: dict[str, int] = {}
	for row in rows:
		status = row.get("status")
		if status not in counts:
			continue
		counts[status] += 1
		if status == DELIVERED and int(row.get("attempts") or 1) <= 1:
			first_attempt += 1
		if status in (PARTIAL, FAILED):
			for reason in row.get("reasons") or ["Non renseigné"]:
				reasons[reason] = reasons.get(reason, 0) + 1
	closed = sum(counts.values())
	return {
		"closed": closed,
		"delivered": counts[DELIVERED],
		"partial": counts[PARTIAL],
		"failed": counts[FAILED],
		"success_rate": ratio(counts[DELIVERED], closed),
		"first_attempt_rate": ratio(first_attempt, closed),
		"reasons": sorted(
			({"reason": key, "count": value} for key, value in reasons.items()), key=lambda row: -row["count"]
		),
	}


def attempt_numbers(visits) -> dict[str, int]:
	"""Rang de passage de chaque BL dans sa commande : un BL refait après un échec est une 2e tentative.

	`visits` : BL effectivement présentés au client (`order`, `name`, `date`), toutes périodes confondues.
	"""
	by_order: dict[str, list] = {}
	for row in visits:
		if row.get("order"):
			by_order.setdefault(row["order"], []).append(row)
	numbers: dict[str, int] = {}
	for rows in by_order.values():
		rows.sort(key=lambda row: (getdate(row.get("date")) if row.get("date") else date.max, row.get("name") or ""))
		for index, row in enumerate(rows, start=1):
			numbers[row["name"]] = max(numbers.get(row["name"], 0), index)
	return numbers


def duration_stats(values) -> dict:
	"""Délais en jours : moyenne, médiane, 9e décile."""
	values = sorted(flt(value) for value in values if value is not None and flt(value) >= 0)
	if not values:
		return {"count": 0, "average": None, "median": None, "p90": None}
	p90 = values[min(len(values) - 1, round(0.9 * (len(values) - 1)))]
	return {
		"count": len(values),
		"average": round(sum(values) / len(values), 1),
		"median": round(median(values), 1),
		"p90": round(p90, 1),
	}


def group_outcomes(rows, key) -> list[dict]:
	"""Taux de réussite par commune, livreur… trié par nombre de BL."""
	groups: dict[str, list] = {}
	for row in rows:
		groups.setdefault(row.get(key) or "—", []).append(row)
	result = []
	for name, items in groups.items():
		outcome = delivery_outcomes(items)
		result.append(
			{
				"key": name,
				**{
					k: outcome[k]
					for k in (
						"closed",
						"delivered",
						"partial",
						"failed",
						"success_rate",
						"first_attempt_rate",
					)
				},
			}
		)
	return sorted(result, key=lambda row: -row["closed"])


# --- Stock -----------------------------------------------------------------------


def expiry_exposure(batches, today, *, limit: int = 20) -> dict:
	"""Valeur à risque par échéance de DLC, lot par lot, et liste par article (plus proche DLC d'abord).

	Chaque lot tombe dans sa propre tranche : un lot périmé ne masque pas les lots à 30/60/90 jours.
	"""
	today = getdate(today)
	buckets = {"expired": 0.0, "d30": 0.0, "d60": 0.0, "d90": 0.0}
	items: dict[str, dict] = {}
	for row in batches:
		expiry = getdate(row.get("expiry_date"))
		days = (expiry - today).days
		key = "expired" if days < 0 else "d30" if days <= 30 else "d60" if days <= 60 else "d90"
		value = flt(row.get("value"))
		buckets[key] += value
		item = items.setdefault(
			row.get("item"),
			{
				"item_code": row.get("item"),
				"item_name": row.get("item_name") or row.get("item"),
				"qty": 0.0,
				"value": 0.0,
				"next_expiry": str(expiry),
				"days": days,
			},
		)
		item["qty"] += flt(row.get("qty"))
		item["value"] += value
		if days < item["days"]:
			item["next_expiry"], item["days"] = str(expiry), days
	for item in items.values():
		item["value"] = money(item["value"])
	return {
		"buckets": {key: money(value) for key, value in buckets.items()},
		"items": sorted(items.values(), key=lambda row: row["days"])[:limit],
	}


# --- Clients ---------------------------------------------------------------------


def customers_at_risk(
	rows, today, *, min_orders: int = 3, factor: float = 2.0, min_days: int = 21
) -> list[dict]:
	"""Clients réguliers silencieux : sans commande depuis plus de `factor` fois leur rythme habituel.

	`rows` : par client, nombre de commandes, première et dernière commande, CA sur la période d'observation.
	"""
	today = getdate(today)
	result = []
	for row in rows:
		orders = int(row.get("orders") or 0)
		if orders < min_orders or not row.get("last_order"):
			continue
		first, last = getdate(row.get("first_order")), getdate(row.get("last_order"))
		rhythm = max((last - first).days / max(orders - 1, 1), 1)
		silence = (today - last).days
		threshold = max(rhythm * factor, min_days)
		if silence <= threshold:
			continue
		result.append(
			{
				**row,
				"first_order": str(first),
				"last_order": str(last),
				"rhythm_days": round(rhythm, 1),
				"days_silent": silence,
				"overdue_ratio": round(silence / rhythm, 1),
			}
		)
	return sorted(result, key=lambda row: -flt(row.get("revenue")))


def funnel(events) -> list[dict]:
	"""Entonnoir portail par campagne : vues → clics → ajouts au panier."""
	campaigns: dict[str, dict] = {}
	for row in events:
		name = row.get("campaign") or "—"
		entry = campaigns.setdefault(
			name,
			{"campaign": name, "title": row.get("title") or name, "views": 0, "clicks": 0, "add_to_cart": 0},
		)
		count = int(row.get("count") or 0)
		event = row.get("event_type")
		if event == "view_promotion":
			entry["views"] += count
		elif event == "select_promotion":
			entry["clicks"] += count
		elif event == "add_to_cart":
			entry["add_to_cart"] += count
	for entry in campaigns.values():
		entry["click_rate"] = ratio(entry["clicks"], entry["views"])
		entry["cart_rate"] = ratio(entry["add_to_cart"], entry["views"])
	return sorted(campaigns.values(), key=lambda row: -row["views"])


# --- Objectifs -------------------------------------------------------------------


def month_bounds(month) -> tuple[date, date]:
	day = getdate(month)
	first = day.replace(day=1)
	last = first.replace(day=calendar.monthrange(first.year, first.month)[1])
	return first, last


def objective_progress(actual, target, month, today) -> dict:
	"""Avancement d'un objectif mensuel, avec projection linéaire en fin de mois."""
	first, last = month_bounds(month)
	today = getdate(today)
	days = (last - first).days + 1
	if today < first:
		elapsed = 0
	elif today > last:
		elapsed = days
	else:
		elapsed = (today - first).days + 1
	projection = flt(actual) * days / elapsed if elapsed else None
	target = flt(target) or None
	return {
		"actual": money(actual),
		"target": money(target) if target else None,
		"progress": ratio(actual, target) if target else None,
		"projection": money(projection) if projection is not None else None,
		"projected_progress": ratio(projection, target) if target and projection is not None else None,
		"expected_progress": round(elapsed / days, 4),
	}
