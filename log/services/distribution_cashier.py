"""Contrôle de caisse et création des Payment Entry ERPNext."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import flt, getdate, now_datetime, today


def _mode_of_payment(payment) -> str:
	return "Espèces" if payment.moyen_paiement == "Espèce" else "Chèque"


def _payment_account(mode_of_payment: str, company: str) -> str:
	account = frappe.db.get_value(
		"Mode of Payment Account",
		{"parent": mode_of_payment, "company": company},
		"default_account",
	)
	if not account:
		frappe.throw(
			_("Configurez un compte par défaut pour le mode de paiement {0} et la société {1}.").format(
				mode_of_payment, company
			)
		)
	return account


def outstanding_invoices(customer: str, company: str, currency: str = "DZD") -> list[dict[str, Any]]:
	return [
		{
			"name": row.name,
			"postingDate": str(row.posting_date),
			"dueDate": str(row.due_date or "") or None,
			"grandTotal": flt(row.grand_total),
			"outstandingAmount": flt(row.outstanding_amount),
			"currency": row.currency,
		}
		for row in frappe.get_all(
			"Sales Invoice",
			filters={
				"customer": customer,
				"company": company,
				"currency": currency,
				"docstatus": 1,
				"outstanding_amount": [">", 0],
			},
			fields=["name", "posting_date", "due_date", "grand_total", "outstanding_amount", "currency"],
			order_by="due_date asc, posting_date asc, creation asc",
		)
	]


def _suggested_allocations(payment) -> list[dict[str, Any]]:
	company, currency = frappe.db.get_value(
		"Delivery Note", payment.bon_livraison, ["company", "currency"]
	) or (None, "DZD")
	remaining = flt(payment.montant)
	rows = []
	invoices = outstanding_invoices(payment.client, company, currency or "DZD")
	invoices.sort(key=lambda invoice: 0 if invoice["name"] == payment.get("facture_source") else 1)
	for invoice in invoices:
		if remaining <= 0:
			break
		allocated = min(remaining, invoice["outstandingAmount"])
		rows.append({**invoice, "allocatedAmount": allocated})
		remaining -= allocated
	return rows


def serialize_payment(payment) -> dict[str, Any]:
	allocations = [
		{
			"salesInvoice": row.sales_invoice,
			"dueDate": str(row.due_date or "") or None,
			"outstandingBefore": flt(row.outstanding_before),
			"allocatedAmount": flt(row.allocated_amount),
		}
		for row in payment.get("affectations") or []
	]
	if not allocations and payment.get("statut_controle") not in {"Validé", "Annulé"}:
		allocations = [
			{
				"salesInvoice": row["name"],
				"dueDate": row["dueDate"],
				"outstandingBefore": row["outstandingAmount"],
				"allocatedAmount": row["allocatedAmount"],
			}
			for row in _suggested_allocations(payment)
		]
	return {
		"name": payment.name,
		"deliveryNote": payment.bon_livraison,
		"salesInvoice": payment.get("facture_source"),
		"customer": payment.client,
		"customerName": payment.nom_client,
		"method": payment.moyen_paiement,
		"amount": flt(payment.montant),
		"countedAmount": flt(payment.get("montant_compte")),
		"status": payment.get("statut_controle") or "Déclaré",
		"chequeNumber": payment.get("numero_cheque"),
		"chequeDate": str(payment.get("date_encaissement") or "") or None,
		"chequePhoto": payment.get("photo_cheque"),
		"paymentEntry": payment.get("payment_entry"),
		"allocations": allocations,
		"unallocatedAmount": max(flt(payment.montant) - sum(row["allocatedAmount"] for row in allocations), 0),
	}


def reconciliation(route) -> dict[str, Any]:
	payments = [
		frappe.get_doc("Paiement Client", row.name)
		for row in frappe.get_all(
			"Paiement Client",
			filters={"livraison": route.name, "statut_controle": ["!=", "Annulé"]},
			fields=["name"],
			order_by="creation asc",
		)
	]
	serialized = [serialize_payment(payment) for payment in payments]
	cash = sum(row["amount"] for row in serialized if row["method"] == "Espèce")
	cheques = sum(row["amount"] for row in serialized if row["method"] == "Chèque")
	validated = sum(row["amount"] for row in serialized if row["status"] == "Validé")
	return {
		"routeId": route.name,
		"routeLifecycle": route.etat_planification,
		"status": route.get("statut_caisse") or ("À contrôler" if payments else "Sans encaissement"),
		"declaredCash": cash,
		"declaredCheques": cheques,
		"declaredTotal": cash + cheques,
		"countedTotal": flt(route.get("total_encaisse_compte")),
		"validatedTotal": validated,
		"payments": serialized,
		"discrepancyReason": route.get("motif_ecart_caisse"),
	}


def _validate_allocations(payment, requested: list[dict[str, Any]]) -> list[dict[str, Any]]:
	company, currency = frappe.db.get_value(
		"Delivery Note", payment.bon_livraison, ["company", "currency"]
	) or (None, "DZD")
	seen = set()
	validated = []
	allocated_total = 0.0
	for row in requested or []:
		invoice_name = str(row.get("salesInvoice") or "").strip()
		amount = flt(row.get("allocatedAmount"))
		if not invoice_name or amount <= 0 or invoice_name in seen:
			frappe.throw(_("Les affectations de l'encaissement {0} sont invalides.").format(payment.name))
		seen.add(invoice_name)
		invoice = frappe.db.get_value(
			"Sales Invoice",
			invoice_name,
			["customer", "company", "currency", "outstanding_amount", "due_date", "docstatus"],
			as_dict=True,
		)
		if not invoice or invoice.docstatus != 1:
			frappe.throw(_("La facture {0} n'est pas validée.").format(invoice_name))
		if invoice.customer != payment.client or invoice.company != company or invoice.currency != currency:
			frappe.throw(_("La facture {0} n'appartient pas au même client, société et devise.").format(invoice_name))
		if amount - flt(invoice.outstanding_amount) > 0.000001:
			frappe.throw(_("L'affectation dépasse le solde de la facture {0}.").format(invoice_name))
		allocated_total += amount
		validated.append(
			{
				"salesInvoice": invoice_name,
				"dueDate": invoice.due_date,
				"outstandingBefore": flt(invoice.outstanding_amount),
				"allocatedAmount": amount,
			}
		)
	if allocated_total - flt(payment.montant) > 0.000001:
		frappe.throw(_("Les affectations dépassent le montant encaissé."))
	if payment.get("facture_source"):
		source_outstanding = flt(
			frappe.db.get_value("Sales Invoice", payment.facture_source, "outstanding_amount")
		)
		required_source_allocation = min(flt(payment.montant), source_outstanding)
		actual_source_allocation = sum(
			row["allocatedAmount"] for row in validated if row["salesInvoice"] == payment.facture_source
		)
		if abs(actual_source_allocation - required_source_allocation) > 0.000001:
			frappe.throw(
				_("Affectez d'abord {0} à la facture {1} issue du bon de livraison.").format(
					required_source_allocation, payment.facture_source
				)
			)
	return validated


def _create_payment_entry(payment, allocations: list[dict[str, Any]]) -> str:
	if payment.get("payment_entry"):
		return payment.payment_entry
	if not payment.get("facture_source"):
		frappe.throw(_("La facture du bon {0} doit être créée avant le contrôle de caisse.").format(payment.bon_livraison))
	invoice = frappe.get_doc("Sales Invoice", payment.facture_source)
	mode = _mode_of_payment(payment)
	account = _payment_account(mode, invoice.company)

	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	entry = get_payment_entry(
		"Sales Invoice",
		invoice.name,
		party_amount=flt(payment.montant),
		bank_account=account,
		bank_amount=flt(payment.montant),
		reference_date=getdate(payment.date_encaissement or today()),
	)
	entry.mode_of_payment = mode
	entry.paid_amount = flt(payment.montant)
	entry.received_amount = flt(payment.montant)
	entry.reference_no = payment.numero_cheque if mode == "Chèque" else payment.request_id or payment.name
	entry.reference_date = getdate(payment.date_encaissement or payment.date or today())
	entry.set("references", [])
	for row in allocations:
		entry.append(
			"references",
			{
				"reference_doctype": "Sales Invoice",
				"reference_name": row["salesInvoice"],
				"due_date": row["dueDate"],
				"total_amount": row["outstandingBefore"],
				"outstanding_amount": row["outstandingBefore"],
				"allocated_amount": row["allocatedAmount"],
			},
		)
	entry.flags.ignore_permissions = True
	entry.insert(ignore_permissions=True)
	entry.submit()
	return entry.name


def _create_cash_exception(route, reason: str):
	existing = frappe.db.exists(
		"Exception Distribution",
		{"tournee": route.name, "type_exception": "Écart de caisse", "statut": ["in", ["Ouverte", "En traitement"]]},
	)
	if existing:
		return existing
	first_dn = route.bons_de_livraison[0].bon_de_livraison
	return frappe.get_doc(
		{
			"doctype": "Exception Distribution",
			"statut": "Ouverte",
			"type_exception": "Écart de caisse",
			"priorite": "Haute",
			"date_signalement": now_datetime(),
			"signalee_par": frappe.session.user,
			"bon_de_livraison": first_dn,
			"tournee": route.name,
			"livreur": route.livreur,
			"vehicule": route.vehicule,
			"description": reason,
		}
	).insert(ignore_permissions=True).name


def validate_reconciliation(route, payload: dict[str, Any], *, approved_by_responsible: bool = False) -> dict[str, Any]:
	if route.get("statut_chargement") != "Retourné":
		frappe.throw(_("Le retour de stock doit être confirmé avant le contrôle de caisse."))
	current = reconciliation(route)
	if current["status"] == "Validée":
		return current

	counted_cash = flt(payload.get("countedCash"))
	payment_inputs = {str(row.get("paymentId")): row for row in payload.get("payments") or []}
	counted_cheques = 0.0
	cheque_mismatch = False
	for payment in current["payments"]:
		if payment["method"] != "Chèque":
			continue
		row = payment_inputs.get(payment["name"], {})
		if not str(row.get("chequeNumber") or payment.get("chequeNumber") or "").strip():
			frappe.throw(_("Le numéro du chèque {0} est obligatoire.").format(payment["name"]))
		counted_amount = flt(row.get("countedAmount", payment["amount"]))
		counted_cheques += counted_amount
		cheque_mismatch = cheque_mismatch or abs(counted_amount - flt(payment["amount"])) > 0.000001

	difference = counted_cash + counted_cheques - current["declaredTotal"]
	if (abs(difference) > 0.000001 or cheque_mismatch) and not approved_by_responsible:
		reason = str(payload.get("reason") or "").strip()
		if not reason:
			frappe.throw(_("Un motif est obligatoire pour l'écart de caisse."))
		route.statut_caisse = "Écart"
		route.total_encaisse_compte = counted_cash + counted_cheques
		route.motif_ecart_caisse = reason
		for payment in frappe.get_all("Paiement Client", filters={"livraison": route.name}, pluck="name"):
			frappe.db.set_value("Paiement Client", payment, "statut_controle", "Écart", update_modified=False)
		_create_cash_exception(route, reason)
		route.save(ignore_permissions=True)
		return {**reconciliation(route), "requiresManagerApproval": True}

	for payment_name, row in payment_inputs.items():
		frappe.db.sql("SELECT name FROM `tabPaiement Client` WHERE name = %s FOR UPDATE", (payment_name,))
		payment = frappe.get_doc("Paiement Client", payment_name)
		if payment.livraison != route.name:
			frappe.throw(_("L'encaissement {0} n'appartient pas à cette tournée.").format(payment.name))
		if payment.statut_controle == "Validé" and payment.payment_entry:
			continue
		counted_amount = flt(row.get("countedAmount", payment.montant)) if payment.moyen_paiement == "Chèque" else flt(payment.montant)
		if abs(counted_amount - flt(payment.montant)) > 0.000001 and not approved_by_responsible:
			frappe.throw(_("Un écart de caisse doit être approuvé par un Responsable."))
		if payment.moyen_paiement == "Chèque":
			payment.numero_cheque = str(row.get("chequeNumber") or payment.numero_cheque or "").strip()
		allocations = _validate_allocations(payment, row.get("allocations") or [])
		entry_name = _create_payment_entry(payment, allocations)
		payment.set("affectations", [])
		for allocation in allocations:
			payment.append(
				"affectations",
				{
					"sales_invoice": allocation["salesInvoice"],
					"due_date": allocation["dueDate"],
					"outstanding_before": allocation["outstandingBefore"],
					"allocated_amount": allocation["allocatedAmount"],
				},
			)
		payment.montant_compte = counted_amount
		payment.payment_entry = entry_name
		payment.statut_controle = "Validé"
		payment.caissier = frappe.session.user
		payment.date_controle = now_datetime()
		payment.motif_ecart = payload.get("reason") if approved_by_responsible else None
		payment.flags.ignore_permissions = True
		payment.save(ignore_permissions=True)

	route.statut_caisse = "Validée"
	route.total_encaisse_declare = current["declaredTotal"]
	route.total_encaisse_compte = counted_cash + counted_cheques
	route.total_encaisse_valide = sum(
		flt(row.montant)
		for row in frappe.get_all(
			"Paiement Client", filters={"livraison": route.name, "statut_controle": "Validé"}, fields=["montant"]
		)
	)
	route.controle_caisse_par = frappe.session.user
	route.date_controle_caisse = now_datetime()
	route.motif_ecart_caisse = payload.get("reason") if approved_by_responsible else None
	route.save(ignore_permissions=True)
	from log.services.distribution_driver_cash import post_route_return_cash

	post_route_return_cash(route, counted_cash)
	return reconciliation(route)
