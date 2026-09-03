"""Détection et traitement contrôlé des changements de commande Distribution."""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, get_fullname, now_datetime

from log.api.distribution_rules import classify_order_change

PREPARATION_STATUS_MODIFIED = "Modifiée"
PICK_LIST_CHANGED_EVENT = "log:pick_list_changed"


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


def item_delta(before, after) -> bool:
	"""True si qty, article, UOM, entrepôt ou le jeu de lignes a changé."""
	return _item_fingerprint(before) != _item_fingerprint(after)


def _parse_trans_items(trans_items):
	if isinstance(trans_items, str):
		return json.loads(trans_items or "[]")
	return list(trans_items or [])


def trans_items_change_sales_order(sales_order, trans_items) -> bool:
	"""Compare le payload Desk « Mise à jour des articles » à la commande actuelle."""
	so = frappe.get_doc("Sales Order", sales_order)
	existing = {row.name: row for row in (so.get("items") or []) if row.name}
	after_rows = []
	for row in _parse_trans_items(trans_items):
		if not row.get("item_code"):
			continue
		name = row.get("docname") or row.get("name")
		current = existing.get(name) if name else None
		after_rows.append(
			frappe._dict(
				item_code=row.get("item_code"),
				qty=flt(row.get("qty")),
				uom=row.get("uom") or (current.get("uom") if current else None),
				warehouse=row.get("warehouse") or (current.get("warehouse") if current else None),
				batch_no=row.get("batch_no") if "batch_no" in row else (current.get("batch_no") if current else None),
			)
		)
	before_doc = frappe._dict(items=list(so.get("items") or []))
	after_doc = frappe._dict(items=after_rows)
	if len(after_rows) != len(so.get("items") or []):
		return True
	return item_delta(before_doc, after_doc)


def _changed_fields(doc) -> set[str]:
	before = doc.get_doc_before_save()
	changed = set()
	if getattr(frappe.flags, "sales_order_items_changed", False):
		changed.add("items")
	if not before:
		return changed
	if item_delta(before, doc):
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
	if getattr(frappe.flags, "in_distribution_repreparation", False) or getattr(
		frappe.flags, "in_pick_list_item_sync", False
	) or doc.is_new():
		return
	changed = _changed_fields(doc)
	change_type = classify_order_change(changed)
	if method == "on_cancel":
		change_type = "cancelled"
	elif change_type != "preparation" and pick_lists_drift_from_order(doc):
		changed.add("items")
		change_type = "preparation"
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

	if change_type == "preparation":
		sync_pick_lists_after_order_change(doc, reason=reason)


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
		from log.pick_list_ops import unreserve_sales_order_stock

		unreserve_sales_order_stock(sales_order)
		new_pick_list = create_pick_list(sales_order)
		if not new_pick_list or not new_pick_list.get("locations"):
			frappe.throw(_("La commande actualisée ne contient plus rien à préparer."))
		new_pick_list.purpose = "Delivery"
		new_pick_list.pick_manually = 0
		new_pick_list.insert(ignore_permissions=True)
		return {"impact": impact, "pickList": new_pick_list.name}
	finally:
		frappe.flags.in_distribution_repreparation = False


def _doctype_has_field(doctype: str, fieldname: str) -> bool:
	try:
		return bool(frappe.get_meta(doctype).has_field(fieldname))
	except Exception:
		return False


def _remaining_qty_by_so_item(doc) -> dict[str, float]:
	from log.pick_list_ops import _required_pick_qty

	remaining: dict[str, float] = {}
	for item in doc.get("items") or []:
		if item.get("delivered_by_supplier"):
			continue
		name = item.get("name")
		if not name:
			continue
		required = _required_pick_qty(item)
		if required > 0:
			remaining[name] = remaining.get(name, 0.0) + required
	return remaining


def pick_lists_drift_from_order(doc) -> bool:
	"""True si une pick list active a une ligne disparue ou une qty supérieure au restant."""
	names = _pick_lists_for_order(doc.name)
	if not names:
		return False
	active = frappe.get_all(
		"Pick List",
		filters={"name": ["in", names], "docstatus": ["<", 2], "purpose": "Delivery"},
		pluck="name",
	)
	if not active:
		return False
	remaining = _remaining_qty_by_so_item(doc)
	rows = frappe.get_all(
		"Pick List Item",
		filters={"parent": ["in", list(active)], "sales_order": doc.name},
		fields=["sales_order_item", "qty"],
	)
	pl_qty: dict[str, float] = {}
	for row in rows:
		key = row.sales_order_item
		if not key:
			continue
		pl_qty[key] = pl_qty.get(key, 0.0) + flt(row.qty)
	for so_item, qty in pl_qty.items():
		if so_item not in remaining:
			return True
		if qty > remaining[so_item] + 0.000001:
			return True
	return False


def _pick_list_delivery_note_names(pick_list_name: str) -> list[str]:
	return list(
		dict.fromkeys(
			frappe.get_all(
				"Delivery Note Item",
				filters={"against_pick_list": pick_list_name},
				pluck="parent",
			)
		)
	)


def _any_delivery_note_departed(pick_list_name: str) -> bool:
	for name in _pick_list_delivery_note_names(pick_list_name):
		dn = frappe.db.get_value(
			"Delivery Note",
			name,
			["docstatus", "custom_stock_transferred", "custom_statut", "custom_tournee"],
			as_dict=True,
		)
		if not dn:
			continue
		if cint(dn.get("custom_stock_transferred")):
			return True
		if dn.get("custom_statut") in {"Enlevé", "Partiellement Livré", "Livré"}:
			return True
		route = dn.get("custom_tournee")
		if route and frappe.db.get_value("Livraison", route, "etat_planification") == "En cours":
			return True
	return False


def _mark_sales_order_modified(sales_order: str, reason: str | None = None):
	if not _doctype_has_field("Sales Order", "custom_preparation_status"):
		return
	frappe.db.set_value(
		"Sales Order",
		sales_order,
		"custom_preparation_status",
		PREPARATION_STATUS_MODIFIED,
		update_modified=False,
	)
	if reason:
		frappe.logger("log.order_change").info(reason)


def _clear_sales_order_modified(sales_order: str):
	if not sales_order or not _doctype_has_field("Sales Order", "custom_preparation_status"):
		return
	frappe.db.set_value("Sales Order", sales_order, "custom_preparation_status", "", update_modified=False)


def _set_pick_list_changed(pick_list, reason: str):
	if _doctype_has_field("Pick List", "custom_order_changed"):
		pick_list.custom_order_changed = 1
	if _doctype_has_field("Pick List", "custom_order_changed_reason"):
		pick_list.custom_order_changed_reason = reason
	if pick_list.docstatus == 1:
		values = {}
		if _doctype_has_field("Pick List", "custom_order_changed"):
			values["custom_order_changed"] = 1
		if _doctype_has_field("Pick List", "custom_order_changed_reason"):
			values["custom_order_changed_reason"] = reason
		if values:
			frappe.db.set_value("Pick List", pick_list.name, values, update_modified=False)


def _sales_order_from_location(loc) -> str | None:
	if loc is None:
		return None
	value = loc.get("sales_order") if hasattr(loc, "get") else getattr(loc, "sales_order", None)
	return value or None


def sales_orders_from_pick_docs(docs) -> list[str]:
	names = []
	seen = set()
	for doc in docs or []:
		for loc in doc.get("locations") or []:
			so_name = _sales_order_from_location(loc)
			if so_name and so_name not in seen:
				seen.add(so_name)
				names.append(so_name)
	return names


def sales_order_modification_pending(sales_order: str) -> bool:
	if not sales_order or not _doctype_has_field("Sales Order", "custom_preparation_status"):
		return False
	return frappe.db.get_value("Sales Order", sales_order, "custom_preparation_status") == PREPARATION_STATUS_MODIFIED


def pending_modified_sales_orders(sales_orders) -> list[str]:
	return [name for name in sales_orders or [] if sales_order_modification_pending(name)]


def assert_preparation_modification_accepted(sales_orders):
	pending = pending_modified_sales_orders(sales_orders)
	if pending:
		frappe.throw(
			_("Acceptez les modifications de la commande {0} avant de continuer la préparation.").format(pending[0])
		)


def pending_order_change_notice(docs) -> str | None:
	"""Retourne le motif à afficher sans consommer le flag d'acceptation."""
	notice = None
	so_names = []
	seen = set()
	for doc in docs or []:
		changed = cint(doc.get("custom_order_changed"))
		reason = doc.get("custom_order_changed_reason")
		if changed or reason:
			notice = reason or _("Commande modifiée, la liste a été actualisée.")
		for loc in doc.get("locations") or []:
			so_name = _sales_order_from_location(loc)
			if so_name and so_name not in seen:
				seen.add(so_name)
				so_names.append(so_name)
	if notice:
		return notice
	if pending_modified_sales_orders(so_names):
		return _("Commande modifiée, la liste a été actualisée.")
	return None


def _record_preparation_acceptance(sales_order: str):
	accepted_at = now_datetime()
	values = {}
	if _doctype_has_field("Sales Order", "custom_preparation_accepte_par"):
		values["custom_preparation_accepte_par"] = frappe.session.user
	if _doctype_has_field("Sales Order", "custom_preparation_date_acceptation"):
		values["custom_preparation_date_acceptation"] = accepted_at
	if values:
		frappe.db.set_value("Sales Order", sales_order, values, update_modified=False)
	full_name = get_fullname(frappe.session.user) or frappe.session.user
	frappe.get_doc("Sales Order", sales_order).add_comment(
		"Comment",
		_(
			"Le préparateur {0} a pris connaissance que la commande a été modifiée "
			"et que des articles doivent être mis à jour dans la préparation."
		).format(full_name),
	)
	return accepted_at


@frappe.whitelist()
def acknowledge_preparation_modification(sales_order):
	"""Enregistre l'acceptation du préparateur et débloque la préparation."""
	from log.pick_list_ops import _require_preparation_role, serialize_sales_order_pick_detail

	_require_preparation_role()
	if not sales_order or not frappe.db.exists("Sales Order", sales_order):
		frappe.throw(_("Commande introuvable."))
	if not sales_order_modification_pending(sales_order):
		frappe.throw(_("Cette commande n'a pas de modifications en attente."))

	_record_preparation_acceptance(sales_order)
	for name in _pick_lists_for_order(sales_order):
		if frappe.db.exists("Pick List", name):
			clear_order_changed_status(name)
	clear_order_changed_status(sales_orders=[sales_order])
	return serialize_sales_order_pick_detail(frappe.get_doc("Sales Order", sales_order))


def _location_insert_values(loc) -> dict:
	if callable(getattr(loc, "as_dict", None)):
		row = loc.as_dict()
	else:
		row = dict(loc)
	for key in ("name", "parent", "parentfield", "parenttype", "idx"):
		row.pop(key, None)
	return row


def _submitted_missing_item_codes(pick_list, so) -> list[str]:
	so_items = {item.get("name") for item in (so.get("items") or []) if item.get("name")}
	missing = []
	seen = set()
	for loc in pick_list.get("locations") or []:
		soi = loc.get("sales_order_item") if hasattr(loc, "get") else getattr(loc, "sales_order_item", None)
		code = loc.get("item_code") if hasattr(loc, "get") else getattr(loc, "item_code", None)
		if soi and soi not in so_items and code not in seen:
			seen.add(code)
			missing.append(code or soi)
	return missing


def _rebuild_draft_pick_list(pick_list, so, reason: str):
	orders = {
		(loc.get("sales_order") if hasattr(loc, "get") else getattr(loc, "sales_order", None))
		for loc in (pick_list.get("locations") or [])
	} - {None, "", so.name}
	if orders:
		_set_pick_list_changed(pick_list, _("Liste groupée : {0}").format(reason))
		pick_list.save(ignore_permissions=True)
		return pick_list.name

	from erpnext.selling.doctype.sales_order.sales_order import create_pick_list
	from log.pick_list_ops import unreserve_sales_order_stock

	old_picked = {}
	for loc in pick_list.get("locations") or []:
		key = (
			loc.get("sales_order_item") if hasattr(loc, "get") else getattr(loc, "sales_order_item", None),
			loc.get("item_code") if hasattr(loc, "get") else getattr(loc, "item_code", None),
			loc.get("warehouse") if hasattr(loc, "get") else getattr(loc, "warehouse", None),
		)
		old_picked[key] = flt(loc.get("picked_qty") if hasattr(loc, "get") else getattr(loc, "picked_qty", 0))

	unreserve_sales_order_stock(so.name)
	fresh = create_pick_list(so.name)
	if not fresh or not fresh.get("locations"):
		frappe.delete_doc("Pick List", pick_list.name, ignore_permissions=True, force=True)
		return None

	pick_list.set("locations", [])
	for loc in fresh.get("locations") or []:
		row = _location_insert_values(loc)
		key = (row.get("sales_order_item"), row.get("item_code"), row.get("warehouse"))
		previous = old_picked.get(key)
		if previous:
			row["picked_qty"] = min(previous, flt(row.get("stock_qty") or row.get("qty")))
		pick_list.append("locations", row)
	_set_pick_list_changed(pick_list, reason)
	pick_list.save(ignore_permissions=True)
	return pick_list.name


def _publish_pick_list_changed(sales_order: str, pick_lists: list[str], reason: str):
	try:
		frappe.publish_realtime(
			PICK_LIST_CHANGED_EVENT,
			{"sales_order": sales_order, "pick_lists": pick_lists, "reason": reason},
			after_commit=True,
		)
	except Exception:
		pass


def sync_pick_lists_after_order_change(doc, reason: str | None = None):
	"""Resynchronise les pick lists d'une commande dont les articles ont changé.

	Ne détruit pas une liste soumise ni les BL : uniquement un brouillon sans BL.
	"""
	done = getattr(frappe.flags, "pick_list_sync_done_for", None)
	if done is None:
		done = set()
		frappe.flags.pick_list_sync_done_for = done
	if doc.name in done or getattr(frappe.flags, "in_pick_list_item_sync", False):
		return
	if getattr(frappe.flags, "in_distribution_repreparation", False):
		return
	done.add(doc.name)
	frappe.flags.in_pick_list_item_sync = True
	reason = reason or _("Commande {0} modifiée").format(doc.name)
	touched: list[str] = []
	try:
		names = [name for name in _pick_lists_for_order(doc.name) if frappe.db.exists("Pick List", name)]
		drafts = []
		submitted = []
		for name in names:
			pick_list = frappe.get_doc("Pick List", name)
			if pick_list.docstatus == 2:
				continue
			if _any_delivery_note_departed(name) or _pick_list_delivery_note_names(name):
				continue
			if pick_list.docstatus == 0:
				drafts.append(pick_list)
			elif pick_list.docstatus == 1:
				submitted.append(pick_list)

		if drafts:
			keep = drafts[0]
			for extra in drafts[1:]:
				frappe.delete_doc("Pick List", extra.name, ignore_permissions=True, force=True)
			kept = _rebuild_draft_pick_list(keep, doc, reason)
			if kept:
				touched.append(kept)

		for pick_list in submitted:
			missing = _submitted_missing_item_codes(pick_list, doc)
			stale_reason = reason
			if missing:
				stale_reason = _("{0} — ligne absente de la commande : {1}").format(
					reason, ", ".join(missing)
				)
			_set_pick_list_changed(pick_list, stale_reason)
			touched.append(pick_list.name)

		_mark_sales_order_modified(doc.name, reason)
		_publish_pick_list_changed(doc.name, touched, reason)
	finally:
		frappe.flags.in_pick_list_item_sync = False


def clear_order_changed_status(pick_list=None, sales_orders=None):
	"""Efface le statut Modifiée une fois la liste ouverte ou soumise."""
	so_names = set(sales_orders or [])
	if pick_list:
		if isinstance(pick_list, str):
			pick_list = frappe.get_doc("Pick List", pick_list)
		if _doctype_has_field("Pick List", "custom_order_changed"):
			frappe.db.set_value(
				"Pick List",
				pick_list.name,
				{
					"custom_order_changed": 0,
					"custom_order_changed_reason": "",
				}
				if _doctype_has_field("Pick List", "custom_order_changed_reason")
				else {"custom_order_changed": 0},
				update_modified=False,
			)
		for loc in pick_list.get("locations") or []:
			so_name = loc.get("sales_order") if hasattr(loc, "get") else getattr(loc, "sales_order", None)
			if so_name:
				so_names.add(so_name)
	for name in so_names:
		_clear_sales_order_modified(name)


def acknowledge_order_changed(docs) -> str | None:
	"""Lecture du motif sans consommer le flag. Conservé pour compatibilité."""
	return pending_order_change_notice(docs)


@frappe.whitelist()
def update_child_qty_rate(parent_doctype, trans_items, parent_doctype_name, child_docname="items"):
	"""Enveloppe ERPNext pour détecter un delta articles avant le reload+save aveugle."""
	from erpnext.controllers.accounts_controller import update_child_qty_rate as original

	items_changed = False
	if parent_doctype == "Sales Order" and child_docname == "items":
		items_changed = trans_items_change_sales_order(parent_doctype_name, trans_items)
		if items_changed:
			frappe.flags.sales_order_items_changed = True
	result = original(parent_doctype, trans_items, parent_doctype_name, child_docname)
	if items_changed:
		sync_pick_lists_after_order_change(frappe.get_doc("Sales Order", parent_doctype_name))
	return result
