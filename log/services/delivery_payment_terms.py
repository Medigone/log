# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Condition « À la livraison » : l'échéance de la commande est sa date de livraison.

ERPNext ne calcule les échéances qu'à partir de la date du document : on recale donc les
lignes de l'échéancier sur `delivery_date` (la facture, émise à la livraison, reste à 0 jour).
"""

from __future__ import annotations

from frappe.utils import getdate

ON_DELIVERY = "À la livraison"


def _due_date(doc):
	if doc.get("payment_terms_template") != ON_DELIVERY or not doc.get("delivery_date"):
		return None
	return getdate(doc.delivery_date)


def align_due_dates(doc) -> None:
	"""Document en mémoire (aperçu, brouillon) : chaque échéance prend la date de livraison."""
	due_date = _due_date(doc)
	if not due_date:
		return
	for row in doc.get("payment_schedule") or []:
		row.due_date = due_date


def on_sales_order_validate(doc, method=None):
	align_due_dates(doc)


def on_sales_order_update_after_submit(doc, method=None):
	"""Commande validée (date de livraison ou lignes modifiées) : l'échéancier n'est pas modifiable
	après validation, on écrit donc directement la nouvelle date."""
	due_date = _due_date(doc)
	if not due_date:
		return
	for row in doc.get("payment_schedule") or []:
		if row.name and getdate(row.due_date) != due_date:
			row.db_set("due_date", due_date, update_modified=False)
