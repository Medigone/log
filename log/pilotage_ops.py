# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Pilotage : trésorerie, performance livraison, préparation & stock, clients & commercial, objectifs.

Réservé au responsable. Les calculs sans accès base sont dans `log.services.pilotage`.
"""

from __future__ import annotations

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import add_days, add_months, cint, cstr, flt, getdate, nowdate

from log.api.distribution import MANAGER_ROLES, _payload, _require
from log.receipt_ops import _default_company
from log.services import pilotage as pl

DEFAULT_DAYS = 30
EXPIRY_HORIZON_DAYS = 90
RISK_LOOKBACK_DAYS = 365


def _period(from_date=None, to_date=None) -> tuple[str, str]:
	to_value = getdate(to_date or nowdate())
	from_value = getdate(from_date or add_days(to_value, -(DEFAULT_DAYS - 1)))
	if from_value > to_value:
		frappe.throw(_("La date de début doit précéder la date de fin."))
	return str(from_value), str(to_value)


def _names(doctype, names, field="name", label_field="nom") -> dict[str, str]:
	names = [name for name in set(names) if name]
	if not names:
		return {}
	return {
		row[field]: row[label_field] or row[field]
		for row in frappe.get_all(doctype, filters={field: ["in", names]}, fields=[field, label_field])
	}


def _user_names(users) -> dict[str, str]:
	return _names("User", users, label_field="full_name")


# --- Trésorerie & encaissements -------------------------------------------------------


def _open_order_schedules(company) -> list[dict]:
	"""Échéances des commandes validées non encore facturées (part restante)."""
	return frappe.db.sql(
		"""
		select ps.due_date, ps.payment_amount * (1 - ifnull(so.per_billed, 0) / 100) as amount
		from `tabPayment Schedule` ps
		join `tabSales Order` so on so.name = ps.parent and ps.parenttype = 'Sales Order'
		where so.docstatus = 1 and so.company = %s and ifnull(so.per_billed, 0) < 100
			and so.status not in ('Closed', 'Completed', 'On Hold')
		""",
		company,
		as_dict=True,
	)


@frappe.whitelist()
def get_cash_overview(from_date=None, to_date=None):
	_require(MANAGER_ROLES)
	company = _default_company()
	from_date, to_date = _period(from_date, to_date)
	today = nowdate()

	payments = frappe.get_all(
		"Paiement Client",
		filters={"date": ["between", [from_date, to_date]], "statut_controle": ["!=", "Annulé"]},
		fields=[
			"name",
			"date",
			"client",
			"nom_client",
			"moyen_paiement",
			"montant",
			"montant_compte",
			"statut_controle",
			"livraison",
			"id_beneficiaire",
		],
	)
	tours = frappe.get_all(
		"Livraison",
		filters={"date_liv": ["between", [from_date, to_date]], "etat_planification": ["!=", "Annulée"]},
		fields=[
			"name",
			"livreur",
			"nom_livreur",
			"total_montant_a_encaisser",
			"total_paiements",
			"solde_restant",
			"statut_caisse",
		],
	)
	tour_driver = {row.name: row.livreur for row in tours}
	missing_tours = {row.livraison for row in payments if row.livraison and row.livraison not in tour_driver}
	if missing_tours:
		tour_driver.update(
			dict(
				frappe.get_all(
					"Livraison",
					filters={"name": ["in", list(missing_tours)]},
					fields=["name", "livreur"],
					as_list=True,
				)
			)
		)
	user_driver = dict(frappe.get_all("Livreur", fields=["id_utilisateur", "name"], as_list=True))

	by_method: dict[str, float] = defaultdict(float)
	by_driver: dict[str, dict] = {}
	to_control = gaps = gap_count = 0.0
	for row in payments:
		amount = flt(row.montant)
		by_method[row.moyen_paiement or "Autre"] += amount
		driver = tour_driver.get(row.livraison) or user_driver.get(row.id_beneficiaire)
		entry = by_driver.setdefault(
			driver or "—", {"driver": driver, "collected": 0.0, "gap": 0.0, "payments": 0}
		)
		entry["collected"] += amount
		entry["payments"] += 1
		if row.statut_controle in ("Déclaré", "À contrôler"):
			to_control += amount
		elif row.statut_controle == "Écart":
			gap = amount - flt(row.montant_compte)
			gaps += gap
			gap_count += 1
			entry["gap"] += gap

	expected = sum(flt(row.total_montant_a_encaisser) for row in tours)
	tour_paid = sum(flt(row.total_paiements) for row in tours)
	driver_names = _names("Livreur", [entry["driver"] for entry in by_driver.values()])
	drivers = sorted(
		(
			{
				**entry,
				"driver_name": driver_names.get(entry["driver"]) or "Sans livreur",
				"collected": pl.money(entry["collected"]),
				"gap": pl.money(entry["gap"]),
			}
			for entry in by_driver.values()
		),
		key=lambda row: -row["collected"],
	)

	cash_boxes = frappe.get_all(
		"Caisse Livreur",
		filters={"solde": ["!=", 0]},
		fields=["livreur", "nom_livreur", "solde", "date_derniere_maj"],
		order_by="solde desc",
	)
	invoices = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 1, "company": company, "outstanding_amount": [">", 0]},
		fields=["due_date", "outstanding_amount"],
	)
	collected = sum(flt(row.montant) for row in payments)
	return {
		"period": {"from_date": from_date, "to_date": to_date},
		"totals": {
			"collected": pl.money(collected),
			"payments": len(payments),
			"by_method": [
				{"method": key, "amount": pl.money(value)}
				for key, value in sorted(by_method.items(), key=lambda kv: -kv[1])
			],
			"expected": pl.money(expected),
			"tour_paid": pl.money(tour_paid),
			"collection_rate": pl.ratio(tour_paid, expected),
			"tours": len(tours),
			"tours_with_gap": sum(1 for row in tours if row.statut_caisse == "Écart"),
			"to_control": pl.money(to_control),
			"gaps": pl.money(gaps),
			"gap_count": int(gap_count),
			"cash_held": pl.money(sum(flt(row.solde) for row in cash_boxes)),
		},
		"series": pl.daily_series(payments, from_date, to_date, value_key="montant"),
		"drivers": drivers,
		"cash_boxes": [
			{
				"driver": row.livreur,
				"driver_name": row.nom_livreur or row.livreur,
				"balance": pl.money(row.solde),
				"updated": cstr(row.date_derniere_maj) or None,
			}
			for row in cash_boxes
		],
		"forecast": pl.forecast_weeks(invoices, _open_order_schedules(company), today),
	}


# --- Performance livraison ------------------------------------------------------------


# Échec de livraison : le BL reste brouillon, « Non Livré » puis « Annulé » une fois le retour
# confirmé (distribution_fulfillment._cancel_failed_draft_delivery_note). L'horodatage de passage
# (custom_date_livraison) le distingue d'un BL annulé sans avoir été présenté au client.
_VISITED_SQL = """
	(dn.docstatus = 1 and dn.custom_statut in %(outcomes)s)
	or (dn.docstatus = 0 and dn.custom_statut in ('Non Livré', 'Annulé')
		and dn.custom_date_livraison is not null and ifnull(dn.custom_tournee, '') != '')
"""


def _closed_delivery_notes(company, from_date, to_date) -> list[dict]:
	rows = frappe.db.sql(
		f"""
		select dn.name, dn.customer,
			case when dn.docstatus = 0 then %(failed)s else dn.custom_statut end as status,
			dn.custom_commune as commune, dn.custom_wilaya as wilaya,
			date(coalesce(dn.custom_date_livraison, l.date_liv, dn.posting_date)) as delivered_on,
			l.livreur, l.vehicule, l.date_liv
		from `tabDelivery Note` dn
		left join `tabLivraison` l on l.name = dn.custom_tournee
		where dn.is_return = 0 and dn.company = %(company)s and ({_VISITED_SQL})
			and date(coalesce(dn.custom_date_livraison, l.date_liv, dn.posting_date)) between %(from_date)s and %(to_date)s
		""",
		{
			"company": company,
			"from_date": from_date,
			"to_date": to_date,
			"outcomes": pl.OUTCOMES,
			"failed": pl.FAILED,
		},
		as_dict=True,
	)
	names = [row.name for row in rows] or [""]
	reasons = defaultdict(set)
	orders = {}
	for item in frappe.get_all(
		"Delivery Note Item",
		filters={"parent": ["in", names]},
		fields=["parent", "custom_raison_non_livraison", "against_sales_order"],
	):
		if item.custom_raison_non_livraison:
			reasons[item.parent].add(item.custom_raison_non_livraison)
		if item.against_sales_order:
			orders.setdefault(item.parent, item.against_sales_order)
	attempts = dict(
		frappe.db.sql(
			"""
			select bon_de_livraison, count(distinct tournee_apres)
			from `tabHistorique Planification BL`
			where bon_de_livraison in %(names)s and ifnull(tournee_apres, '') != ''
			group by bon_de_livraison
			""",
			{"names": tuple(names)},
		)
	)
	# Tentatives : une commande refaite sur un nouveau BL après un échec compte comme un 2e passage.
	order_attempts = pl.attempt_numbers(
		frappe.db.sql(
			f"""
			select distinct dni.against_sales_order as `order`, dn.name,
				date(coalesce(dn.custom_date_livraison, dn.posting_date)) as `date`
			from `tabDelivery Note` dn
			join `tabDelivery Note Item` dni on dni.parent = dn.name
			where dni.against_sales_order in %(orders)s and dn.is_return = 0 and ({_VISITED_SQL})
			""",
			{"orders": tuple(set(orders.values())) or ("",), "outcomes": pl.OUTCOMES},
			as_dict=True,
		)
	)
	order_dates = {
		row.name: row
		for row in frappe.get_all(
			"Sales Order",
			filters={"name": ["in", list(set(orders.values())) or [""]]},
			fields=["name", "transaction_date", "delivery_date"],
		)
	}
	for row in rows:
		row["reasons"] = sorted(reasons.get(row.name, ()))
		row["attempts"] = max(attempts.get(row.name) or 1, order_attempts.get(row.name) or 1)
		order = order_dates.get(orders.get(row.name))
		row["lead_days"] = (
			(getdate(row.delivered_on) - getdate(order.transaction_date)).days
			if order and row.delivered_on
			else None
		)
		row["on_time"] = (
			getdate(row.delivered_on) <= getdate(order.delivery_date)
			if order and order.delivery_date and row.delivered_on and row.status != pl.FAILED
			else None
		)
	return rows


def _fleet(from_date, to_date, rows) -> list[dict]:
	fuel = frappe.db.sql(
		"""
		select vehicule, sum(montant) as amount, sum(km_parcouru) as km, count(*) as fills
		from `tabConsommation Carburant`
		where date between %s and %s
		group by vehicule
		""",
		(from_date, to_date),
		as_dict=True,
	)
	maintenance = dict(
		frappe.db.sql(
			"""
			select vehicule, count(*) from `tabEntretien Vehicule`
			where coalesce(date_entretien, date) between %s and %s
			group by vehicule
			""",
			(from_date, to_date),
		)
	)
	stops = defaultdict(int)
	for row in rows:
		if row.vehicule:
			stops[row.vehicule] += 1
	vehicles = set(stops) | {row.vehicule for row in fuel if row.vehicule} | set(maintenance)
	names = _names("Vehicule", vehicles)
	fuel_by = {row.vehicule: row for row in fuel}
	result = []
	for vehicle in vehicles:
		entry = fuel_by.get(vehicle) or {}
		amount, km = flt(entry.get("amount")), flt(entry.get("km"))
		result.append(
			{
				"vehicle": vehicle,
				"vehicle_name": names.get(vehicle) or vehicle,
				"stops": stops.get(vehicle, 0),
				"fuel": pl.money(amount),
				"km": round(km, 1),
				"cost_per_km": pl.money(amount / km) if km else None,
				"cost_per_stop": pl.money(amount / stops[vehicle]) if stops.get(vehicle) else None,
				"maintenance": cint(maintenance.get(vehicle)),
			}
		)
	return sorted(result, key=lambda row: -row["stops"])


def _named_communes(groups) -> list[dict]:
	names = _names("Commune", [row["key"] for row in groups])
	for row in groups:
		row["name"] = names.get(row["key"]) or row["key"]
	return groups


@frappe.whitelist()
def get_delivery_performance(from_date=None, to_date=None):
	_require(MANAGER_ROLES)
	company = _default_company()
	from_date, to_date = _period(from_date, to_date)
	rows = _closed_delivery_notes(company, from_date, to_date)
	outcome = pl.delivery_outcomes(rows)
	timed = [row["on_time"] for row in rows if row["on_time"] is not None]

	drivers = pl.group_outcomes(rows, "livreur")
	driver_names = _names("Livreur", [row["key"] for row in drivers])
	gaps = defaultdict(float)
	gap_payments = frappe.get_all(
		"Paiement Client",
		filters={"date": ["between", [from_date, to_date]], "statut_controle": "Écart"},
		fields=["livraison", "montant", "montant_compte"],
	)
	tour_driver = dict(
		frappe.get_all(
			"Livraison",
			filters={"name": ["in", [row.livraison for row in gap_payments if row.livraison] or [""]]},
			fields=["name", "livreur"],
			as_list=True,
		)
	)
	for payment in gap_payments:
		gaps[tour_driver.get(payment.livraison)] += flt(payment.montant) - flt(payment.montant_compte)
	days_by_driver = defaultdict(set)
	for row in rows:
		if row.livreur and row.date_liv:
			days_by_driver[row.livreur].add(str(row.date_liv))
	for row in drivers:
		row["name"] = driver_names.get(row["key"]) or ("Sans tournée" if row["key"] == "—" else row["key"])
		days = len(days_by_driver.get(row["key"], ()))
		row["days"] = days
		row["stops_per_day"] = round(row["closed"] / days, 1) if days else None
		row["cash_gap"] = pl.money(gaps.get(row["key"]))

	return {
		"period": {"from_date": from_date, "to_date": to_date},
		"totals": {
			**{key: value for key, value in outcome.items() if key != "reasons"},
			"on_time_rate": pl.ratio(sum(1 for value in timed if value), len(timed)),
			"lead_time": pl.duration_stats(row["lead_days"] for row in rows if row["status"] != pl.FAILED),
		},
		"reasons": outcome["reasons"],
		"communes": _named_communes(pl.group_outcomes(rows, "commune")[:15]),
		"drivers": drivers,
		"vehicles": _fleet(from_date, to_date, rows),
	}


# --- Préparation & stock ---------------------------------------------------------------


def _expiry(today) -> dict:
	batches = frappe.db.sql(
		"""
		select b.item, i.item_name, b.batch_qty as qty, b.expiry_date,
			b.batch_qty * ifnull(nullif(i.valuation_rate, 0), 0) as value
		from `tabBatch` b join `tabItem` i on i.name = b.item
		where b.disabled = 0 and b.batch_qty > 0 and b.expiry_date is not null and b.expiry_date <= %s
		""",
		add_days(today, EXPIRY_HORIZON_DAYS),
		as_dict=True,
	)
	return pl.expiry_exposure(batches, today)


def _inventory_gaps(from_date, to_date) -> list[dict]:
	inventories = frappe.get_all(
		"Inventaire",
		filters={
			"status": "Validé",
			"validated_at": ["between", [f"{from_date} 00:00:00", f"{to_date} 23:59:59"]],
		},
		fields=["name", "titre", "validated_at"],
		order_by="validated_at desc",
	)
	result = []
	for inventory in inventories:
		row = frappe.db.sql(
			"""
			select count(*) as line_count,
				sum(case when counted_qty != expected_at_count then 1 else 0 end) as gap_lines,
				sum(greatest(counted_qty - expected_at_count, 0) * valuation_rate) as surplus,
				sum(greatest(expected_at_count - counted_qty, 0) * valuation_rate) as shortage
			from `tabLigne Inventaire` where inventaire = %s and status != 'À compter'
			""",
			inventory.name,
			as_dict=True,
		)[0]
		result.append(
			{
				"name": inventory.name,
				"title": inventory.titre or inventory.name,
				"validated_at": cstr(inventory.validated_at),
				"lines": cint(row.line_count),
				"gap_lines": cint(row.gap_lines),
				"accuracy": pl.ratio(cint(row.line_count) - cint(row.gap_lines), cint(row.line_count)),
				"surplus": pl.money(row.surplus),
				"shortage": pl.money(row.shortage),
				"net": pl.money(flt(row.surplus) - flt(row.shortage)),
			}
		)
	return result


@frappe.whitelist()
def get_stock_operations(from_date=None, to_date=None):
	_require(MANAGER_ROLES)
	from log.stock_reservation import RESERVED_FIELD

	company = _default_company()
	from_date, to_date = _period(from_date, to_date)
	today = nowdate()

	pick_lists = frappe.get_all(
		"Pick List",
		filters={
			"company": company,
			"creation": ["between", [f"{from_date} 00:00:00", f"{to_date} 23:59:59"]],
			"docstatus": ["<", 2],
		},
		fields=["name", "docstatus", "creation", "modified"],
	)
	done = [row for row in pick_lists if row.docstatus == 1]
	hours = [
		(row.modified - row.creation).total_seconds() / 3600 for row in done if row.modified and row.creation
	]

	late_orders = frappe.db.sql(
		"""
		select count(*) as orders, sum(net_total) as amount from `tabSales Order`
		where docstatus = 1 and company = %s and ifnull(per_picked, 0) < 100 and ifnull(per_delivered, 0) < 100
			and status not in ('Closed', 'Completed', 'On Hold') and delivery_date < %s
		""",
		(company, today),
		as_dict=True,
	)[0]
	shortage = {"lines": 0, "orders": 0, "value": 0.0}
	if frappe.db.has_column("Sales Order Item", RESERVED_FIELD):
		row = frappe.db.sql(
			f"""
			select count(*) as line_count, count(distinct so.name) as orders,
				sum((soi.stock_qty - ifnull(soi.`{RESERVED_FIELD}`, 0)) * soi.base_net_rate / greatest(soi.conversion_factor, 1)) as value
			from `tabSales Order Item` soi join `tabSales Order` so on so.name = soi.parent
			where so.docstatus = 1 and so.company = %s and ifnull(so.per_delivered, 0) < 100
				and so.status not in ('Closed', 'Completed', 'On Hold')
				and ifnull(soi.`{RESERVED_FIELD}`, 0) < soi.stock_qty - ifnull(soi.delivered_qty, 0) * soi.conversion_factor
			""",
			company,
			as_dict=True,
		)[0]
		shortage = {"lines": cint(row.line_count), "orders": cint(row.orders), "value": pl.money(row.value)}
	picking_errors = frappe.db.count(
		"Exception Distribution",
		{
			"type_exception": "Écart de préparation",
			"date_signalement": ["between", [f"{from_date} 00:00:00", f"{to_date} 23:59:59"]],
		},
	)
	inventories = _inventory_gaps(from_date, to_date)
	return {
		"period": {"from_date": from_date, "to_date": to_date},
		"preparation": {
			"pick_lists": len(pick_lists),
			"completed": len(done),
			"completion_rate": pl.ratio(len(done), len(pick_lists)),
			"hours": pl.duration_stats(hours),
			"late_orders": cint(late_orders.orders),
			"late_amount": pl.money(late_orders.amount),
			"picking_errors": picking_errors,
			"error_rate": pl.ratio(picking_errors, len(done)),
		},
		"shortage": shortage,
		"inventories": inventories,
		"inventory_totals": {
			"count": len(inventories),
			"surplus": pl.money(sum(row["surplus"] for row in inventories)),
			"shortage": pl.money(sum(row["shortage"] for row in inventories)),
			"net": pl.money(sum(row["net"] for row in inventories)),
		},
		"expiry": _expiry(today),
	}


# --- Clients & commercial --------------------------------------------------------------


def _order_history(company, today) -> list[dict]:
	return frappe.db.sql(
		"""
		select customer, max(customer_name) as customer_name, count(*) as orders,
			min(transaction_date) as first_order, max(transaction_date) as last_order, sum(base_net_total) as revenue
		from `tabSales Order`
		where docstatus = 1 and company = %s and transaction_date >= %s
		group by customer
		""",
		(company, add_days(today, -RISK_LOOKBACK_DAYS)),
		as_dict=True,
	)


def _sales_reps(company, from_date, to_date) -> list[dict]:
	orders = frappe.db.sql(
		"""
		select so.owner, count(*) as orders, count(distinct so.customer) as customers, sum(so.base_net_total) as revenue,
			sum(so.base_discount_amount) as global_discount
		from `tabSales Order` so
		where so.docstatus = 1 and so.company = %s and so.transaction_date between %s and %s
			and ifnull(so.custom_origine_commande, 'Interne') != 'Portail client'
		group by so.owner
		""",
		(company, from_date, to_date),
		as_dict=True,
	)
	line_discounts = dict(
		frappe.db.sql(
			"""
			select so.owner, sum(greatest(soi.price_list_rate - soi.rate, 0) * soi.qty)
			from `tabSales Order Item` soi join `tabSales Order` so on so.name = soi.parent
			where so.docstatus = 1 and so.company = %s and so.transaction_date between %s and %s
			group by so.owner
			""",
			(company, from_date, to_date),
		)
	)
	margins = dict(
		(row.owner, row)
		for row in frappe.db.sql(
			"""
			select so.owner, sum(dni.base_net_amount) as delivered,
				sum(case when dni.incoming_rate > 0 then dni.incoming_rate * dni.stock_qty
					else ifnull(i.valuation_rate, 0) * dni.stock_qty end) as cost
			from `tabDelivery Note Item` dni
			join `tabDelivery Note` dn on dn.name = dni.parent
			join `tabSales Order` so on so.name = dni.against_sales_order
			left join `tabItem` i on i.name = dni.item_code
			where dn.docstatus = 1 and dn.company = %s and dn.posting_date between %s and %s
			group by so.owner
			""",
			(company, from_date, to_date),
			as_dict=True,
		)
	)
	quota_overrides = {}
	if frappe.db.has_column("Item", "custom_vente_en_quota"):
		quota_overrides = dict(
			frappe.db.sql(
				"""
				select so.owner, count(*)
				from `tabSales Order Item` soi
				join `tabSales Order` so on so.name = soi.parent
				join `tabItem` i on i.name = soi.item_code
				where so.docstatus = 1 and so.company = %s and so.transaction_date between %s and %s
					and i.custom_vente_en_quota = 1 and i.custom_quota_max_commande > 0
					and soi.stock_qty > i.custom_quota_max_commande
				group by so.owner
				""",
				(company, from_date, to_date),
			)
		)
	names = _user_names([row.owner for row in orders])
	result = []
	for row in orders:
		margin = margins.get(row.owner) or {}
		delivered, cost = flt(margin.get("delivered")), flt(margin.get("cost"))
		discount = flt(row.global_discount) + flt(line_discounts.get(row.owner))
		result.append(
			{
				"user": row.owner,
				"name": names.get(row.owner) or row.owner,
				"orders": cint(row.orders),
				"customers": cint(row.customers),
				"revenue": pl.money(row.revenue),
				"avg_order": pl.money(flt(row.revenue) / cint(row.orders)) if cint(row.orders) else None,
				"discount": pl.money(discount),
				"discount_rate": pl.ratio(discount, flt(row.revenue) + discount),
				"delivered": pl.money(delivered),
				"margin": pl.money(delivered - cost),
				"margin_rate": pl.ratio(delivered - cost, delivered),
				"quota_overrides": cint(quota_overrides.get(row.owner)),
			}
		)
	return sorted(result, key=lambda row: -row["revenue"])


@frappe.whitelist()
def get_customer_insights(from_date=None, to_date=None):
	_require(MANAGER_ROLES)
	company = _default_company()
	from_date, to_date = _period(from_date, to_date)
	today = nowdate()

	at_risk = pl.customers_at_risk(_order_history(company, today), today)
	origins = frappe.db.sql(
		"""
		select ifnull(custom_origine_commande, 'Interne') as origin, count(*) as orders, sum(base_net_total) as revenue
		from `tabSales Order`
		where docstatus = 1 and company = %s and transaction_date between %s and %s
		group by ifnull(custom_origine_commande, 'Interne')
		""",
		(company, from_date, to_date),
		as_dict=True,
	)
	total_orders = sum(cint(row.orders) for row in origins)
	total_revenue = sum(flt(row.revenue) for row in origins)
	events = frappe.db.sql(
		"""
		select e.campaign, max(c.title) as title, e.event_type, count(*) as count
		from `tabEvenement Promotion Portail` e
		left join `tabCampagne Portail` c on c.name = e.campaign
		where e.creation between %s and %s
		group by e.campaign, e.event_type
		""",
		(f"{from_date} 00:00:00", f"{to_date} 23:59:59"),
		as_dict=True,
	)
	return {
		"period": {"from_date": from_date, "to_date": to_date},
		"at_risk": at_risk[:50],
		"at_risk_totals": {
			"customers": len(at_risk),
			"revenue": pl.money(sum(flt(row.get("revenue")) for row in at_risk)),
		},
		"origins": [
			{
				"origin": row.origin,
				"orders": cint(row.orders),
				"revenue": pl.money(row.revenue),
				"order_share": pl.ratio(row.orders, total_orders),
				"revenue_share": pl.ratio(row.revenue, total_revenue),
			}
			for row in sorted(origins, key=lambda row: -flt(row.revenue))
		],
		"campaigns": pl.funnel(events),
		"sales_reps": _sales_reps(company, from_date, to_date),
	}


# --- Objectifs ------------------------------------------------------------------------


def _month_actuals(company, first, last) -> dict:
	sales = frappe.db.sql(
		"""
		select sum(dni.base_net_amount) as revenue,
			sum(case when dni.incoming_rate > 0 then dni.incoming_rate * dni.stock_qty
				else ifnull(i.valuation_rate, 0) * dni.stock_qty end) as cost
		from `tabDelivery Note Item` dni
		join `tabDelivery Note` dn on dn.name = dni.parent
		left join `tabItem` i on i.name = dni.item_code
		where dn.docstatus = 1 and dn.company = %s and dn.posting_date between %s and %s
		""",
		(company, first, last),
		as_dict=True,
	)[0]
	declared = frappe.db.sql(
		"""
		select sum(montant) from `tabPaiement Client`
		where statut_controle != 'Annulé' and date between %s and %s
		""",
		(first, last),
	)[0][0]
	# Règlements saisis directement dans ERPNext (hors encaissements livreurs, déjà comptés).
	direct = frappe.db.sql(
		"""
		select sum(pe.paid_amount) from `tabPayment Entry` pe
		where pe.docstatus = 1 and pe.payment_type = 'Receive' and pe.party_type = 'Customer'
			and pe.company = %s and pe.posting_date between %s and %s
			and not exists (select 1 from `tabPaiement Client` pc where pc.payment_entry = pe.name)
		""",
		(company, first, last),
	)[0][0]
	revenue, cost = flt(sales.revenue), flt(sales.cost)
	return {"ca_ht": revenue, "marge": revenue - cost, "encaissements": flt(declared) + flt(direct)}


def _target(month) -> dict:
	key = getdate(month).strftime("%Y-%m")
	row = frappe.db.get_value(
		"Objectif Pilotage", key, ["ca_ht", "marge", "encaissements", "notes"], as_dict=True
	)
	return row or {}


@frappe.whitelist()
def get_objectives(month=None):
	_require(MANAGER_ROLES)
	company = _default_company()
	today = nowdate()
	first, last = pl.month_bounds(month or today)
	actuals = _month_actuals(company, first, min(last, getdate(today)))
	target = _target(first)
	history = []
	for back in range(5, -1, -1):
		start, end = pl.month_bounds(add_months(first, -back))
		values = _month_actuals(company, start, min(end, getdate(today)))
		goal = _target(start)
		history.append(
			{
				"month": str(start),
				**{f"{key}": pl.money(values[key]) for key in ("ca_ht", "marge", "encaissements")},
				**{
					f"{key}_target": pl.money(goal.get(key)) if flt(goal.get(key)) else None
					for key in ("ca_ht", "marge", "encaissements")
				},
			}
		)
	return {
		"month": str(first),
		"today": today,
		"targets": {key: flt(target.get(key)) or None for key in ("ca_ht", "marge", "encaissements")},
		"notes": target.get("notes") or "",
		"progress": {
			key: pl.objective_progress(actuals[key], target.get(key), first, today)
			for key in ("ca_ht", "marge", "encaissements")
		},
		"history": history,
	}


@frappe.whitelist(methods=["POST"])
def save_objectives(payload):
	_require(MANAGER_ROLES)
	data = _payload(payload)
	first, _last = pl.month_bounds(data.get("month") or nowdate())
	key = first.strftime("%Y-%m")
	doc = (
		frappe.get_doc("Objectif Pilotage", key)
		if frappe.db.exists("Objectif Pilotage", key)
		else frappe.new_doc("Objectif Pilotage")
	)
	doc.mois = str(first)
	for field in ("ca_ht", "marge", "encaissements"):
		if field in data:
			value = data.get(field)
			if value not in (None, "") and flt(value) < 0:
				frappe.throw(_("Un objectif ne peut pas être négatif."))
			doc.set(field, flt(value) if value not in (None, "") else 0)
	if "notes" in data:
		doc.notes = cstr(data.get("notes")).strip()
	doc.save(ignore_permissions=True)
	return get_objectives(str(first))
