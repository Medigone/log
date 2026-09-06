"""Mouvements de stock et facturation du cycle Distribution.

Les fonctions de ce module sont appelées depuis l'API transactionnelle. Elles ne
font aucun commit explicite afin que Frappe puisse annuler l'ensemble de la
mutation en cas d'erreur.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, get_datetime, getdate, now_datetime, nowtime, today


def _line_remaining(line) -> float:
	return max(flt(line.loaded_qty) - flt(line.delivered_qty) - flt(line.returned_qty), 0)


def _stock_entry_item(values: dict[str, Any]) -> dict[str, Any]:
	row = {
		"item_code": values["item_code"],
		"qty": flt(values["qty"]),
		"uom": values.get("uom"),
		"stock_uom": values.get("stock_uom"),
		"conversion_factor": flt(values.get("conversion_factor") or 1),
		"s_warehouse": values["source_warehouse"],
		"t_warehouse": values["target_warehouse"],
	}
	if values.get("batch_no"):
		row.update({"batch_no": values["batch_no"], "use_serial_batch_fields": 1})
	if values.get("serial_no"):
		row.update({"serial_no": values["serial_no"], "use_serial_batch_fields": 1})
	return row


def _tracking_fragments(item, qty: float) -> list[dict[str, Any]]:
	"""Retourne les quantités par lot/série, y compris depuis les bundles ERPNext v16."""
	conversion_factor = flt(item.conversion_factor or 1)
	bundle = item.get("serial_and_batch_bundle")
	fragments: list[dict[str, Any]] = []
	if bundle:
		for entry in frappe.get_all(
			"Serial and Batch Entry",
			filters={"parent": bundle},
			fields=["batch_no", "serial_no", "qty", "warehouse"],
			order_by="idx asc",
		):
			stock_qty = abs(flt(entry.qty))
			if stock_qty <= 0:
				continue
			fragments.append(
				{
					"qty": stock_qty / conversion_factor,
					"batch_no": entry.batch_no,
					"serial_no": entry.serial_no,
					"warehouse": entry.warehouse,
				}
			)
	else:
		fragments.append(
			{
				"qty": qty,
				"batch_no": item.get("batch_no"),
				"serial_no": item.get("serial_no"),
				"warehouse": item.warehouse,
			}
		)

	tracked_qty = sum(flt(fragment["qty"]) for fragment in fragments)
	if abs(tracked_qty - qty) > 0.000001:
		frappe.throw(
			_("Les lots/séries de l'article {0} dans {1} couvrent {2}, au lieu de {3}.").format(
				item.item_code, item.parent, tracked_qty, qty
			)
		)
	has_serial, has_batch = frappe.db.get_value(
		"Item", item.item_code, ["has_serial_no", "has_batch_no"]
	) or (0, 0)
	if has_serial and any(not fragment.get("serial_no") for fragment in fragments):
		frappe.throw(_("Numéro de série manquant pour {0} dans {1}.").format(item.item_code, item.parent))
	if has_batch and any(not fragment.get("batch_no") for fragment in fragments):
		frappe.throw(_("Lot manquant pour {0} dans {1}.").format(item.item_code, item.parent))
	return fragments


def _submit_material_transfer(company: str, remarks: str, rows: list[dict[str, Any]]):
	if not rows:
		return None
	entry = frappe.new_doc("Stock Entry")
	entry.stock_entry_type = "Material Transfer"
	entry.company = company
	entry.remarks = remarks
	for values in rows:
		entry.append("items", _stock_entry_item(values))
	entry.flags.ignore_permissions = True
	entry.insert(ignore_permissions=True)
	entry.submit()
	return entry


@contextmanager
def _ignore_permission_checks():
	"""ERPNext mapping and SI.validate re-check create perms for the current user."""
	original = frappe.has_permission
	frappe.has_permission = lambda *args, **kwargs: True
	try:
		yield
	finally:
		frappe.has_permission = original


def _save_distribution_doc(doc):
	"""Persist a Delivery Note written by a driver workflow without Item permission checks.

	ERPNext ``validate`` reloads item details and calls ``Item.check_permission()``. The Livreur
	role is intentionally not granted Item access; the endpoint already validated the stock move.
	"""
	frappe.flags.in_distribution_completion = True
	try:
		doc.flags.ignore_permissions = True
		doc.flags.ignore_validate = True
		doc.flags.ignore_validate_update_after_submit = True
		doc.save(ignore_permissions=True)
	finally:
		frappe.flags.in_distribution_completion = False


def _submit_distribution_doc(doc):
	frappe.flags.in_distribution_completion = True
	try:
		doc.flags.ignore_permissions = True
		doc.flags.ignore_validate = True
		doc.flags.ignore_validate_update_after_submit = True
		doc.submit()
	finally:
		frappe.flags.in_distribution_completion = False


def load_route_stock(route, *, historical: bool = False):
	"""Charge tous les BL de la tournée dans l'entrepôt du véhicule."""
	if route.get("stock_entry_chargement"):
		if frappe.db.get_value("Stock Entry", route.stock_entry_chargement, "docstatus") == 1:
			return frappe.get_doc("Stock Entry", route.stock_entry_chargement)
		frappe.throw(_("Le transfert de chargement existant n'est pas validé."))

	vehicle_warehouse, vehicle_company = frappe.db.get_value(
		"Vehicule", route.vehicule, ["warehouse", "company"]
	) or (None, None)
	if not vehicle_warehouse:
		frappe.throw(_("Le véhicule sélectionné n'a pas d'entrepôt associé."))

	transfer_rows: list[dict[str, Any]] = []
	delivery_plans: list[tuple[Any, list[tuple[dict[str, Any], list[dict[str, Any]]]]]] = []
	company = None
	for stop in route.bons_de_livraison or []:
		dn = frappe.get_doc("Delivery Note", stop.bon_de_livraison)
		if dn.docstatus != 0:
			frappe.throw(_("Le bon {0} doit être en brouillon avant le chargement.").format(dn.name))
		company = company or dn.company
		if dn.company != company or (vehicle_company and dn.company != vehicle_company):
			frappe.throw(_("Tous les BL et le véhicule doivent appartenir à la même société."))
		item_plans: list[tuple[dict[str, Any], list[dict[str, Any]]]] = []
		for item in dn.items or []:
			qty = flt(item.qty) if historical else max(flt(item.qty) - flt(item.get("custom_quantite_livree")), 0)
			if qty <= 0:
				continue
			if not item.warehouse:
				frappe.throw(_("Entrepôt source manquant pour {0} dans {1}.").format(item.item_code, dn.name))
			if item.warehouse == vehicle_warehouse:
				frappe.throw(_("Le bon {0} est déjà positionné dans l'entrepôt du véhicule.").format(dn.name))
			fragments = _tracking_fragments(item, qty)
			base_values = _child_values(item)
			item_plans.append((base_values, fragments))
			for fragment in fragments:
				source_warehouse = fragment.get("warehouse") or item.warehouse
				if source_warehouse != item.warehouse:
					frappe.throw(
						_("Le lot ou numéro de série de {0} n'est pas dans l'entrepôt {1}.").format(
							item.item_code, item.warehouse
						)
					)
				transfer_rows.append(
					{
						"item_code": item.item_code,
						"qty": fragment["qty"],
						"uom": item.uom,
						"stock_uom": item.stock_uom,
						"conversion_factor": item.conversion_factor or 1,
						"source_warehouse": source_warehouse,
						"target_warehouse": vehicle_warehouse,
						"batch_no": fragment.get("batch_no"),
						"serial_no": fragment.get("serial_no"),
					}
				)
		delivery_plans.append((dn, item_plans))

	if not transfer_rows or not company:
		frappe.throw(_("La tournée ne contient aucune marchandise à charger."))
	entry = _submit_material_transfer(
		company,
		_("Chargement de la tournée {0} vers le véhicule {1}").format(route.name, route.vehicule),
		transfer_rows,
	)

	route.set("lignes_chargement", [])
	for dn, item_plans in delivery_plans:
		dn.set("items", [])
		registry_items: list[tuple[Any, dict[str, Any], dict[str, Any]]] = []
		for base_values, fragments in item_plans:
			for fragment in fragments:
				values = dict(base_values)
				values.update(
					{
						"qty": fragment["qty"],
						"warehouse": vehicle_warehouse,
						"serial_and_batch_bundle": None,
						"batch_no": fragment.get("batch_no"),
						"serial_no": fragment.get("serial_no"),
						"use_serial_batch_fields": 1 if fragment.get("batch_no") or fragment.get("serial_no") else 0,
					}
				)
				new_item = dn.append("items", values)
				registry_items.append((new_item, fragment, base_values))
		dn.custom_statut = "Enlevé"
		dn.custom_statut_planification = "En cours"
		if dn.meta.has_field("custom_stock_entry_chargement"):
			dn.custom_stock_entry_chargement = entry.name
		if dn.meta.has_field("custom_stock_transferred"):
			dn.custom_stock_transferred = 1
		if dn.meta.has_field("custom_last_transfer_vehicle"):
			dn.custom_last_transfer_vehicle = route.vehicule
		_save_distribution_doc(dn)
		for new_item, fragment, base_values in registry_items:
			route.append(
				"lignes_chargement",
				{
					"delivery_note": dn.name,
					"delivery_note_item": new_item.name,
					"item_code": new_item.item_code,
					"item_name": new_item.item_name,
					"batch_no": fragment.get("batch_no"),
					"serial_no": fragment.get("serial_no"),
					"source_warehouse": fragment.get("warehouse") or base_values.get("warehouse"),
					"vehicle_warehouse": vehicle_warehouse,
					"uom": new_item.uom,
					"stock_uom": new_item.stock_uom,
					"conversion_factor": new_item.conversion_factor or 1,
					"loaded_qty": fragment["qty"],
				},
			)

	route.stock_entry_chargement = entry.name
	route.statut_chargement = "Chargé"
	route.date_chargement = now_datetime()
	route.charge_par = frappe.session.user
	refresh_route_stock_totals(route)
	return entry


def refresh_route_stock_totals(route):
	lines = route.get("lignes_chargement") or []
	route.total_quantite_chargee = sum(flt(line.loaded_qty) for line in lines)
	route.total_quantite_livree = sum(flt(line.delivered_qty) for line in lines)
	route.total_quantite_retournee = sum(flt(line.returned_qty) for line in lines)
	route.total_quantite_restante = sum(_line_remaining(line) for line in lines)


LOCKED_CASH_STATUSES = frozenset({"À contrôler", "Écart", "Validée"})


def _sync_cash_status_after_return(route) -> None:
	"""Le retour stock ne démarre ni n'écrase le contrôle de caisse."""
	current = route.get("statut_caisse") or "Sans encaissement"
	if current in LOCKED_CASH_STATUSES:
		return
	payments = (
		frappe.get_all("Paiement Client", filters={"livraison": route.name}, pluck="name")
		if route.get("name")
		else []
	)
	route.statut_caisse = "À contrôler" if payments else "Sans encaissement"


def complete_empty_route_return(route, *, persist: bool = True) -> bool:
	"""Clôture le retour véhicule s'il ne reste aucune marchandise à ramener."""
	refresh_route_stock_totals(route)
	if flt(route.get("total_quantite_restante")) > 0:
		return False
	if route.get("statut_chargement") == "Retourné":
		return True
	_settle_delivery_notes_after_return(route)
	route.statut_chargement = "Retourné"
	route.date_confirmation_retour = route.get("date_confirmation_retour") or now_datetime()
	route.retour_confirme_par = route.get("retour_confirme_par") or frappe.session.user
	route.etat_planification = "Contrôle caisse"
	_sync_cash_status_after_return(route)
	if persist and hasattr(route, "save"):
		route.save(ignore_permissions=True)
	return True


def route_stock_summary(route) -> dict[str, Any]:
	refresh_route_stock_totals(route)
	lines = route.get("lignes_chargement") or []
	return {
		"status": route.get("statut_chargement") or "À charger",
		"loadingStockEntry": route.get("stock_entry_chargement"),
		"returnStockEntry": route.get("stock_entry_retour"),
		"loadedQuantity": flt(route.get("total_quantite_chargee")),
		"deliveredQuantity": flt(route.get("total_quantite_livree")),
		"remainingQuantity": flt(route.get("total_quantite_restante")),
		"returnedQuantity": flt(route.get("total_quantite_retournee")),
		"returnDeclaredAt": str(route.get("date_declaration_retour") or "") or None,
		"returnConfirmedAt": str(route.get("date_confirmation_retour") or "") or None,
		"lines": [
			{
				"name": line.name,
				"deliveryNote": line.delivery_note,
				"deliveryNoteItem": line.delivery_note_item,
				"residualDeliveryNote": line.get("residual_delivery_note"),
				"itemCode": line.item_code,
				"itemName": line.item_name,
				"batchNo": line.get("batch_no"),
				"sourceWarehouse": line.source_warehouse,
				"vehicleWarehouse": line.vehicle_warehouse,
				"returnWarehouse": line.get("return_warehouse"),
				"loadedQuantity": flt(line.loaded_qty),
				"deliveredQuantity": flt(line.delivered_qty),
				"remainingQuantity": _line_remaining(line),
				"returnedQuantity": flt(line.returned_qty),
				"uom": line.uom,
			}
			for line in lines
		],
	}


def _child_values(item) -> dict[str, Any]:
	values = item.as_dict(no_nulls=False)
	for key in ("name", "parent", "parentfield", "parenttype", "idx", "docstatus", "doctype"):
		values.pop(key, None)
	return values


def _apply_delivered_quantities_for_submit(doc):
	"""Aligne qty/stock_qty sur le livré et retire les lignes à zéro avant soumission."""
	delivered_rows = []
	for item in list(doc.items or []):
		delivered = flt(item.get("custom_quantite_livree"))
		if delivered <= 0:
			continue
		values = _child_values(item)
		if item.get("name"):
			values["name"] = item.name
		conversion = flt(item.get("conversion_factor") or 1)
		values["qty"] = delivered
		values["stock_qty"] = delivered * conversion
		values["custom_quantite_livree"] = delivered
		values["custom_statut_article"] = "Livré"
		delivered_rows.append(values)
	if not delivered_rows:
		frappe.throw(_("Aucune quantité livrée à soumettre."))
	doc.set("items", [])
	for values in delivered_rows:
		doc.append("items", values)
	doc.calculate_taxes_and_totals()


def resolve_billing_exceptions(delivery_note: str, invoice: str | None = None) -> None:
	"""Ferme les exceptions de facturation une fois la facture réellement créée."""
	resolution = _("Facture créée : {0}").format(invoice) if invoice else _("Facture créée")
	for exception in frappe.get_all(
		"Exception Distribution",
		filters={
			"bon_de_livraison": delivery_note,
			"type_exception": "Facturation",
			"statut": ["in", ["Ouverte", "En traitement"]],
		},
		pluck="name",
	):
		frappe.db.set_value(
			"Exception Distribution",
			exception,
			{
				"statut": "Résolue",
				"resolution": resolution,
				"resolue_par": frappe.session.user,
				"date_resolution": now_datetime(),
			},
		)


def _create_distribution_exception(route, delivery_note: str, exception_type: str, description: str):
	existing = frappe.db.exists(
		"Exception Distribution",
		{
			"tournee": route.name,
			"bon_de_livraison": delivery_note,
			"type_exception": exception_type,
			"statut": ["in", ["Ouverte", "En traitement"]],
		},
	)
	if existing:
		return frappe.get_doc("Exception Distribution", existing)
	dn = frappe.get_doc("Delivery Note", delivery_note)
	return frappe.get_doc(
		{
			"doctype": "Exception Distribution",
			"statut": "Ouverte",
			"type_exception": exception_type,
			"priorite": "Haute",
			"date_signalement": now_datetime(),
			"signalee_par": frappe.session.user,
			"bon_de_livraison": delivery_note,
			"commande_client": next(
				(item.against_sales_order for item in dn.items or [] if item.get("against_sales_order")), None
			),
			"tournee": route.name,
			"livreur": route.livreur,
			"vehicule": route.vehicule,
			"description": description,
		}
	).insert(ignore_permissions=True)


def create_and_submit_invoice(route, delivery_note: str) -> tuple[str | None, str]:
	existing = frappe.db.get_value(
		"Sales Invoice Item",
		{"delivery_note": delivery_note, "docstatus": 1},
		"parent",
	)
	if existing:
		frappe.db.set_value(
			"Delivery Note",
			delivery_note,
			{"custom_sales_invoice": existing, "custom_statut_facturation": "Créée"},
			update_modified=False,
		)
		resolve_billing_exceptions(delivery_note, existing)
		return existing, "created"

	frappe.db.savepoint("distribution_invoice")
	try:
		from erpnext.stock.doctype.delivery_note.delivery_note import make_sales_invoice

		with _ignore_permission_checks():
			invoice = make_sales_invoice(delivery_note)
			invoice.set_posting_time = 1
			invoice.posting_date = today()
			invoice.posting_time = nowtime()
			invoice.flags.ignore_permissions = True
			invoice.insert(ignore_permissions=True)
			invoice.submit()
		frappe.db.set_value(
			"Delivery Note",
			delivery_note,
			{"custom_sales_invoice": invoice.name, "custom_statut_facturation": "Créée"},
			update_modified=False,
		)
		frappe.db.set_value(
			"Paiement Client",
			{"bon_livraison": delivery_note, "facture_source": ["is", "not set"]},
			{"facture_source": invoice.name},
			update_modified=False,
		)
		resolve_billing_exceptions(delivery_note, invoice.name)
		return invoice.name, "created"
	except Exception:
		message = frappe.get_traceback()
		frappe.db.rollback(save_point="distribution_invoice")
		frappe.db.set_value(
			"Delivery Note",
			delivery_note,
			{"custom_statut_facturation": "Erreur"},
			update_modified=False,
		)
		_create_distribution_exception(
			route,
			delivery_note,
			"Facturation",
			_("La facture automatique n'a pas pu être créée. Corrigez la configuration comptable puis relancez-la."),
		)
		frappe.log_error(title=f"Facturation Distribution {delivery_note}", message=message)
		return None, "error"


def _stamp_delivery_completion(doc) -> None:
	now = now_datetime()
	if doc.meta.has_field("custom_date_livraison") and not doc.get("custom_date_livraison"):
		doc.custom_date_livraison = now
	if doc.meta.has_field("custom_user_livraison") and not doc.get("custom_user_livraison"):
		doc.custom_user_livraison = frappe.session.user


def finalize_delivery_document(route, doc, outcome: str) -> dict[str, Any]:
	"""Soumet le BL aux quantités livrées. Le reliquat reste sur la commande native."""
	delivered_by_original = {
		item.name: flt(item.get("custom_quantite_livree")) for item in doc.items or []
	}
	if outcome == "failed":
		doc.custom_statut = "Non Livré"
		doc.custom_statut_planification = "En attente retour"
		if doc.meta.has_field("custom_statut_facturation"):
			doc.custom_statut_facturation = "Sans objet"
		_stamp_delivery_completion(doc)
		_save_distribution_doc(doc)
		return {"deliveryNote": doc.name, "invoiceStatus": "not_applicable"}

	remaining = sum(max(flt(item.qty) - flt(item.get("custom_quantite_livree")), 0) for item in doc.items)
	_apply_delivered_quantities_for_submit(doc)
	doc.custom_statut = "Partiellement Livré" if remaining > 0 else "Livré"
	doc.custom_statut_planification = "Terminé"
	if doc.meta.has_field("custom_statut_facturation"):
		doc.custom_statut_facturation = "Non créée"
	doc.set_posting_time = 1
	doc.posting_date = today()
	doc.posting_time = nowtime()
	_stamp_delivery_completion(doc)
	_submit_distribution_doc(doc)

	for line in route.get("lignes_chargement") or []:
		if line.delivery_note == doc.name:
			line.delivered_qty = min(
				flt(line.loaded_qty), delivered_by_original.get(line.delivery_note_item, 0)
			)
	refresh_route_stock_totals(route)
	invoice, invoice_status = create_and_submit_invoice(route, doc.name)
	return {
		"deliveryNote": doc.name,
		"residualDeliveryNote": None,
		"salesInvoice": invoice,
		"invoiceStatus": invoice_status,
	}


def declare_route_return(route, *, persist: bool = True):
	if route.get("statut_chargement") == "Retourné":
		return route_stock_summary(route)
	if route.get("statut_chargement") not in {"Chargé", "Retour requis", "Retour déclaré", "Exception"}:
		frappe.throw(_("Cette tournée n'a aucun chargement à retourner."))
	route.statut_chargement = "Retour déclaré"
	route.date_declaration_retour = route.get("date_declaration_retour") or now_datetime()
	route.retour_declare_par = route.get("retour_declare_par") or frappe.session.user
	route.etat_planification = "Retour dépôt"
	refresh_route_stock_totals(route)
	if persist and hasattr(route, "save"):
		route.save(ignore_permissions=True)
	return route_stock_summary(route)


def _return_warehouse() -> str:
	warehouse = frappe.db.get_single_value("Parametres Livraison", "entrepot_retour_livraison")
	if not warehouse:
		frappe.throw(_("Configurez l'entrepôt retour livraison dans Paramètres Livraison."))
	if frappe.db.get_value("Warehouse", warehouse, "is_group"):
		frappe.throw(_("L'entrepôt retour livraison doit être un entrepôt feuille."))
	return warehouse


def _delivery_note_names_on_route(route) -> list[str]:
	names: list[str] = []
	seen: set[str] = set()
	for line in route.get("lignes_chargement") or []:
		name = line.delivery_note
		if name and name not in seen:
			seen.add(name)
			names.append(name)
	for row in route.get("bons_de_livraison") or []:
		name = row.bon_de_livraison
		if name and name not in seen:
			seen.add(name)
			names.append(name)
	return names


def _sales_order_item_names_for_delivery(dn, route) -> list[str]:
	"""Lignes de commande liées au BL, y compris celles retirées (qty livrée = 0)."""
	names: list[str] = []
	seen: set[str] = set()
	pick_lists: set[str] = set()
	for item in dn.items or []:
		so_detail = item.get("so_detail")
		if so_detail and so_detail not in seen:
			seen.add(so_detail)
			names.append(so_detail)
		pick_list = item.get("against_pick_list")
		if pick_list:
			pick_lists.add(pick_list)
	item_codes = {
		line.item_code
		for line in (route.get("lignes_chargement") or [])
		if line.delivery_note == dn.name
	}
	if pick_lists:
		filters: dict[str, Any] = {"parent": ["in", list(pick_lists)]}
		if item_codes:
			filters["item_code"] = ["in", list(item_codes)]
		for row in frappe.get_all("Pick List Item", filters=filters, fields=["sales_order_item"]):
			so_detail = row.sales_order_item
			if so_detail and so_detail not in seen:
				seen.add(so_detail)
				names.append(so_detail)
	return names


def _realign_sales_order_picked_qty(dn, route):
	"""picked_qty = delivered_qty (stock) pour que la commande redevienne prélevable."""
	so_item_names = _sales_order_item_names_for_delivery(dn, route)
	if not so_item_names:
		return
	rows = frappe.get_all(
		"Sales Order Item",
		filters={"name": ["in", so_item_names]},
		fields=["name", "parent"],
	)
	by_parent: dict[str, list[str]] = {}
	for row in rows:
		by_parent.setdefault(row.parent, []).append(row.name)
	for so_name, item_names in by_parent.items():
		so = frappe.get_doc("Sales Order", so_name)
		wanted = set(item_names)
		for item in so.items:
			if item.name not in wanted:
				continue
			item.picked_qty = flt(item.delivered_qty) * flt(item.conversion_factor or 1)
			item.db_set("picked_qty", item.picked_qty, update_modified=False)
		so.update_picking_status()


def _cancel_failed_draft_delivery_note(dn):
	"""Retire le BL d'échec total de la file de planification, sans soumettre (pas de mouvement de stock)."""
	frappe.db.set_value(
		"Delivery Note",
		dn.name,
		{
			"custom_statut": "Annulé",
			"custom_statut_planification": "Terminé",
		},
	)
	dn.custom_statut = "Annulé"
	dn.custom_statut_planification = "Terminé"


def _settle_delivery_notes_after_return(route):
	for name in _delivery_note_names_on_route(route):
		if not frappe.db.exists("Delivery Note", name):
			continue
		dn = frappe.get_doc("Delivery Note", name)
		_realign_sales_order_picked_qty(dn, route)
		if dn.docstatus == 0 and dn.get("custom_statut") == "Non Livré":
			_cancel_failed_draft_delivery_note(dn)


def confirm_route_return(route, counted_lines: list[dict[str, Any]]) -> dict[str, Any]:
	if route.get("stock_entry_retour") and frappe.db.get_value("Stock Entry", route.stock_entry_retour, "docstatus") == 1:
		return {"success": True, "stock": route_stock_summary(route)}
	if complete_empty_route_return(route):
		return {"success": True, "stock": route_stock_summary(route), "stockEntry": None}
	if route.get("statut_chargement") not in {"Retour déclaré", "Exception"}:
		frappe.throw(_("Le livreur doit d'abord déclarer son retour."))

	counted = {str(row.get("lineName")): flt(row.get("quantity")) for row in counted_lines or []}
	differences = []
	for line in route.get("lignes_chargement") or []:
		expected = _line_remaining(line)
		actual = counted.get(line.name, 0)
		if abs(expected - actual) > 0.000001:
			differences.append({"lineName": line.name, "itemCode": line.item_code, "expected": expected, "counted": actual})
	if differences:
		route.statut_chargement = "Exception"
		route.save(ignore_permissions=True)
		_create_distribution_exception(
			route,
			route.bons_de_livraison[0].bon_de_livraison,
			"Retour de stock",
			_("Le comptage du retour ne correspond pas au reliquat attendu."),
		)
		return {"success": False, "differences": differences, "stock": route_stock_summary(route)}

	warehouse = _return_warehouse()
	company = frappe.db.get_value("Warehouse", warehouse, "company")
	rows = []
	for line in route.get("lignes_chargement") or []:
		qty = _line_remaining(line)
		if qty <= 0:
			continue
		rows.append(
			{
				"item_code": line.item_code,
				"qty": qty,
				"uom": line.uom,
				"stock_uom": line.stock_uom,
				"conversion_factor": line.conversion_factor or 1,
				"source_warehouse": line.vehicle_warehouse,
				"target_warehouse": warehouse,
				"batch_no": line.batch_no,
				"serial_no": line.serial_no,
			}
		)
	entry = _submit_material_transfer(
		company,
		_("Retour de la tournée {0} depuis le véhicule {1}").format(route.name, route.vehicule),
		rows,
	)

	for line in route.get("lignes_chargement") or []:
		qty = _line_remaining(line)
		line.returned_qty = flt(line.returned_qty) + qty
		line.return_warehouse = warehouse

	_settle_delivery_notes_after_return(route)

	route.stock_entry_retour = entry.name if entry else None
	route.statut_chargement = "Retourné"
	route.date_confirmation_retour = now_datetime()
	route.retour_confirme_par = frappe.session.user
	route.etat_planification = "Contrôle caisse"
	refresh_route_stock_totals(route)
	_sync_cash_status_after_return(route)
	for exception in frappe.get_all(
		"Exception Distribution",
		filters={"tournee": route.name, "type_exception": "Retour de stock", "statut": ["in", ["Ouverte", "En traitement"]]},
		pluck="name",
	):
		frappe.db.set_value(
			"Exception Distribution",
			exception,
			{
				"statut": "Résolue",
				"resolution": _("Retour recompté et transféré intégralement."),
				"resolue_par": frappe.session.user,
				"date_resolution": now_datetime(),
			},
		)
	route.save(ignore_permissions=True)
	return {"success": True, "stock": route_stock_summary(route), "stockEntry": entry.name if entry else None}


RETURN_HISTORY_STATUSES = ("Retour requis", "Retour déclaré", "Exception", "Retourné")
RETURN_HISTORY_STATUS_RANK = {
	"Retour déclaré": 0,
	"Exception": 1,
	"Retour requis": 2,
	"Retourné": 3,
}


def list_return_history(date_from=None, date_to=None) -> list[dict[str, Any]]:
	"""Tournées avec reliquat à contrôler ou quantités déjà retournées, sans sérialiser la tournée complète."""
	start = getdate(date_from or add_days(today(), -30))
	end = getdate(date_to or today())
	routes = frappe.get_all(
		"Livraison",
		filters={
			"date_liv": ["between", [start, end]],
			"statut_chargement": ["in", list(RETURN_HISTORY_STATUSES)],
		},
		or_filters={
			"total_quantite_restante": [">", 0],
			"total_quantite_retournee": [">", 0],
		},
		fields=[
			"name",
			"date_liv",
			"livreur",
			"nom_livreur",
			"vehicule",
			"statut_chargement",
			"revision",
			"date_declaration_retour",
			"date_confirmation_retour",
			"stock_entry_retour",
			"total_quantite_chargee",
			"total_quantite_livree",
			"total_quantite_restante",
			"total_quantite_retournee",
		],
	)
	if not routes:
		return []

	names = [row.name for row in routes]
	lines = frappe.get_all(
		"Ligne Chargement Tournee",
		filters={"parent": ["in", names]},
		fields=[
			"name",
			"parent",
			"delivery_note",
			"delivery_note_item",
			"residual_delivery_note",
			"item_code",
			"item_name",
			"batch_no",
			"source_warehouse",
			"vehicle_warehouse",
			"return_warehouse",
			"loaded_qty",
			"delivered_qty",
			"returned_qty",
			"uom",
		],
		order_by="idx asc",
	)
	delivery_notes = {line.delivery_note for line in lines if line.delivery_note}
	customers_by_dn: dict[str, dict[str, str]] = {}
	if delivery_notes:
		for note in frappe.get_all(
			"Delivery Note",
			filters={"name": ["in", list(delivery_notes)]},
			fields=["name", "customer", "customer_name"],
		):
			customers_by_dn[note.name] = {
				"name": note.customer or "",
				"customerName": note.customer_name or note.customer or "",
			}

	vehicle_ids = {row.vehicule for row in routes if row.vehicule}
	vehicle_labels: dict[str, str] = {}
	if vehicle_ids:
		for vehicle in frappe.get_all(
			"Vehicule",
			filters={"name": ["in", list(vehicle_ids)]},
			fields=["name", "nom", "immatriculation"],
		):
			vehicle_labels[vehicle.name] = (
				" · ".join(filter(None, [vehicle.nom, vehicle.immatriculation])) or vehicle.name
			)

	lines_by_parent: dict[str, list[Any]] = {}
	for line in lines:
		lines_by_parent.setdefault(line.parent, []).append(line)

	rows: list[dict[str, Any]] = []
	for route in routes:
		customers: list[dict[str, str]] = []
		seen_customers: set[str] = set()
		serialized_lines = []
		for line in lines_by_parent.get(route.name, []):
			customer = customers_by_dn.get(line.delivery_note) or {}
			customer_id = customer.get("name") or ""
			if customer_id and customer_id not in seen_customers:
				seen_customers.add(customer_id)
				customers.append(customer)
			serialized_lines.append(
				{
					"name": line.name,
					"deliveryNote": line.delivery_note,
					"deliveryNoteItem": line.delivery_note_item,
					"residualDeliveryNote": line.residual_delivery_note,
					"itemCode": line.item_code,
					"itemName": line.item_name,
					"batchNo": line.batch_no,
					"sourceWarehouse": line.source_warehouse,
					"vehicleWarehouse": line.vehicle_warehouse,
					"returnWarehouse": line.return_warehouse,
					"loadedQuantity": flt(line.loaded_qty),
					"deliveredQuantity": flt(line.delivered_qty),
					"remainingQuantity": _line_remaining(line),
					"returnedQuantity": flt(line.returned_qty),
					"uom": line.uom,
					"customer": customer.get("name") or None,
					"customerName": customer.get("customerName") or None,
				}
			)
		rows.append(
			{
				"name": route.name,
				"date": str(route.date_liv) if route.date_liv else "",
				"declaredAt": str(route.date_declaration_retour or "") or None,
				"confirmedAt": str(route.date_confirmation_retour or "") or None,
				"revision": max(cint(route.revision), 1),
				"driver": route.livreur,
				"driverName": route.nom_livreur,
				"vehicle": route.vehicule,
				"vehicleLabel": vehicle_labels.get(route.vehicule) or route.vehicule,
				"customers": customers,
				"status": route.statut_chargement,
				"remainingQuantity": flt(route.total_quantite_restante),
				"returnedQuantity": flt(route.total_quantite_retournee),
				"loadedQuantity": flt(route.total_quantite_chargee),
				"deliveredQuantity": flt(route.total_quantite_livree),
				"returnStockEntry": route.stock_entry_retour,
				"lines": serialized_lines,
			}
		)

	rows.sort(key=lambda row: row["name"])
	rows.sort(key=lambda row: row["date"] or "", reverse=True)
	rows.sort(key=lambda row: RETURN_HISTORY_STATUS_RANK.get(row["status"], 9))
	return rows


def return_control_metrics(days: int = 30) -> dict[str, Any]:
	"""Agrégats 30 jours de l’onglet Retours : déclarations, écarts, délai moyen."""
	window = max(1, min(cint(days) or 30, 90))
	start = add_days(now_datetime(), -window)
	declared = 0
	average = None
	if frappe.db.has_column("Livraison", "date_declaration_retour"):
		fields = ["date_declaration_retour"]
		if frappe.db.has_column("Livraison", "date_confirmation_retour"):
			fields.append("date_confirmation_retour")
		rows = frappe.get_all(
			"Livraison",
			filters={"date_declaration_retour": [">=", start]},
			fields=fields,
		)
		declared = len(rows)
		delays: list[float] = []
		for row in rows:
			declared_raw = row.get("date_declaration_retour")
			confirmed_raw = row.get("date_confirmation_retour")
			if not declared_raw or not confirmed_raw:
				continue
			declared_at = get_datetime(declared_raw)
			confirmed_at = get_datetime(confirmed_raw)
			if not declared_at or not confirmed_at:
				continue
			minutes = (confirmed_at - declared_at).total_seconds() / 60
			if minutes >= 0:
				delays.append(minutes)
		if delays:
			average = cint(round(sum(delays) / len(delays)))

	discrepancies = 0
	if frappe.db.table_exists("tabException Distribution"):
		discrepancies = cint(
			frappe.db.count(
				"Exception Distribution",
				{"type_exception": "Retour de stock", "date_signalement": [">=", start]},
			)
		)

	return {
		"declared": declared,
		"discrepancies": discrepancies,
		"averageControlDelay": average,
		"days": window,
	}
