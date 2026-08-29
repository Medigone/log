# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt


def execute(filters=None):
	filters = filters or {}
	columns = get_columns()
	data = get_data(filters)
	chart = {
		"data": {
			"labels": [row["title"] for row in data[:12]],
			"datasets": [{"name": _("Chiffre d'affaires attribué"), "values": [flt(row["revenue"]) for row in data[:12]]}],
		},
		"type": "bar",
	}
	return columns, data, None, chart


def get_columns():
	return [
		{"label": _("Campagne"), "fieldname": "campaign", "fieldtype": "Link", "options": "Campagne Portail", "width": 160},
		{"label": _("Titre"), "fieldname": "title", "fieldtype": "Data", "width": 200},
		{"label": _("Emplacement"), "fieldname": "placement", "fieldtype": "Data", "width": 120},
		{"label": _("Impressions"), "fieldname": "impressions", "fieldtype": "Int", "width": 110},
		{"label": _("Clics"), "fieldname": "clicks", "fieldtype": "Int", "width": 80},
		{"label": _("CTR"), "fieldname": "ctr", "fieldtype": "Percent", "width": 80},
		{"label": _("Ajouts panier"), "fieldname": "add_to_cart", "fieldtype": "Int", "width": 120},
		{"label": _("Commandes"), "fieldname": "orders", "fieldtype": "Int", "width": 100},
		{"label": _("CA attribué"), "fieldname": "revenue", "fieldtype": "Currency", "width": 130},
		{"label": _("Remise accordée"), "fieldname": "discount", "fieldtype": "Currency", "width": 140},
		{"label": _("Conversion"), "fieldname": "conversion", "fieldtype": "Percent", "width": 110},
	]


def get_data(filters):
	campaign_filters = {}
	if filters.get("campaign"):
		campaign_filters["name"] = filters["campaign"]
	if filters.get("placement"):
		campaign_filters["placement"] = filters["placement"]
	campaigns = frappe.get_all(
		"Campagne Portail",
		filters=campaign_filters,
		fields=["name", "title", "placement"],
		order_by="title asc",
	)
	if not campaigns:
		return []

	event_filters = {"campaign": ["in", [row.name for row in campaigns]]}
	if filters.get("from_date") and filters.get("to_date"):
		event_filters["creation"] = ["between", [filters["from_date"], f"{filters['to_date']} 23:59:59"]]
	elif filters.get("from_date"):
		event_filters["creation"] = [">=", filters["from_date"]]
	elif filters.get("to_date"):
		event_filters["creation"] = ["<=", f"{filters['to_date']} 23:59:59"]
	events = frappe.get_all(
		"Evenement Promotion Portail",
		filters=event_filters,
		fields=["campaign", "event_type"],
	)
	counts = {}
	for event in events:
		bucket = counts.setdefault(event.campaign, {"view_promotion": 0, "select_promotion": 0, "add_to_cart": 0})
		if event.event_type in bucket:
			bucket[event.event_type] += 1

	order_map = _order_metrics(filters, [row.name for row in campaigns])
	rows = []
	for campaign in campaigns:
		bucket = counts.get(campaign.name, {"view_promotion": 0, "select_promotion": 0, "add_to_cart": 0})
		metrics = order_map.get(campaign.name, {"orders": 0, "revenue": 0, "discount": 0})
		impressions = bucket["view_promotion"]
		clicks = bucket["select_promotion"]
		rows.append(
			{
				"campaign": campaign.name,
				"title": campaign.title,
				"placement": campaign.placement,
				"impressions": impressions,
				"clicks": clicks,
				"ctr": (clicks / impressions * 100) if impressions else 0,
				"add_to_cart": bucket["add_to_cart"],
				"orders": metrics["orders"],
				"revenue": metrics["revenue"],
				"discount": metrics["discount"],
				"conversion": (metrics["orders"] / impressions * 100) if impressions else 0,
			}
		)
	return rows


def _order_metrics(filters, campaign_names: list[str]) -> dict[str, dict[str, float]]:
	if not frappe.db.has_column("Sales Order", "custom_campagne_portail"):
		return {}
	conditions = ["so.custom_campagne_portail in %(campaigns)s", "so.docstatus < 2"]
	values = {"campaigns": campaign_names}
	if filters.get("from_date"):
		conditions.append("so.transaction_date >= %(from_date)s")
		values["from_date"] = filters["from_date"]
	if filters.get("to_date"):
		conditions.append("so.transaction_date <= %(to_date)s")
		values["to_date"] = filters["to_date"]
	rows = frappe.db.sql(
		f"""
		SELECT so.custom_campagne_portail AS campaign,
			COUNT(*) AS orders,
			SUM(IFNULL(so.rounded_total, so.grand_total)) AS revenue,
			SUM(IFNULL(so.discount_amount, 0)) AS discount
		FROM `tabSales Order` so
		WHERE {" AND ".join(conditions)}
		GROUP BY so.custom_campagne_portail
		""",
		values,
		as_dict=True,
	)
	return {
		row.campaign: {"orders": flt(row.orders), "revenue": flt(row.revenue), "discount": flt(row.discount)}
		for row in rows
	}
