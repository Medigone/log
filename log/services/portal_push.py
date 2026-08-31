# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Web Push du portail client (VAPID, abonnements, envoi)."""

from __future__ import annotations

import base64
import json
from typing import Any

import frappe
from frappe import _
from frappe.utils import cstr

SUBSCRIPTION_DOCTYPE = "Abonnement Push Portail"
VAPID_PUBLIC_KEY = "portal_vapid_public_key"
VAPID_PRIVATE_KEY = "portal_vapid_private_key"
VAPID_MAILTO = "portal_vapid_mailto"
DEFAULT_MAILTO = "mailto:admin@medigo.one"


def _staff_roles(user: str) -> bool:
	if user == "Administrator":
		return True
	return bool(set(frappe.get_roles(user)) & {"System Manager", "Responsable"})


def subscription_query_conditions(user=None):
	user = user or frappe.session.user
	if _staff_roles(user):
		return None
	return f"`tabAbonnement Push Portail`.`user` = {frappe.db.escape(user)}"


def subscription_has_permission(doc, user=None, permission_type=None):
	user = user or frappe.session.user
	if _staff_roles(user):
		return True
	return doc.user == user


def _update_site_config(key: str, value: str) -> None:
	from frappe.installer import update_site_config

	update_site_config(key, value)


def ensure_vapid_keys():
	"""Génère et persiste les clés VAPID si elles manquent."""
	public = cstr(frappe.conf.get(VAPID_PUBLIC_KEY))
	private = cstr(frappe.conf.get(VAPID_PRIVATE_KEY))
	if public and private:
		if not frappe.conf.get(VAPID_MAILTO):
			try:
				_update_site_config(VAPID_MAILTO, DEFAULT_MAILTO)
				frappe.conf.portal_vapid_mailto = DEFAULT_MAILTO
			except Exception:
				pass
		return {"public": public, "private": private}

	from cryptography.hazmat.primitives import serialization
	from cryptography.hazmat.primitives.asymmetric import ec

	key = ec.generate_private_key(ec.SECP256R1())
	private_pem = key.private_bytes(
		encoding=serialization.Encoding.PEM,
		format=serialization.PrivateFormat.PKCS8,
		encryption_algorithm=serialization.NoEncryption(),
	).decode()
	public_raw = key.public_key().public_bytes(
		encoding=serialization.Encoding.X962,
		format=serialization.PublicFormat.UncompressedPoint,
	)
	public_b64 = base64.urlsafe_b64encode(public_raw).decode().rstrip("=")

	try:
		_update_site_config(VAPID_PUBLIC_KEY, public_b64)
		_update_site_config(VAPID_PRIVATE_KEY, private_pem)
		_update_site_config(VAPID_MAILTO, DEFAULT_MAILTO)
	except Exception:
		frappe.log_error(title="Clés VAPID portail")

	frappe.conf.portal_vapid_public_key = public_b64
	frappe.conf.portal_vapid_private_key = private_pem
	frappe.conf.portal_vapid_mailto = DEFAULT_MAILTO
	return {"public": public_b64, "private": private_pem}


def get_push_config() -> dict[str, Any]:
	keys = ensure_vapid_keys()
	return {"vapidPublicKey": keys["public"], "enabled": bool(keys["public"])}


def portal_notification_url(link: str | None) -> str:
	path = cstr(link).strip() or "/"
	if not path.startswith("/"):
		path = f"/{path}"
	return f"/client#{path}"


def _request_user_agent() -> str:
	request = getattr(frappe.local, "request", None)
	if request is None:
		return ""
	return cstr(request.headers.get("User-Agent"))[:140]


def upsert_subscription(user: str, customer: str, endpoint: str, p256dh: str, auth: str, user_agent: str = "") -> str:
	endpoint = cstr(endpoint).strip()
	p256dh = cstr(p256dh).strip()
	auth = cstr(auth).strip()
	if not user or not customer or not endpoint or not p256dh or not auth:
		frappe.throw(_("Abonnement push incomplet."), frappe.ValidationError)
	if not frappe.db.table_exists(SUBSCRIPTION_DOCTYPE):
		frappe.throw(_("Les notifications téléphone ne sont pas encore disponibles."))

	existing_name = frappe.db.get_value(SUBSCRIPTION_DOCTYPE, {"endpoint": endpoint}, "name")
	values = {
		"user": user,
		"customer": customer,
		"endpoint": endpoint,
		"p256dh": p256dh,
		"auth": auth,
		"user_agent": cstr(user_agent)[:140] or _request_user_agent(),
		"enabled": 1,
	}
	if existing_name:
		doc = frappe.get_doc(SUBSCRIPTION_DOCTYPE, existing_name)
		doc.update(values)
		doc.save(ignore_permissions=True)
		return doc.name
	doc = frappe.get_doc({"doctype": SUBSCRIPTION_DOCTYPE, **values})
	doc.insert(ignore_permissions=True)
	return doc.name


def disable_subscription(user: str, endpoint: str) -> dict[str, Any]:
	endpoint = cstr(endpoint).strip()
	if not endpoint or not frappe.db.table_exists(SUBSCRIPTION_DOCTYPE):
		return {"success": True}
	name = frappe.db.get_value(SUBSCRIPTION_DOCTYPE, {"endpoint": endpoint, "user": user}, "name")
	if name:
		frappe.delete_doc(SUBSCRIPTION_DOCTYPE, name, ignore_permissions=True, force=True)
	return {"success": True}


def subscriptions_for_user(user: str) -> list[dict[str, Any]]:
	if not user or not frappe.db.table_exists(SUBSCRIPTION_DOCTYPE):
		return []
	return frappe.get_all(
		SUBSCRIPTION_DOCTYPE,
		filters={"user": user, "enabled": 1},
		fields=["name", "endpoint", "p256dh", "auth"],
	)


def enqueue_push(user: str, *, title: str, body: str = "", link: str | None = None) -> None:
	if not user or not title:
		return
	frappe.enqueue(
		"log.services.portal_push.send_to_user",
		user=user,
		title=title,
		body=body or "",
		link=link or "",
		enqueue_after_commit=True,
	)


def _gone_status(exc: BaseException) -> bool:
	response = getattr(exc, "response", None)
	status = getattr(response, "status_code", None)
	if status in (404, 410):
		return True
	message = cstr(exc)
	return "410" in message or "404" in message


def send_to_user(user: str, title: str, body: str = "", link: str = "") -> int:
	"""Envoie la notification push à tous les appareils de l'utilisateur."""
	keys = ensure_vapid_keys()
	if not keys.get("private"):
		return 0
	rows = subscriptions_for_user(user)
	if not rows:
		return 0
	try:
		from pywebpush import webpush
	except ImportError:
		frappe.log_error(title="pywebpush manquant")
		return 0

	payload = json.dumps(
		{"title": title, "body": body or "", "url": portal_notification_url(link)},
		ensure_ascii=False,
	)
	claims = {"sub": cstr(frappe.conf.get(VAPID_MAILTO) or DEFAULT_MAILTO)}
	sent = 0
	for row in rows:
		try:
			webpush(
				subscription_info={
					"endpoint": row.endpoint,
					"keys": {"p256dh": row.p256dh, "auth": row.auth},
				},
				data=payload,
				vapid_private_key=keys["private"],
				vapid_claims=claims,
			)
			sent += 1
		except Exception as exc:
			if _gone_status(exc):
				try:
					frappe.delete_doc(SUBSCRIPTION_DOCTYPE, row.name, ignore_permissions=True, force=True)
				except Exception:
					frappe.db.set_value(SUBSCRIPTION_DOCTYPE, row.name, "enabled", 0)
			else:
				frappe.log_error(title="Push portail")
	return sent
