"""Solde permanent de caisse par livreur."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import flt, now_datetime

ENCAISSEMENT = "Encaissement"
REMISE = "Remise"
AVANCE = "Avance"
AJUSTEMENT = "Ajustement"
ADJUSTMENT_TYPES = {REMISE, AVANCE, AJUSTEMENT}


def signed_amount(movement_type: str, amount: float) -> float:
	value = flt(amount)
	if movement_type == REMISE:
		return -abs(value)
	if movement_type in {AVANCE, ENCAISSEMENT}:
		return abs(value)
	return value


def should_post_route_return(route, counted_cash: float = 0) -> bool:
	if route.get("statut_caisse") != "Validée" or not route.get("livreur"):
		return False
	# Zero counted cash is allowed so an approved discrepancy can reverse declared cash.
	return counted_cash is not None


def count_difference_reason(route_name: str) -> str:
	return _("Écart de comptage au retour {0}").format(route_name)


def handover_reason(route_name: str) -> str:
	return _("Remise caisse tournée {0}").format(route_name)


def ensure_cash_box(livreur: str) -> str:
	if not livreur:
		frappe.throw(_("Un livreur est obligatoire pour ouvrir une caisse."))
	existing = frappe.db.get_value("Caisse Livreur", {"livreur": livreur}, "name")
	if existing:
		return existing
	doc = frappe.get_doc(
		{
			"doctype": "Caisse Livreur",
			"livreur": livreur,
			"nom_livreur": frappe.db.get_value("Livreur", livreur, "nom"),
			"solde": 0,
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def serialize_movement(row) -> dict[str, Any]:
	return {
		"name": row.name,
		"type": row.type_mouvement,
		"amount": flt(row.montant),
		"balanceAfter": flt(row.solde_apres),
		"routeId": row.tournee or None,
		"reason": row.motif or None,
		"date": str(row.date or "") or None,
	}


def serialize_cash_box(doc, *, movements: list | None = None) -> dict[str, Any]:
	payload = {
		"name": doc.name,
		"driver": doc.livreur,
		"driverName": doc.nom_livreur or doc.livreur,
		"balance": flt(doc.solde),
		"updatedAt": str(doc.date_derniere_maj or "") or None,
	}
	if movements is not None:
		payload["movements"] = [serialize_movement(row) for row in movements]
	return payload


def post_movement(
	*,
	livreur: str,
	movement_type: str,
	amount: float,
	tournee: str | None = None,
	motif: str | None = None,
	paiement: str | None = None,
) -> dict[str, Any]:
	cash_box_name = ensure_cash_box(livreur)
	frappe.db.sql("SELECT name FROM `tabCaisse Livreur` WHERE name = %s FOR UPDATE", (cash_box_name,))
	cash_box = frappe.get_doc("Caisse Livreur", cash_box_name)
	signed = signed_amount(movement_type, amount)
	new_balance = flt(cash_box.solde) + signed
	movement = frappe.get_doc(
		{
			"doctype": "Mouvement Caisse Livreur",
			"caisse": cash_box.name,
			"livreur": livreur,
			"type_mouvement": movement_type,
			"montant": signed,
			"solde_apres": new_balance,
			"tournee": tournee or None,
			"paiement": paiement or None,
			"motif": motif or None,
			"date": now_datetime(),
		}
	)
	movement.insert(ignore_permissions=True)
	cash_box.solde = new_balance
	cash_box.date_derniere_maj = now_datetime()
	cash_box.nom_livreur = cash_box.nom_livreur or frappe.db.get_value("Livreur", livreur, "nom")
	cash_box.save(ignore_permissions=True)
	return serialize_cash_box(cash_box, movements=[movement])


def mark_route_pending_cash_control(route) -> None:
	current = route.get("statut_caisse") or "Sans encaissement"
	name = route.get("name")
	if not name or current != "Sans encaissement":
		return
	frappe.db.set_value("Livraison", name, "statut_caisse", "À contrôler", update_modified=False)
	route.statut_caisse = "À contrôler"


def post_declared_cash(payment, route) -> dict[str, Any] | None:
	if payment.get("moyen_paiement") != "Espèce":
		return None
	if payment.get("statut_controle") == "Annulé":
		return None
	livreur = route.get("livreur")
	payment_name = payment.get("name")
	if not livreur or not payment_name:
		return None
	amount = flt(payment.get("montant"))
	if abs(amount) < 0.000001:
		return None
	existing = frappe.db.exists(
		"Mouvement Caisse Livreur",
		{"paiement": payment_name, "type_mouvement": ENCAISSEMENT},
	)
	if existing:
		return None
	return post_movement(
		livreur=livreur,
		movement_type=ENCAISSEMENT,
		amount=amount,
		tournee=route.get("name") or payment.get("livraison"),
		motif=_("Encaissement {0}").format(payment_name),
		paiement=payment_name,
	)


def sync_route_declared_cash(route) -> None:
	if not route.get("name"):
		return
	payments = frappe.get_all(
		"Paiement Client",
		filters={"livraison": route.name, "statut_controle": ["!=", "Annulé"]},
		fields=["name", "montant", "moyen_paiement", "statut_controle", "livraison"],
	)
	if payments:
		mark_route_pending_cash_control(route)
	for payment in payments:
		post_declared_cash(payment, route)


def sync_driver_declared_cash(livreur: str) -> None:
	if not livreur:
		return
	routes = frappe.get_all(
		"Livraison",
		filters={"livreur": livreur},
		fields=["name", "livreur", "statut_caisse"],
	)
	for route in routes:
		sync_route_declared_cash(route)


def sync_all_declared_cash() -> None:
	for name in frappe.get_all("Livreur", pluck="name"):
		sync_driver_declared_cash(name)


def _encaissement_total(route_name: str) -> float:
	if not route_name:
		return 0.0
	rows = frappe.get_all(
		"Mouvement Caisse Livreur",
		filters={"tournee": route_name, "type_mouvement": ENCAISSEMENT},
		fields=["montant"],
	)
	return round(sum(flt(row.montant) for row in rows), 2)


def _has_encaissement(route_name: str) -> bool:
	if not route_name:
		return False
	return bool(
		frappe.db.exists(
			"Mouvement Caisse Livreur",
			{"tournee": route_name, "type_mouvement": ENCAISSEMENT},
		)
	)


def _has_route_handover(route_name: str) -> bool:
	if not route_name:
		return False
	return bool(
		frappe.db.exists(
			"Mouvement Caisse Livreur",
			{"tournee": route_name, "type_mouvement": REMISE, "motif": handover_reason(route_name)},
		)
	)


def _has_count_adjustment(route_name: str) -> bool:
	if not route_name:
		return False
	return bool(
		frappe.db.exists(
			"Mouvement Caisse Livreur",
			{"tournee": route_name, "type_mouvement": AJUSTEMENT, "motif": count_difference_reason(route_name)},
		)
	)


def post_route_return_cash(route, counted_cash: float) -> dict[str, Any] | None:
	if not should_post_route_return(route, counted_cash):
		return None
	sync_route_declared_cash(route)
	collected = _encaissement_total(route.name)
	if collected <= 0 and not _has_encaissement(route.name):
		return None

	result = None
	difference = flt(counted_cash) - collected
	if abs(difference) >= 0.000001 and not _has_count_adjustment(route.name):
		result = post_movement(
			livreur=route.livreur,
			movement_type=AJUSTEMENT,
			amount=difference,
			tournee=route.name,
			motif=count_difference_reason(route.name),
		)

	handover_amount = flt(counted_cash)
	if abs(handover_amount) < 0.000001 or _has_route_handover(route.name):
		return result
	return post_movement(
		livreur=route.livreur,
		movement_type=REMISE,
		amount=handover_amount,
		tournee=route.name,
		motif=handover_reason(route.name),
	)


def list_cash_boxes() -> list[dict[str, Any]]:
	drivers = frappe.get_all("Livreur", fields=["name", "nom", "active"], order_by="nom asc")
	for driver in drivers:
		sync_driver_declared_cash(driver.name)
	boxes = {
		row.livreur: row
		for row in frappe.get_all(
			"Caisse Livreur",
			fields=["name", "livreur", "nom_livreur", "solde", "date_derniere_maj"],
		)
	}
	payload = []
	for driver in drivers:
		box = boxes.get(driver.name)
		if not box:
			ensure_cash_box(driver.name)
			box = frappe.db.get_value(
				"Caisse Livreur",
				{"livreur": driver.name},
				["name", "livreur", "nom_livreur", "solde", "date_derniere_maj"],
				as_dict=True,
			)
		payload.append(
			{
				"name": box.name,
				"driver": driver.name,
				"driverName": box.nom_livreur or driver.nom or driver.name,
				"balance": flt(box.solde),
				"updatedAt": str(box.date_derniere_maj or "") or None,
				"active": bool(driver.active),
			}
		)
	return payload


def get_cash_box(livreur: str) -> dict[str, Any]:
	if not livreur or not frappe.db.exists("Livreur", livreur):
		frappe.throw(_("Livreur introuvable."))
	sync_driver_declared_cash(livreur)
	name = ensure_cash_box(livreur)
	doc = frappe.get_doc("Caisse Livreur", name)
	movements = frappe.get_all(
		"Mouvement Caisse Livreur",
		filters={"caisse": name},
		fields=["name", "type_mouvement", "montant", "solde_apres", "tournee", "motif", "date"],
		order_by="date desc, creation desc",
		limit=200,
	)
	return serialize_cash_box(doc, movements=movements)


def post_adjustment(livreur: str, movement_type: str, amount: float, motif: str, tournee: str | None = None) -> dict[str, Any]:
	if movement_type not in ADJUSTMENT_TYPES:
		frappe.throw(_("Le type de mouvement {0} n'est pas autorisé.").format(movement_type))
	reason = str(motif or "").strip()
	if not reason:
		frappe.throw(_("Un motif est obligatoire."))
	value = flt(amount)
	if movement_type != AJUSTEMENT and abs(value) < 0.000001:
		frappe.throw(_("Le montant doit être renseigné."))
	if movement_type == AJUSTEMENT and abs(value) < 0.000001:
		frappe.throw(_("Le montant de l'ajustement ne peut pas être nul."))
	if not livreur or not frappe.db.exists("Livreur", livreur):
		frappe.throw(_("Livreur introuvable."))
	return post_movement(
		livreur=livreur,
		movement_type=movement_type,
		amount=value,
		tournee=tournee,
		motif=reason,
	)
