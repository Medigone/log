"""Journalisation des événements promotionnels du portail client."""

from __future__ import annotations

from hashlib import sha256

import frappe
from frappe import _
from frappe.utils import add_days, cstr, now_datetime, today

ALLOWED_EVENTS = {"view_promotion", "select_promotion", "add_to_cart"}
RETENTION_DAYS = 90


def impression_key(customer: str, campaign: str, event_type: str, placement: str, day: str | None = None) -> str:
	raw = "|".join([cstr(customer), cstr(campaign), cstr(event_type), cstr(placement or ""), cstr(day or today())])
	return sha256(raw.encode("utf-8")).hexdigest()


def log_event(
	*,
	customer: str,
	event_type: str,
	campaign: str,
	placement: str | None = None,
	item_code: str | None = None,
) -> dict[str, bool]:
	event_type = cstr(event_type).strip()
	campaign = cstr(campaign).strip()
	if event_type not in ALLOWED_EVENTS:
		frappe.throw(_("Type d'événement promotionnel invalide."))
	if not campaign or not frappe.db.exists("Campagne Portail", campaign):
		frappe.throw(_("Campagne introuvable."))
	key = impression_key(customer, campaign, event_type, cstr(placement), today() if event_type == "view_promotion" else None)
	if event_type == "view_promotion" and frappe.db.exists("Evenement Promotion Portail", {"impression_key": key}):
		return {"recorded": False, "duplicate": True}
	if event_type != "view_promotion":
		key = f"{key}:{frappe.generate_hash(length=10)}"
	doc = frappe.get_doc(
		{
			"doctype": "Evenement Promotion Portail",
			"event_type": event_type,
			"campaign": campaign,
			"placement": cstr(placement) or None,
			"item_code": cstr(item_code) or None,
			"customer": customer,
			"impression_key": key[:140],
		}
	)
	doc.insert(ignore_permissions=True)
	return {"recorded": True, "duplicate": False}


def purge_old_events(days: int = RETENTION_DAYS) -> int:
	cutoff = add_days(now_datetime(), -abs(days))
	names = frappe.get_all(
		"Evenement Promotion Portail",
		filters={"creation": ["<", cutoff]},
		pluck="name",
	)
	for name in names:
		frappe.delete_doc("Evenement Promotion Portail", name, ignore_permissions=True, force=True)
	return len(names)
