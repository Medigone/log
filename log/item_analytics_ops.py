# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Aide à la décision (responsable) : rentabilité, rotation et stock par article et par client.

Ventes = lignes des BL validés (retours inclus, en négatif) : CA HT `base_net_amount`, coût `incoming_rate`.
Stock = Bin des entrepôts de la société (véhicules compris). Les calculs sont dans `log.services.item_analytics`.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import add_days, cint, cstr, flt, getdate, nowdate

from log.api.distribution import MANAGER_ROLES, _require
from log.catalog_ops import _price_by_item
from log.receipt_ops import _buying_price_list, _default_company, _selling_price_list
from log.services import item_analytics as ia
from log.utils.batches import expiry_threshold_days

DEFAULT_PERIOD_DAYS = 90


def _period(from_date, to_date) -> tuple[str, str]:
	end = getdate(to_date or nowdate())
	start = getdate(from_date) if from_date else end - timedelta(days=DEFAULT_PERIOD_DAYS - 1)
	if start > end:
		frappe.throw(_("La date de début doit précéder la date de fin."))
	if ia.period_days(start, end) > ia.MAX_PERIOD_DAYS:
		frappe.throw(_("La période d'analyse ne peut pas dépasser deux ans."))
	return str(start), str(end)


def _text(value) -> str | None:
	return cstr(value).strip() or None


# --- Lectures -----------------------------------------------------------------


SALES_COLUMNS = """
	sum(dni.stock_qty) as qty,
	sum(dni.base_net_amount) as revenue,
	sum(case when dni.incoming_rate > 0 then dni.incoming_rate * dni.stock_qty else 0 end) as known_cost,
	sum(case when dni.incoming_rate > 0 then 0 else dni.stock_qty end) as unknown_qty
"""


def _sales_rows(company, from_date, to_date, customer=None, item_code=None) -> list:
	"""Ventes nettes par (article, client) sur la période."""
	conditions, values = "", {"company": company, "from_date": from_date, "to_date": to_date}
	if customer:
		conditions += " and dn.customer = %(customer)s"
		values["customer"] = customer
	if item_code:
		conditions += " and dni.item_code = %(item_code)s"
		values["item_code"] = item_code
	return frappe.db.sql(
		f"""
		select dni.item_code, dn.customer, max(dn.customer_name) as customer_name, {SALES_COLUMNS},
			count(distinct case when dn.is_return = 0 then dn.name end) as deliveries
		from `tabDelivery Note Item` dni
		join `tabDelivery Note` dn on dn.name = dni.parent
		where dn.docstatus = 1 and dn.company = %(company)s
			and dn.posting_date between %(from_date)s and %(to_date)s {conditions}
		group by dni.item_code, dn.customer
		""",
		values,
		as_dict=True,
	)


def _last_sales(company) -> dict[str, str]:
	rows = frappe.db.sql(
		"""
		select dni.item_code, max(dn.posting_date) as last_sale
		from `tabDelivery Note Item` dni
		join `tabDelivery Note` dn on dn.name = dni.parent
		where dn.docstatus = 1 and dn.is_return = 0 and dn.company = %s
		group by dni.item_code
		""",
		company,
		as_dict=True,
	)
	return {row.item_code: row.last_sale for row in rows}


def _stock(company) -> dict[str, dict]:
	rows = frappe.db.sql(
		"""
		select b.item_code, sum(b.actual_qty) as qty, sum(b.stock_value) as value
		from `tabBin` b
		join `tabWarehouse` w on w.name = b.warehouse
		where w.company = %s
		group by b.item_code
		having sum(b.actual_qty) != 0 or sum(b.stock_value) != 0
		""",
		company,
		as_dict=True,
	)
	return {row.item_code: {"qty": flt(row.qty), "value": flt(row.value)} for row in rows}


def _expiring(limit_date) -> dict[str, dict]:
	"""Lots en stock dont la DLC tombe avant `limit_date` (périmés compris)."""
	rows = frappe.db.sql(
		"""
		select item, sum(batch_qty) as qty, min(expiry_date) as next_expiry
		from `tabBatch`
		where disabled = 0 and batch_qty > 0 and expiry_date is not null and expiry_date <= %s
		group by item
		""",
		limit_date,
		as_dict=True,
	)
	return {row.item: {"qty": flt(row.qty), "next_expiry": row.next_expiry} for row in rows}


def _group_names(item_group) -> set[str] | None:
	if not item_group:
		return None
	bounds = frappe.db.get_value("Item Group", item_group, ["lft", "rgt"], as_dict=True)
	if not bounds:
		frappe.throw(_("Groupe d'articles introuvable."))
	return set(
		frappe.get_all(
			"Item Group", filters={"lft": [">=", bounds.lft], "rgt": ["<=", bounds.rgt]}, pluck="name"
		)
	)


def _items(codes, item_group=None, brand=None) -> dict[str, dict]:
	if not codes:
		return {}
	filters = {"name": ["in", sorted(codes)]}
	groups = _group_names(item_group)
	if groups is not None:
		filters["item_group"] = ["in", sorted(groups)]
	if brand:
		filters["brand"] = brand
	rows = frappe.get_all(
		"Item",
		filters=filters,
		fields=["name", "item_name", "item_group", "brand", "stock_uom", "valuation_rate", "disabled"],
	)
	return {row.name: row for row in rows}


def _by_item(rows) -> dict[str, dict]:
	result: dict[str, dict] = defaultdict(lambda: defaultdict(float))
	for row in rows:
		entry = result[row.item_code]
		for field in ("qty", "revenue", "known_cost", "unknown_qty", "deliveries"):
			entry[field] += flt(row.get(field))
		if flt(row.qty) > 0:
			entry["customers"] += 1
	return result


def _filter_options(sales_rows) -> dict:
	customers = {}
	for row in sales_rows:
		if row.customer and flt(row.revenue) > 0:
			customers[row.customer] = row.customer_name or row.customer
	return {
		"item_groups": frappe.get_all("Item Group", pluck="name", order_by="lft asc"),
		"brands": frappe.get_all("Brand", pluck="name", order_by="name asc"),
		"customers": [
			{"value": key, "label": label} for key, label in sorted(customers.items(), key=lambda kv: kv[1])
		],
	}


def _analysis(from_date, to_date, item_group=None, brand=None, customer=None) -> dict:
	"""Contexte commun : métriques par article ; `all_sales` reste non filtré pour proposer tous les clients."""
	company = _default_company()
	from_date, to_date = _period(from_date, to_date)
	prev_from, prev_to = ia.previous_period(from_date, to_date)
	days = ia.period_days(from_date, to_date)
	today = nowdate()

	all_sales = _sales_rows(company, from_date, to_date)
	all_previous = _sales_rows(company, prev_from, prev_to)
	sales_rows = [row for row in all_sales if not customer or row.customer == customer]
	previous_rows = [row for row in all_previous if not customer or row.customer == customer]
	stock = _stock(company)
	expiry = _expiring(add_days(today, expiry_threshold_days()))

	codes = {row.item_code for row in sales_rows} | {row.item_code for row in previous_rows}
	if not customer:
		codes |= {code for code, entry in stock.items() if entry["qty"] > 0}
		codes |= set(expiry)
	items = _items(codes, item_group, brand)
	selling = _price_by_item(items, _selling_price_list())
	buying = _price_by_item(items, _buying_price_list())
	last_sales = _last_sales(company)
	sales, previous = _by_item(sales_rows), _by_item(previous_rows)

	rows = [
		ia.item_metrics(
			item,
			sales.get(code),
			stock.get(code),
			days=days,
			today=today,
			last_sale=last_sales.get(code),
			previous=previous.get(code),
			expiry=expiry.get(code),
			list_price=selling.get(code),
			buying_price=buying.get(code),
		)
		for code, item in items.items()
	]
	return {
		"company": company,
		"period": {"from_date": from_date, "to_date": to_date, "days": days},
		"previous_period": {"from_date": prev_from, "to_date": prev_to},
		"today": today,
		"items": rows,
		"item_index": items,
		"sales_rows": [row for row in sales_rows if row.item_code in items],
		"previous_rows": [row for row in previous_rows if row.item_code in items],
		"all_sales": all_sales,
	}


def _thresholds(dormant_days, low_cover_days, overstock_days) -> dict:
	return {
		"dormant_days": max(cint(dormant_days) or ia.DEFAULT_DORMANT_DAYS, 1),
		"low_cover_days": max(cint(low_cover_days) or ia.DEFAULT_LOW_COVER_DAYS, 1),
		"overstock_days": max(cint(overstock_days) or ia.DEFAULT_OVERSTOCK_DAYS, 1),
	}


# --- API ----------------------------------------------------------------------


@frappe.whitelist()
def get_item_analytics(
	from_date=None,
	to_date=None,
	item_group=None,
	brand=None,
	customer=None,
	dormant_days=None,
	low_cover_days=None,
	overstock_days=None,
):
	_require(MANAGER_ROLES)
	customer = _text(customer)
	thresholds = _thresholds(dormant_days, low_cover_days, overstock_days)
	data = _analysis(from_date, to_date, _text(item_group), _text(brand), customer)
	rows = data["items"]
	days = data["period"]["days"]
	matrix = ia.finalize_items(rows, days=days, stock_alerts=not customer, **thresholds)
	rows.sort(key=lambda row: (-flt(row["margin"]), -flt(row["stock_value"])))
	return {
		"period": data["period"],
		"previous_period": data["previous_period"],
		"customer": customer,
		"thresholds": {**thresholds, "expiry_days": expiry_threshold_days(), "matrix": matrix},
		"totals": ia.totals(rows, days=days),
		"opportunities": ia.profit_opportunities(rows),
		"quadrants": ia.quadrant_summary(rows),
		"items": rows,
		"filters": _filter_options(data["all_sales"]),
	}


def _cost_now(metrics_by_item, code) -> float:
	return flt((metrics_by_item.get(code) or {}).get("unit_cost"))


def _customer_lines(rows, metrics_by_item) -> dict[str, list[dict]]:
	result: dict[str, list[dict]] = defaultdict(list)
	for row in rows:
		cost, _estimated = ia.sales_cost(
			row.known_cost, row.unknown_qty, _cost_now(metrics_by_item, row.item_code)
		)
		result[row.customer].append(
			{
				"item_code": row.item_code,
				"item_name": (metrics_by_item.get(row.item_code) or {}).get("item_name") or row.item_code,
				"qty": flt(row.qty),
				"revenue": flt(row.revenue),
				"cost": cost,
				"margin": flt(row.revenue) - cost,
			}
		)
	return result


def _customer_activity(company, from_date, to_date, item_codes=None) -> dict[str, dict]:
	"""Nombre de BL de la période et dernier achat (toutes périodes) par client."""
	conditions, values = "", {"company": company, "from_date": from_date, "to_date": to_date}
	if item_codes is not None:
		if not item_codes:
			return {}
		conditions = " and exists (select 1 from `tabDelivery Note Item` dni where dni.parent = dn.name and dni.item_code in %(items)s)"
		values["items"] = tuple(sorted(item_codes))
	rows = frappe.db.sql(
		f"""
		select dn.customer,
			count(distinct case when dn.posting_date between %(from_date)s and %(to_date)s then dn.name end) as deliveries,
			max(dn.posting_date) as last_purchase
		from `tabDelivery Note` dn
		where dn.docstatus = 1 and dn.is_return = 0 and dn.company = %(company)s {conditions}
		group by dn.customer
		""",
		values,
		as_dict=True,
	)
	return {row.customer: row for row in rows}


@frappe.whitelist()
def get_customer_analytics(from_date=None, to_date=None, item_group=None, brand=None):
	_require(MANAGER_ROLES)
	item_group, brand = _text(item_group), _text(brand)
	data = _analysis(from_date, to_date, item_group, brand)
	metrics = {row["item_code"]: row for row in data["items"]}
	current = _customer_lines(data["sales_rows"], metrics)
	previous = _customer_lines(data["previous_rows"], metrics)
	filtered = item_group or brand
	activity = _customer_activity(
		data["company"],
		data["period"]["from_date"],
		data["period"]["to_date"],
		set(metrics) if filtered else None,
	)
	names = {row.customer: row.customer_name for row in data["sales_rows"]}
	rows = []
	for customer, lines in current.items():
		if not customer:
			continue
		prev_lines = previous.get(customer, [])
		info = activity.get(customer) or {}
		rows.append(
			ia.customer_metrics(
				{"name": customer, "customer_name": names.get(customer)},
				lines,
				today=data["today"],
				previous={
					"revenue": sum(line["revenue"] for line in prev_lines),
					"margin": sum(line["margin"] for line in prev_lines),
				},
				deliveries=info.get("deliveries"),
				last_purchase=info.get("last_purchase"),
			)
		)
	ia.finalize_customers(rows)
	rows.sort(key=lambda row: -flt(row["margin"]))
	revenue = sum(flt(row["revenue"]) for row in rows)
	margin = sum(flt(row["margin"]) for row in rows)
	return {
		"period": data["period"],
		"previous_period": data["previous_period"],
		"totals": {
			"customers": len(rows),
			"revenue": round(revenue, 2),
			"margin": round(margin, 2),
			"margin_rate": round(margin / revenue, 4) if revenue > 0 else None,
			"losing_customers": sum(1 for row in rows if flt(row["margin"]) < 0),
		},
		"customers": rows,
	}


@frappe.whitelist()
def get_item_analytics_detail(item_code, from_date=None, to_date=None):
	_require(MANAGER_ROLES)
	item_code = _text(item_code)
	if not item_code or not frappe.db.exists("Item", item_code):
		frappe.throw(_("Article introuvable."))
	company = _default_company()
	from_date, to_date = _period(from_date, to_date)
	item = frappe.db.get_value("Item", item_code, ["valuation_rate", "stock_uom"], as_dict=True)
	stock = _stock_by_warehouse(company, item_code)
	stock_qty = sum(row["qty"] for row in stock)
	stock_value = sum(row["value"] for row in stock)
	buying = _price_by_item([item_code], _buying_price_list()).get(item_code)
	cost_now = ia.unit_cost(stock_qty, stock_value, item.valuation_rate, buying)

	months = frappe.db.sql(
		f"""
		select date_format(dn.posting_date, '%%Y-%%m') as month, {SALES_COLUMNS}
		from `tabDelivery Note Item` dni
		join `tabDelivery Note` dn on dn.name = dni.parent
		where dn.docstatus = 1 and dn.company = %(company)s and dni.item_code = %(item_code)s
			and dn.posting_date between %(from_date)s and %(to_date)s
		group by month
		order by month
		""",
		{"company": company, "item_code": item_code, "from_date": from_date, "to_date": to_date},
		as_dict=True,
	)
	series = []
	for row in months:
		cost, _estimated = ia.sales_cost(row.known_cost, row.unknown_qty, cost_now)
		series.append(
			{
				"month": row.month,
				"qty": flt(row.qty, 3),
				"revenue": flt(row.revenue, 2),
				"margin": flt(flt(row.revenue) - cost, 2),
			}
		)

	customers = []
	for row in _sales_rows(company, from_date, to_date, item_code=item_code):
		cost, _estimated = ia.sales_cost(row.known_cost, row.unknown_qty, cost_now)
		margin = flt(row.revenue) - cost
		customers.append(
			{
				"customer": row.customer,
				"customer_name": row.customer_name or row.customer,
				"qty": flt(row.qty, 3),
				"revenue": flt(row.revenue, 2),
				"margin": flt(margin, 2),
				"margin_rate": round(margin / flt(row.revenue), 4) if flt(row.revenue) > 0 else None,
			}
		)
	customers.sort(key=lambda row: -row["revenue"])

	batches = frappe.get_all(
		"Batch",
		filters={"item": item_code, "batch_qty": [">", 0], "disabled": 0},
		fields=["name as batch_no", "batch_qty as qty", "expiry_date"],
		order_by="expiry_date asc",
		limit=20,
	)
	return {
		"item_code": item_code,
		"stock_uom": item.stock_uom,
		"unit_cost": round(cost_now, 2),
		"list_price": _price_by_item([item_code], _selling_price_list()).get(item_code),
		"buying_price": buying,
		"series": series,
		"customers": customers[:10],
		"customer_count": len(customers),
		"warehouses": stock,
		"batches": [
			{
				"batch_no": row.batch_no,
				"qty": flt(row.qty, 3),
				"expiry_date": str(row.expiry_date) if row.expiry_date else None,
			}
			for row in batches
		],
	}


def _stock_by_warehouse(company, item_code) -> list[dict]:
	rows = frappe.db.sql(
		"""
		select b.warehouse, b.actual_qty as qty, b.stock_value as value
		from `tabBin` b
		join `tabWarehouse` w on w.name = b.warehouse
		where w.company = %s and b.item_code = %s and (b.actual_qty != 0 or b.stock_value != 0)
		order by b.actual_qty desc
		""",
		(company, item_code),
		as_dict=True,
	)
	return [{"warehouse": row.warehouse, "qty": flt(row.qty, 3), "value": flt(row.value, 2)} for row in rows]

