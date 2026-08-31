# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Notifications in-app du portail client."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, cstr

NOTIFICATION_DOCTYPE = "Notification Portail"
PREFERENCES_DOCTYPE = "Preferences Notification Portail"

CATEGORIES = ("commandes", "livraisons", "paiements", "demandes", "promotions")
DEFAULT_PREFERENCES = {
	"commandes": 1,
	"livraisons": 1,
	"paiements": 1,
	"demandes": 1,
	"promotions": 0,
}

DELIVERY_IN_PROGRESS_STATUSES = frozenset({"Enlevé"})
DELIVERY_EVENT_STATUSES = {
	"Enlevé": "delivery_in_progress",
	"Livré": "delivered",
	"Partiellement Livré": "partially_delivered",
	"Non Livré": "not_delivered",
	"Annulé": "delivery_cancelled",
}

CLOSED_ORDER_STATUSES = frozenset({"Closed", "Clôturé"})
HELD_ORDER_STATUSES = frozenset({"On Hold", "En pause"})


def _staff_roles(user: str) -> bool:
	if user == "Administrator":
		return True
	return bool(set(frappe.get_roles(user)) & {"System Manager", "Responsable"})


def notification_query_conditions(user=None):
	user = user or frappe.session.user
	if _staff_roles(user):
		return None
	return f"`tabNotification Portail`.`for_user` = {frappe.db.escape(user)}"


def notification_has_permission(doc, user=None, permission_type=None):
	user = user or frappe.session.user
	if _staff_roles(user):
		return True
	if permission_type not in (None, "read"):
		return False
	return doc.for_user == user


def preferences_query_conditions(user=None):
	user = user or frappe.session.user
	if _staff_roles(user):
		return None
	customers = frappe.get_all(
		"Portal User",
		filters={"user": user, "parenttype": "Customer"},
		pluck="parent",
		distinct=True,
	)
	if not customers:
		return "1=0"
	escaped = ", ".join(frappe.db.escape(name) for name in customers)
	return f"`tabPreferences Notification Portail`.`customer` in ({escaped})"


def preferences_has_permission(doc, user=None, permission_type=None):
	user = user or frappe.session.user
	if _staff_roles(user):
		return True
	if permission_type not in (None, "read", "write"):
		return False
	return bool(
		frappe.db.exists(
			"Portal User",
			{"user": user, "parenttype": "Customer", "parent": doc.customer},
		)
	)


def default_preferences() -> dict[str, int]:
	return dict(DEFAULT_PREFERENCES)


def get_preference_values(customer: str) -> dict[str, int]:
	values = default_preferences()
	if not customer or not frappe.db.table_exists(PREFERENCES_DOCTYPE):
		return values
	name = frappe.db.exists(PREFERENCES_DOCTYPE, {"customer": customer})
	if not name:
		return values
	row = frappe.db.get_value(PREFERENCES_DOCTYPE, name, list(CATEGORIES), as_dict=True) or {}
	for category in CATEGORIES:
		if category in row and row.get(category) is not None:
			values[category] = 1 if cint(row.get(category)) else 0
	return values


def category_enabled(customer: str, category: str) -> bool:
	if category not in CATEGORIES:
		return False
	return cint(get_preference_values(customer).get(category)) == 1


def get_or_create_preferences(customer: str):
	name = frappe.db.exists(PREFERENCES_DOCTYPE, {"customer": customer})
	if name:
		return frappe.get_doc(PREFERENCES_DOCTYPE, name)
	doc = frappe.get_doc(
		{
			"doctype": PREFERENCES_DOCTYPE,
			"customer": customer,
			**default_preferences(),
		}
	)
	doc.insert(ignore_permissions=True)
	return doc


def portal_users_for_customer(customer: str) -> list[str]:
	if not customer:
		return []
	users = frappe.get_all(
		"Portal User",
		filters={"parent": customer, "parenttype": "Customer"},
		pluck="user",
	)
	users = [cstr(user) for user in users if user]
	if not users:
		return []
	return frappe.get_all(
		"User",
		filters={"name": ["in", users], "enabled": 1, "user_type": "Website User"},
		pluck="name",
	)


def unread_count(customer: str, user: str) -> int:
	if not customer or not user or not frappe.db.table_exists(NOTIFICATION_DOCTYPE):
		return 0
	return frappe.db.count(
		NOTIFICATION_DOCTYPE,
		{"customer": customer, "for_user": user, "read": 0},
	)


def serialize_notification(row) -> dict[str, Any]:
	return {
		"name": row.name,
		"category": row.category,
		"eventType": row.event_type,
		"title": row.title,
		"body": row.body,
		"link": row.link,
		"documentType": row.document_type,
		"documentName": row.document_name,
		"read": bool(cint(row.read)),
		"creation": cstr(row.creation),
	}


def list_notifications(
	customer: str,
	user: str,
	*,
	page: int = 1,
	page_length: int = 20,
	only_unread: bool = False,
) -> dict[str, Any]:
	filters: dict[str, Any] = {"customer": customer, "for_user": user}
	if only_unread:
		filters["read"] = 0
	rows = frappe.get_all(
		NOTIFICATION_DOCTYPE,
		filters=filters,
		fields=[
			"name",
			"category",
			"event_type",
			"title",
			"body",
			"link",
			"document_type",
			"document_name",
			"read",
			"creation",
		],
		order_by="creation desc",
		limit_start=(page - 1) * page_length,
		limit_page_length=page_length + 1,
	)
	has_next = len(rows) > page_length
	items = [serialize_notification(row) for row in rows[:page_length]]
	return {"items": items, "page": page, "pageLength": page_length, "hasNext": has_next}


def owned_notification(name: str, customer: str, user: str):
	if not name or not frappe.db.exists(NOTIFICATION_DOCTYPE, name):
		frappe.throw(_("Notification introuvable."), frappe.DoesNotExistError)
	doc = frappe.get_doc(NOTIFICATION_DOCTYPE, name)
	if doc.customer != customer or doc.for_user != user:
		frappe.throw(_("Vous n'êtes pas autorisé à consulter cette notification."), frappe.PermissionError)
	return doc


def mark_read(customer: str, user: str, name: str) -> dict[str, Any]:
	doc = owned_notification(name, customer, user)
	if not cint(doc.read):
		frappe.db.set_value(NOTIFICATION_DOCTYPE, doc.name, "read", 1)
		doc.read = 1
	return serialize_notification(doc)


def mark_all_read(customer: str, user: str) -> dict[str, Any]:
	names = frappe.get_all(
		NOTIFICATION_DOCTYPE,
		filters={"customer": customer, "for_user": user, "read": 0},
		pluck="name",
	)
	for name in names:
		frappe.db.set_value(NOTIFICATION_DOCTYPE, name, "read", 1, update_modified=False)
	return {"success": True, "unreadCount": 0}


def notify_customer(
	customer: str,
	*,
	category: str,
	event_type: str,
	title: str,
	body: str = "",
	document_type: str | None = None,
	document_name: str | None = None,
	link: str | None = None,
) -> list[str]:
	"""Crée une notification pour chaque utilisateur portail du client.

	Les erreurs sont avalées pour ne jamais bloquer le document métier.
	"""
	created: list[str] = []
	try:
		created = _deliver(
			customer,
			category=category,
			event_type=event_type,
			title=title,
			body=body,
			document_type=document_type,
			document_name=document_name,
			link=link,
		)
	except Exception:
		frappe.log_error(title="Notification portail")
	return created


def _already_notified(user: str, event_type: str, document_type: str, document_name: str) -> bool:
	if not document_type or not document_name:
		return False
	return bool(
		frappe.db.exists(
			NOTIFICATION_DOCTYPE,
			{
				"for_user": user,
				"event_type": event_type,
				"document_type": document_type,
				"document_name": document_name,
			},
		)
	)


def _deliver(
	customer: str,
	*,
	category: str,
	event_type: str,
	title: str,
	body: str = "",
	document_type: str | None = None,
	document_name: str | None = None,
	link: str | None = None,
) -> list[str]:
	if not customer or category not in CATEGORIES or not event_type or not title:
		return []
	if not category_enabled(customer, category):
		return []
	if not frappe.db.table_exists(NOTIFICATION_DOCTYPE):
		return []
	created: list[str] = []
	for user in portal_users_for_customer(customer):
		if _already_notified(user, event_type, cstr(document_type), cstr(document_name)):
			continue
		doc = frappe.get_doc(
			{
				"doctype": NOTIFICATION_DOCTYPE,
				"customer": customer,
				"for_user": user,
				"category": category,
				"event_type": event_type,
				"title": title[:140],
				"body": body or "",
				"document_type": document_type,
				"document_name": document_name,
				"link": link or "",
				"read": 0,
			}
		)
		doc.insert(ignore_permissions=True)
		created.append(doc.name)
	return created


def _safe_hook(handler):
	def wrapped(doc, method=None):
		try:
			handler(doc, method)
		except Exception:
			frappe.log_error(title="Notification portail")

	return wrapped


def _order_link(name: str) -> str:
	return f"/orders/{name}"


def _delivery_link(name: str) -> str:
	return f"/deliveries/{name}"


def _request_link(name: str) -> str:
	return f"/requests/{name}"


def _campaign_link(name: str) -> str:
	return f"/?view=offres&campaign={name}"


@_safe_hook
def on_sales_order_submit(doc, method=None):
	if not doc.customer:
		return
	notify_customer(
		doc.customer,
		category="commandes",
		event_type="order_confirmed",
		title=_("Commande validée"),
		body=_("Votre commande {0} a été validée et sera préparée.").format(doc.name),
		document_type="Sales Order",
		document_name=doc.name,
		link=_order_link(doc.name),
	)


@_safe_hook
def on_sales_order_cancel(doc, method=None):
	if not doc.customer:
		return
	notify_customer(
		doc.customer,
		category="commandes",
		event_type="order_cancelled",
		title=_("Commande annulée"),
		body=_("La commande {0} a été annulée.").format(doc.name),
		document_type="Sales Order",
		document_name=doc.name,
		link=_order_link(doc.name),
	)


@_safe_hook
def on_sales_order_update_after_submit(doc, method=None):
	if not doc.customer or not doc.has_value_changed("status"):
		return
	status = cstr(doc.status)
	if status in CLOSED_ORDER_STATUSES:
		notify_customer(
			doc.customer,
			category="commandes",
			event_type="order_closed",
			title=_("Commande clôturée"),
			body=_("La commande {0} a été clôturée.").format(doc.name),
			document_type="Sales Order",
			document_name=doc.name,
			link=_order_link(doc.name),
		)
	elif status in HELD_ORDER_STATUSES:
		notify_customer(
			doc.customer,
			category="commandes",
			event_type="order_on_hold",
			title=_("Commande en pause"),
			body=_("La commande {0} est en pause.").format(doc.name),
			document_type="Sales Order",
			document_name=doc.name,
			link=_order_link(doc.name),
		)


def _notify_delivery_event(customer: str, delivery_name: str, event_type: str, title: str, body: str):
	if not customer or not delivery_name:
		return
	notify_customer(
		customer,
		category="livraisons",
		event_type=event_type,
		title=title,
		body=body,
		document_type="Delivery Note",
		document_name=delivery_name,
		link=_delivery_link(delivery_name),
	)


@_safe_hook
def on_delivery_note_update(doc, method=None):
	meta = getattr(doc, "meta", None)
	if meta and not doc.meta.has_field("custom_statut"):
		return
	if not doc.customer or not doc.has_value_changed("custom_statut"):
		return
	status = cstr(doc.get("custom_statut"))
	event_type = DELIVERY_EVENT_STATUSES.get(status)
	if not event_type:
		return
	titles = {
		"delivery_in_progress": _("Livraison en cours"),
		"delivered": _("Livraison effectuée"),
		"partially_delivered": _("Livraison partielle"),
		"not_delivered": _("Livraison non effectuée"),
		"delivery_cancelled": _("Bon de livraison annulé"),
	}
	bodies = {
		"delivery_in_progress": _("Le bon {0} est en cours de livraison.").format(doc.name),
		"delivered": _("Le bon {0} a été livré.").format(doc.name),
		"partially_delivered": _("Le bon {0} a été partiellement livré. Un reliquat pourra suivre.").format(doc.name),
		"not_delivered": _("Le bon {0} n'a pas pu être livré.").format(doc.name),
		"delivery_cancelled": _("Le bon {0} a été annulé.").format(doc.name),
	}
	_notify_delivery_event(doc.customer, doc.name, event_type, titles[event_type], bodies[event_type])


@_safe_hook
def on_livraison_update(doc, method=None):
	if not doc.has_value_changed("etat_planification"):
		return
	if cstr(doc.etat_planification) != "En cours":
		return
	for row in doc.get("bons_de_livraison") or []:
		delivery_name = cstr(row.bon_de_livraison)
		customer = cstr(row.customer)
		if not delivery_name:
			continue
		if not customer:
			customer = cstr(frappe.db.get_value("Delivery Note", delivery_name, "customer"))
		_notify_delivery_event(
			customer,
			delivery_name,
			"delivery_in_progress",
			_("Livraison en cours"),
			_("Le bon {0} est en cours de livraison.").format(delivery_name),
		)


@_safe_hook
def on_paiement_client_update(doc, method=None):
	if not doc.client or not doc.has_value_changed("statut_controle"):
		return
	if cstr(doc.statut_controle) != "Validé":
		return
	notify_customer(
		doc.client,
		category="paiements",
		event_type="payment_validated",
		title=_("Paiement validé"),
		body=_("Le paiement {0} a été validé.").format(doc.name),
		document_type="Paiement Client",
		document_name=doc.name,
		link="/payments",
	)


@_safe_hook
def on_demande_hors_catalogue_update(doc, method=None):
	if not doc.client or not doc.has_value_changed("statut"):
		return
	status = cstr(doc.statut)
	if status == "Refusée":
		reason = cstr(doc.get("motif_refus")).strip()
		body = _("Votre demande {0} a été refusée.").format(doc.name)
		if reason:
			body = _("Votre demande {0} a été refusée : {1}").format(doc.name, reason)
		notify_customer(
			doc.client,
			category="demandes",
			event_type="request_refused",
			title=_("Demande refusée"),
			body=body,
			document_type="Demande Hors Catalogue",
			document_name=doc.name,
			link=_request_link(doc.name),
		)
	elif status == "Commande créée":
		order = cstr(doc.get("commande"))
		body = _("Votre demande {0} a été convertie en commande.").format(doc.name)
		if order:
			body = _("Votre demande {0} a été convertie en commande {1}.").format(doc.name, order)
		notify_customer(
			doc.client,
			category="demandes",
			event_type="request_converted",
			title=_("Commande créée depuis votre demande"),
			body=body,
			document_type="Demande Hors Catalogue",
			document_name=doc.name,
			link=_order_link(order) if order else _request_link(doc.name),
		)


@_safe_hook
def on_campagne_portail_update(doc, method=None):
	if not cint(doc.published) or not cint(doc.enabled):
		return
	previous = doc.get_doc_before_save()
	if previous and cint(previous.published):
		return
	frappe.enqueue(
		"log.services.portal_notifications.notify_campaign_published",
		campaign=doc.name,
		enqueue_after_commit=True,
		queue="short",
	)


def notify_campaign_published(campaign: str):
	if not campaign or not frappe.db.exists("Campagne Portail", campaign):
		return
	doc = frappe.get_doc("Campagne Portail", campaign)
	if not cint(doc.published) or not cint(doc.enabled):
		return
	from log.services.portal_merchandising import campaign_matches_segments, get_customer_segments

	headline = cstr(doc.get("headline") or doc.get("title") or doc.name)
	title = _("Nouvelle offre")
	body = headline
	customers = frappe.get_all(
		"Portal User",
		filters={"parenttype": "Customer"},
		pluck="parent",
		distinct=True,
	)
	for customer in customers:
		if not customer or cint(frappe.db.get_value("Customer", customer, "disabled")):
			continue
		segments = get_customer_segments(customer)
		if not campaign_matches_segments(doc, segments):
			continue
		notify_customer(
			customer,
			category="promotions",
			event_type="campaign_published",
			title=title,
			body=body,
			document_type="Campagne Portail",
			document_name=doc.name,
			link=_campaign_link(doc.name),
		)
