"""Détection et traitement contrôlé des changements de commande Distribution."""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import cint, now_datetime

from log.api.distribution_rules import classify_order_change


def _item_fingerprint(doc):
	return [
		(
			row.get("item_code"),
			float(row.get("qty") or 0),
			row.get("uom"),
			row.get("warehouse"),
			row.get("batch_no"),
		)
		for row in (doc.get("items") or [])
	]


def _changed_fields(doc) -> set[str]:
	before = doc.get_doc_before_save()
	if not before:
		return set()
	changed = set()
	if _item_fingerprint(before) != _item_fingerprint(doc):
		changed.add("items")
	for field in (
		"delivery_date",
		"shipping_address_name",
		"shipping_address",
		"contact_person",
		"contact_mobile",
		"custom_coordonnées_gps",
		"custom_commune",
		"custom_wilaya",
		"grand_total",
		"rounded_total",
		"currency",
		"discount_amount",
	):
		if before.get(field) != doc.get(field):
			changed.add(field)
	return changed


def _delivery_notes_for_order(sales_order: str) -> list[str]:
	return list(
		dict.fromkeys(
			frappe.get_all(
				"Delivery Note Item",
				filters={"against_sales_order": sales_order},
				pluck="parent",
			)
		)
	)


def _pick_lists_for_order(sales_order: str) -> list[str]:
	return list(
		dict.fromkeys(
			frappe.get_all(
				"Pick List Item",
				filters={"sales_order": sales_order},
				pluck="parent",
			)
		)
	)


def _create_exception(dn, route, description: str, *, cancelled: bool = False):
	existing = frappe.db.exists(
		"Exception Distribution",
		{"bon_de_livraison": dn.name, "statut": ["in", ["Ouverte", "En traitement"]]},
	)
	if existing:
		return existing
	return frappe.get_doc(
		{
			"doctype": "Exception Distribution",
			"type_exception": "Commande annulée après départ" if cancelled else "Commande modifiée après départ",
			"priorite": "Critique" if cancelled else "Haute",
			"bon_de_livraison": dn.name,
			"commande_client": next(
				(item.against_sales_order for item in dn.items if item.get("against_sales_order")),
				None,
			),
			"tournee": route.name if route else None,
			"livreur": route.livreur if route else dn.get("custom_livreur"),
			"vehicule": route.vehicule if route else dn.get("custom_véhicule"),
			"description": description,
		}
	).insert(ignore_permissions=True).name


def invalidate_order_distribution(doc, method=None):
	if getattr(frappe.flags, "in_distribution_repreparation", False) or doc.is_new():
		return
	changed = _changed_fields(doc)
	change_type = classify_order_change(changed)
	if method == "on_cancel":
		change_type = "cancelled"
	if not change_type:
		return

	revision = cint(doc.get("custom_distribution_revision")) + 1
	if frappe.db.has_column("Sales Order", "custom_distribution_revision"):
		frappe.db.set_value("Sales Order", doc.name, "custom_distribution_revision", revision, update_modified=False)
	reason = _("Commande {0} modifiée : {1}").format(doc.name, ", ".join(sorted(changed)) or "annulation")

	from log.api.distribution import (
		_active_assignment,
		_bump_route_revision,
		_lock_delivery_note,
		_lock_route,
		_record_assignment_history,
		_route_snapshot,
	)

	for name in _delivery_notes_for_order(doc.name):
		_lock_delivery_note(name)
		dn = frappe.get_doc("Delivery Note", name)
		route_name = _active_assignment(name)
		route = None
		if route_name:
			_lock_route(route_name)
			route = frappe.get_doc("Livraison", route_name)
		before = _route_snapshot(route)
		if route and (route.etat_planification == "En cours" or dn.get("custom_stock_transferred")):
			_create_exception(dn, route, reason, cancelled=change_type == "cancelled")
			frappe.db.set_value(
				"Delivery Note",
				name,
				{
					"custom_statut_planification": "Exception",
					"custom_revision_commande": revision,
					"custom_motif_invalidation": reason,
				},
				update_modified=False,
			)
			_record_assignment_history(name, "Exception", before, before, reason=reason, revision=route.revision)
			continue

		suggestion = before if route else None
		if route:
			if change_type in {"preparation", "cancelled"}:
				route.set("bons_de_livraison", [row for row in route.bons_de_livraison if row.bon_de_livraison != name])
			_bump_route_revision(route, reason)
			route.save(ignore_permissions=True)
		status = "À repréparer" if change_type in {"preparation", "cancelled"} else "À revalider"
		values = {
			"custom_statut_planification": status,
			"custom_revision_commande": revision,
			"custom_motif_invalidation": reason,
			"custom_affectation_suggeree": json.dumps(suggestion, ensure_ascii=False) if suggestion else None,
		}
		if change_type in {"preparation", "cancelled"}:
			values.update({
				"custom_tournee": None,
				"custom_date_planifiee": None,
				"custom_livreur": None,
				"custom_nom_livreur": None,
				"custom_véhicule": None,
			})
		frappe.db.set_value("Delivery Note", name, values, update_modified=False)
		_record_assignment_history(
			name,
			"Invalidation",
			before,
			{} if change_type in {"preparation", "cancelled"} else before,
			reason=reason,
			revision=route.revision if route else None,
			details={"changeType": change_type, "changedFields": sorted(changed)},
		)


def invalidate_delivery_note_distribution(doc, method=None):
	if doc.is_new() or getattr(frappe.flags, "in_distribution_completion", False):
		return
	before = doc.get_doc_before_save()
	if not before or not doc.get("custom_tournee"):
		return
	changed = set()
	if _item_fingerprint(before) != _item_fingerprint(doc):
		changed.add("items")
	for field in (
		"custom_date_de_livraison",
		"shipping_address_name",
		"shipping_address",
		"contact_person",
		"contact_mobile",
		"instructions",
		"grand_total",
	):
		if before.get(field) != doc.get(field):
			changed.add(field)
	if not changed:
		return
	change_type = "preparation" if "items" in changed else "routing"
	from log.api.distribution import _bump_route_revision, _lock_route, _record_assignment_history, _route_snapshot

	_lock_route(doc.custom_tournee)
	route = frappe.get_doc("Livraison", doc.custom_tournee)
	reason = _("BL {0} modifié : {1}").format(doc.name, ", ".join(sorted(changed)))
	before_route = _route_snapshot(route)
	if route.etat_planification == "En cours" or doc.get("custom_stock_transferred"):
		_create_exception(doc, route, reason)
		doc.custom_statut_planification = "Exception"
		doc.custom_motif_invalidation = reason
		_record_assignment_history(doc.name, "Exception", before_route, before_route, reason=reason, revision=route.revision)
		return
	if change_type == "preparation":
		route.set("bons_de_livraison", [row for row in route.bons_de_livraison if row.bon_de_livraison != doc.name])
		doc.custom_tournee = None
		doc.custom_date_planifiee = None
		doc.custom_livreur = None
		doc.custom_nom_livreur = None
		doc.custom_véhicule = None
		doc.custom_statut_planification = "À repréparer"
	else:
		doc.custom_statut_planification = "À revalider"
	doc.custom_motif_invalidation = reason
	_bump_route_revision(route, reason)
	route.save(ignore_permissions=True)
	_record_assignment_history(
		doc.name,
		"Invalidation",
		before_route,
		{} if change_type == "preparation" else before_route,
		reason=reason,
		revision=route.revision,
		details={"changeType": change_type, "changedFields": sorted(changed)},
	)


def get_repreparation_impact_data(sales_order: str):
	if not frappe.db.exists("Sales Order", sales_order):
		frappe.throw(_("Commande introuvable."))
	pick_lists = _pick_lists_for_order(sales_order)
	delivery_notes = _delivery_notes_for_order(sales_order)
	routes = []
	blockers = []
	legacy_grouped = False
	for pick_list in pick_lists:
		orders = set(frappe.get_all("Pick List Item", filters={"parent": pick_list}, pluck="sales_order")) - {None}
		if len(orders) > 1:
			legacy_grouped = True
	for name in delivery_notes:
		dn = frappe.get_doc("Delivery Note", name)
		if dn.docstatus != 0:
			blockers.append(_("Le BL {0} n'est plus en brouillon.").format(name))
		if dn.get("custom_stock_transferred") or dn.get("custom_statut") in {"Enlevé", "Partiellement Livré", "Livré"}:
			blockers.append(_("Le BL {0} a déjà quitté la préparation.").format(name))
		if frappe.db.exists("Paiement Client", {"bon_livraison": name}):
			blockers.append(_("Le BL {0} possède déjà un paiement.").format(name))
		route = frappe.db.get_value("Livraison Bon de Livraison", {"bon_de_livraison": name}, "parent")
		if route and route not in routes:
			routes.append(route)
			state = frappe.db.get_value("Livraison", route, "etat_planification")
			if state == "En cours":
				blockers.append(_("La tournée {0} est déjà en cours.").format(route))
	return {
		"salesOrder": sales_order,
		"revision": cint(frappe.db.get_value("Sales Order", sales_order, "custom_distribution_revision")),
		"pickLists": pick_lists,
		"deliveryNotes": delivery_notes,
		"routes": routes,
		"legacyGroupedPickList": legacy_grouped,
		"blockers": blockers,
	}


def reprepare_order(sales_order: str, expected_revision=None):
	impact = get_repreparation_impact_data(sales_order)
	if expected_revision not in (None, "") and cint(expected_revision) != impact["revision"]:
		frappe.throw(_("La commande a encore été modifiée. Actualisez l'impact."))
	if impact["legacyGroupedPickList"]:
		frappe.throw(_("Cette ancienne Pick List regroupe plusieurs commandes. Un Responsable doit reprendre le groupe complet."))
	if impact["blockers"]:
		frappe.throw(" ".join(impact["blockers"]))

	frappe.flags.in_distribution_repreparation = True
	try:
		for name in impact["deliveryNotes"]:
			if frappe.db.exists("Delivery Note", name):
				frappe.delete_doc("Delivery Note", name, ignore_permissions=True, force=True)
		for name in impact["pickLists"]:
			if not frappe.db.exists("Pick List", name):
				continue
			pick_list = frappe.get_doc("Pick List", name)
			if pick_list.docstatus == 1:
				pick_list.flags.ignore_permissions = True
				pick_list.cancel()
			if pick_list.docstatus == 0:
				frappe.delete_doc("Pick List", name, ignore_permissions=True, force=True)

		from erpnext.selling.doctype.sales_order.sales_order import create_pick_list

		new_pick_list = create_pick_list(sales_order)
		if not new_pick_list or not new_pick_list.get("locations"):
			frappe.throw(_("La commande actualisée ne contient plus rien à préparer."))
		new_pick_list.purpose = "Delivery"
		new_pick_list.pick_manually = 0
		new_pick_list.insert(ignore_permissions=True)
		return {"impact": impact, "pickList": new_pick_list.name}
	finally:
		frappe.flags.in_distribution_repreparation = False
