# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Aide à la décision articles : calculs purs (marge, rotation, couverture, ABC, matrice, alertes).

Aucun accès base ici : `log.item_analytics_ops` lit les BL, le stock et les lots puis appelle ces fonctions.
"""

from __future__ import annotations

from datetime import timedelta
from statistics import median

from frappe.utils import date_diff, flt, getdate

DEFAULT_DORMANT_DAYS = 90
DEFAULT_LOW_COVER_DAYS = 7
DEFAULT_OVERSTOCK_DAYS = 120
DISCOUNT_ALERT_RATE = 0.10
MAX_PERIOD_DAYS = 731
ABC_LIMITS = (("A", 0.80), ("B", 0.95))
QUADRANTS = ("star", "locomotive", "pepite", "poids_mort")
ALERT_TONES = {
	"negative_margin": "danger",
	"price_below_cost": "danger",
	"dormant": "danger",
	"expiry": "danger",
	"low_cover": "warning",
	"overstock": "warning",
	"discount": "info",
	"estimated_cost": "neutral",
}


def period_days(from_date, to_date) -> int:
	return date_diff(getdate(to_date), getdate(from_date)) + 1


def previous_period(from_date, to_date) -> tuple[str, str]:
	"""Période de même durée qui se termine la veille de `from_date`."""
	start = getdate(from_date)
	days = period_days(from_date, to_date)
	prev_to = start - timedelta(days=1)
	prev_from = prev_to - timedelta(days=days - 1)
	return str(prev_from), str(prev_to)


def _ratio(numerator, denominator):
	return flt(numerator) / flt(denominator) if flt(denominator) else None


def _delta(current, previous):
	return (flt(current) - flt(previous)) / abs(flt(previous)) if flt(previous) else None


def _round(value, precision=2):
	return None if value is None else round(flt(value), precision)


def unit_cost(stock_qty=0, stock_value=0, valuation_rate=0, buying_price=0) -> float:
	"""Coût unitaire actuel : valorisation du stock, sinon valorisation article, sinon prix d'achat tarif."""
	if flt(stock_qty) > 0 and flt(stock_value) > 0:
		return flt(stock_value) / flt(stock_qty)
	return flt(valuation_rate) or flt(buying_price)


def sales_cost(known_cost, unknown_qty, fallback_rate) -> tuple[float, bool]:
	"""Coût des ventes : `incoming_rate` des BL, complété au coût actuel pour les lignes sans valorisation."""
	if not flt(unknown_qty):
		return flt(known_cost), False
	return flt(known_cost) + flt(unknown_qty) * flt(fallback_rate), True


def abc_classes(values: dict[str, float]) -> dict[str, str]:
	"""Classe ABC par contribution cumulée : A jusqu'à 80 %, B jusqu'à 95 %, C ensuite (et tout ≤ 0)."""
	positive = sorted(
		((key, flt(value)) for key, value in values.items() if flt(value) > 0), key=lambda kv: -kv[1]
	)
	total = sum(value for _key, value in positive)
	result = {key: "C" for key in values}
	cumulative = 0.0
	for key, value in positive:
		share_before = cumulative / total
		result[key] = next((label for label, limit in ABC_LIMITS if share_before < limit), "C")
		cumulative += value
	return result


def matrix_thresholds(items: list[dict]) -> dict:
	"""Médianes des articles vendus : taux de marque et couverture (jours) séparent les quadrants."""
	sold = [row for row in items if flt(row.get("qty")) > 0 and flt(row.get("revenue")) > 0]
	rates = [row["margin_rate"] for row in sold if row.get("margin_rate") is not None]
	covers = [row["cover_days"] for row in sold if row.get("cover_days") is not None]
	return {
		"margin_rate": _round(median(rates), 4) if rates else None,
		"cover_days": _round(median(covers), 1) if covers else None,
	}


def quadrant(row: dict, thresholds: dict) -> str | None:
	"""Marge forte = taux de marque ≥ médiane ; rotation forte = couverture ≤ médiane (0 = vendu jusqu'à rupture)."""
	if flt(row.get("qty")) <= 0 or flt(row.get("revenue")) <= 0:
		return None
	rate_limit, cover_limit = thresholds.get("margin_rate"), thresholds.get("cover_days")
	if rate_limit is None or cover_limit is None:
		return None
	high_margin = flt(row.get("margin_rate")) >= rate_limit
	cover = row.get("cover_days")
	fast = cover is not None and cover <= cover_limit
	if high_margin:
		return "star" if fast else "pepite"
	return "locomotive" if fast else "poids_mort"


def item_metrics(
	item: dict,
	sales: dict | None,
	stock: dict | None,
	*,
	days: int,
	today,
	last_sale=None,
	previous: dict | None = None,
	expiry: dict | None = None,
	list_price=None,
	buying_price=None,
) -> dict:
	"""Indicateurs d'un article sur la période (ventes nettes des retours, coût réel des BL)."""
	sales, stock, previous, expiry = sales or {}, stock or {}, previous or {}, expiry or {}
	stock_qty, stock_value = flt(stock.get("qty")), flt(stock.get("value"))
	cost_now = unit_cost(stock_qty, stock_value, item.get("valuation_rate"), buying_price)
	qty, revenue = flt(sales.get("qty")), flt(sales.get("revenue"))
	cost, estimated = sales_cost(sales.get("known_cost"), sales.get("unknown_qty"), cost_now)
	prev_cost, _ = sales_cost(previous.get("known_cost"), previous.get("unknown_qty"), cost_now)
	margin = revenue - cost
	prev_margin = flt(previous.get("revenue")) - prev_cost
	annual = 365 / max(days, 1)
	daily_qty = qty / max(days, 1)
	avg_price = _ratio(revenue, qty) if qty > 0 else None
	list_price = flt(list_price) or None
	discount = 1 - avg_price / list_price if avg_price and list_price else None
	discount_loss = max(list_price * qty - revenue, 0) if list_price and qty > 0 else 0
	last_sale = str(getdate(last_sale)) if last_sale else None
	return {
		"item_code": item.get("name"),
		"item_name": item.get("item_name") or item.get("name"),
		"item_group": item.get("item_group"),
		"brand": item.get("brand"),
		"stock_uom": item.get("stock_uom"),
		"disabled": bool(item.get("disabled")),
		"qty": _round(qty, 3),
		"revenue": _round(revenue),
		"cost": _round(cost),
		"margin": _round(margin),
		"margin_rate": _round(_ratio(margin, revenue), 4) if revenue > 0 else None,
		"markup": _round(_ratio(margin, cost), 4) if cost > 0 else None,
		"cost_estimated": estimated,
		"customers": int(flt(sales.get("customers"))),
		"deliveries": int(flt(sales.get("deliveries"))),
		"avg_price": _round(avg_price),
		"list_price": _round(list_price),
		"buying_price": _round(flt(buying_price) or None),
		"unit_cost": _round(cost_now),
		"discount": _round(discount, 4),
		"discount_loss": _round(discount_loss),
		"stock_qty": _round(stock_qty, 3),
		"stock_value": _round(stock_value),
		"cover_days": _round(stock_qty / daily_qty, 1) if daily_qty > 0 else None,
		"rotation": _round(cost * annual / stock_value, 2) if stock_value > 0 else None,
		"gmroi": _round(margin * annual / stock_value, 2) if stock_value > 0 else None,
		"last_sale": last_sale,
		"days_since_last_sale": date_diff(getdate(today), getdate(last_sale)) if last_sale else None,
		"expiring_qty": _round(flt(expiry.get("qty")), 3),
		"expiring_value": _round(flt(expiry.get("qty")) * cost_now),
		"next_expiry": str(getdate(expiry["next_expiry"])) if expiry.get("next_expiry") else None,
		"prev_revenue": _round(flt(previous.get("revenue"))),
		"prev_margin": _round(prev_margin),
		"revenue_delta": _round(_delta(revenue, previous.get("revenue")), 4),
		"margin_delta": _round(_delta(margin, prev_margin), 4),
	}


def item_alerts(
	row: dict,
	*,
	days: int,
	dormant_days=DEFAULT_DORMANT_DAYS,
	low_cover_days=DEFAULT_LOW_COVER_DAYS,
	overstock_days=DEFAULT_OVERSTOCK_DAYS,
	stock_alerts=True,
) -> list[dict]:
	"""Alertes chiffrées : `impact` en DA (perte, argent immobilisé ou marge en jeu), `value` = mesure affichée."""
	alerts = []
	qty, margin = flt(row.get("qty")), flt(row.get("margin"))
	stock_qty, stock_value = flt(row.get("stock_qty")), flt(row.get("stock_value"))
	cover = row.get("cover_days")
	monthly_margin = margin / max(days, 1) * 30

	def add(code, impact, value=None):
		alerts.append(
			{"code": code, "tone": ALERT_TONES[code], "impact": _round(max(flt(impact), 0)), "value": value}
		)

	if qty > 0 and margin < 0:
		add("negative_margin", -margin, row.get("margin_rate"))
	list_price, unit = flt(row.get("list_price")), flt(row.get("unit_cost"))
	if list_price and unit and list_price < unit:
		add(
			"price_below_cost",
			(unit - list_price) * qty / max(days, 1) * 30,
			_round(list_price / unit - 1, 4),
		)
	if row.get("discount") is not None and row["discount"] >= DISCOUNT_ALERT_RATE:
		add("discount", row.get("discount_loss"), row["discount"])
	if stock_alerts:
		last = row.get("days_since_last_sale")
		if stock_qty > 0 and (last is None or last >= dormant_days):
			add("dormant", stock_value, last)
		elif cover is not None and qty > 0 and cover < low_cover_days:
			add("low_cover", monthly_margin, cover)
		elif cover is not None and cover > overstock_days and stock_value > 0:
			add("overstock", stock_value * (1 - overstock_days / cover), cover)
		if flt(row.get("expiring_value")) > 0:
			add("expiry", row.get("expiring_value"), row.get("next_expiry"))
	if row.get("cost_estimated"):
		add("estimated_cost", 0)
	return alerts


def finalize_items(rows: list[dict], *, days: int, stock_alerts=True, **thresholds) -> dict:
	"""Ajoute part de marge, ABC, quadrant et alertes ; renvoie aussi les seuils de la matrice."""
	total_margin = sum(flt(row.get("margin")) for row in rows if flt(row.get("margin")) > 0)
	classes = abc_classes(
		{row["item_code"]: flt(row.get("margin")) for row in rows if flt(row.get("qty")) > 0}
	)
	matrix = matrix_thresholds(rows)
	for row in rows:
		row["margin_share"] = (
			_round(_ratio(row.get("margin"), total_margin), 4) if flt(row.get("margin")) > 0 else None
		)
		row["abc"] = classes.get(row["item_code"])
		row["quadrant"] = quadrant(row, matrix)
		row["alerts"] = item_alerts(row, days=days, stock_alerts=stock_alerts, **thresholds)
		row["impact"] = _round(sum(flt(alert["impact"]) for alert in row["alerts"]))
	return matrix


def totals(rows: list[dict], *, days: int) -> dict:
	revenue = sum(flt(row.get("revenue")) for row in rows)
	cost = sum(flt(row.get("cost")) for row in rows)
	margin = revenue - cost
	stock_value = sum(flt(row.get("stock_value")) for row in rows)
	prev_revenue = sum(flt(row.get("prev_revenue")) for row in rows)
	prev_margin = sum(flt(row.get("prev_margin")) for row in rows)
	annual = 365 / max(days, 1)
	return {
		"revenue": _round(revenue),
		"cost": _round(cost),
		"margin": _round(margin),
		"margin_rate": _round(_ratio(margin, revenue), 4) if revenue > 0 else None,
		"markup": _round(_ratio(margin, cost), 4) if cost > 0 else None,
		"stock_value": _round(stock_value),
		"rotation": _round(cost * annual / stock_value, 2) if stock_value > 0 else None,
		"gmroi": _round(margin * annual / stock_value, 2) if stock_value > 0 else None,
		"prev_revenue": _round(prev_revenue),
		"prev_margin": _round(prev_margin),
		"revenue_delta": _round(_delta(revenue, prev_revenue), 4),
		"margin_delta": _round(_delta(margin, prev_margin), 4),
		"items_sold": sum(1 for row in rows if flt(row.get("qty")) > 0),
		"items_in_stock": sum(1 for row in rows if flt(row.get("stock_qty")) > 0),
		"items_with_alerts": sum(
			1 for row in rows if any(a["code"] != "estimated_cost" for a in row.get("alerts", []))
		),
	}


def profit_opportunities(rows: list[dict]) -> dict:
	"""Gisements de profit : somme des impacts par type d'alerte, et nombre d'articles concernés."""
	result = {code: {"amount": 0.0, "count": 0} for code in ALERT_TONES if code != "estimated_cost"}
	for row in rows:
		for alert in row.get("alerts", []):
			if alert["code"] in result:
				result[alert["code"]]["amount"] += flt(alert["impact"])
				result[alert["code"]]["count"] += 1
	return {
		code: {"amount": _round(entry["amount"]), "count": entry["count"]} for code, entry in result.items()
	}


def quadrant_summary(rows: list[dict]) -> dict:
	result = {key: {"count": 0, "revenue": 0.0, "margin": 0.0, "stock_value": 0.0} for key in QUADRANTS}
	for row in rows:
		entry = result.get(row.get("quadrant"))
		if entry is None:
			continue
		entry["count"] += 1
		for field in ("revenue", "margin", "stock_value"):
			entry[field] += flt(row.get(field))
	return {
		key: {**entry, **{f: _round(entry[f]) for f in ("revenue", "margin", "stock_value")}}
		for key, entry in result.items()
	}


def customer_metrics(
	customer: dict,
	lines: list[dict],
	*,
	today,
	previous: dict | None = None,
	deliveries=0,
	last_purchase=None,
	top=5,
) -> dict:
	"""Indicateurs d'un client à partir de ses lignes article (déjà coûtées par `item_metrics`)."""
	previous = previous or {}
	revenue = sum(flt(line.get("revenue")) for line in lines)
	cost = sum(flt(line.get("cost")) for line in lines)
	margin = revenue - cost
	ranked = sorted(lines, key=lambda line: -flt(line.get("margin")))
	last_purchase = str(getdate(last_purchase)) if last_purchase else None
	return {
		"customer": customer.get("name"),
		"customer_name": customer.get("customer_name") or customer.get("name"),
		"revenue": _round(revenue),
		"cost": _round(cost),
		"margin": _round(margin),
		"margin_rate": _round(_ratio(margin, revenue), 4) if revenue > 0 else None,
		"items": sum(1 for line in lines if flt(line.get("qty")) > 0),
		"deliveries": int(flt(deliveries)),
		"avg_basket": _round(_ratio(revenue, deliveries)) if flt(deliveries) else None,
		"last_purchase": last_purchase,
		"days_since_last_purchase": date_diff(getdate(today), getdate(last_purchase))
		if last_purchase
		else None,
		"prev_revenue": _round(flt(previous.get("revenue"))),
		"prev_margin": _round(flt(previous.get("margin"))),
		"revenue_delta": _round(_delta(revenue, previous.get("revenue")), 4),
		"margin_delta": _round(_delta(margin, previous.get("margin")), 4),
		"top_items": [
			{
				"item_code": line.get("item_code"),
				"item_name": line.get("item_name"),
				"revenue": _round(line.get("revenue")),
				"margin": _round(line.get("margin")),
			}
			for line in ranked[:top]
		],
	}


def finalize_customers(rows: list[dict]) -> None:
	total_margin = sum(flt(row.get("margin")) for row in rows if flt(row.get("margin")) > 0)
	classes = abc_classes({row["customer"]: flt(row.get("margin")) for row in rows})
	for row in rows:
		row["margin_share"] = (
			_round(_ratio(row.get("margin"), total_margin), 4) if flt(row.get("margin")) > 0 else None
		)
		row["abc"] = classes.get(row["customer"])
