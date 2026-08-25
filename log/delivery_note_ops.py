# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

import io
import json

import frappe
from frappe import _
from frappe.utils import flt, get_url, now_datetime

from log.api.distribution_rules import public_tracking_payload

STATUS_FIELD = "custom_statut"
QR_FIELD = "custom_qr_image"

ALLOWED_TRANSITIONS = {
	"Nouveau": ["Préparé", "Annulé"],
	"Préparé": ["Nouveau", "Enlevé", "Annulé"],
	"Enlevé": ["Préparé", "Livré", "Partiellement Livré", "Non Livré"],
	"Partiellement Livré": [],
	"Livré": ["Annulé"],
	"Non Livré": ["Préparé", "Enlevé"],
	"Annulé": ["Nouveau"],
}


def _get_status(doc):
	return doc.get(STATUS_FIELD) or "Nouveau"


def _validate_transition(current, new):
	if new != current and new not in ALLOWED_TRANSITIONS.get(current, []):
		frappe.throw(_("Transition de statut invalide : {0} → {1}").format(current, new))


def _sync_prepare_flag(doc, status):
	if doc.meta.has_field("custom_préparé"):
		prepared = status in {"Préparé", "Enlevé", "Partiellement Livré", "Livré"}
		doc.db_set("custom_préparé", 1 if prepared else 0, update_modified=False)


def _stamp_status(doc, status):
	user, now = frappe.session.user, now_datetime()
	if status == "Préparé":
		doc.db_set("custom_user_preparation", user, update_modified=False)
		doc.db_set("custom_date_preparation", now, update_modified=False)
	elif status == "Enlevé":
		doc.db_set("custom_user_enlevement", user, update_modified=False)
		doc.db_set("custom_date_enlevement", now, update_modified=False)
	elif status in ("Livré", "Partiellement Livré", "Non Livré"):
		doc.db_set("custom_user_livraison", user, update_modified=False)
		doc.db_set("custom_date_livraison", now, update_modified=False)


def _set_status(doc, status):
	_validate_transition(_get_status(doc), status)
	doc.db_set(STATUS_FIELD, status)
	if doc.meta.has_field("workflow_state"):
		try:
			doc.db_set("workflow_state", status, update_modified=False)
		except Exception:
			pass
	_sync_prepare_flag(doc, status)
	_stamp_status(doc, status)
	return status


def _article_status(qty, delivered):
	qty, delivered = flt(qty), flt(delivered)
	if delivered <= 0:
		return "En attente"
	if delivered >= qty:
		return "Livré"
	return "Partiellement livré"


def _recalculate_bl_status(doc):
	items = doc.get("items") or []
	if not items:
		return _get_status(doc)

	statuses = []
	for item in items:
		qty = flt(item.qty)
		delivered = flt(item.get("custom_quantite_livree") or 0)
		if item.get("custom_raison_non_livraison") and delivered <= 0:
			statuses.append("Non livré")
		else:
			statuses.append(_article_status(qty, delivered))

	current = _get_status(doc)
	if current not in ("Enlevé", "Partiellement Livré", "Livré", "Non Livré"):
		return current
	if all(s == "Livré" for s in statuses):
		return "Livré"
	if all(s == "Non livré" for s in statuses):
		return "Non Livré"
	if any(s in ("Livré", "Partiellement livré") for s in statuses):
		return "Partiellement Livré"
	return current


def serialize_delivery_note(doc):
	articles = []
	for item in doc.get("items") or []:
		qty = flt(item.qty)
		delivered = flt(item.get("custom_quantite_livree") or 0)
		articles.append(
			{
				"name": item.name,
				"id": item.name,
				"article": item.item_code,
				"item_code": item.item_code,
				"item_name": item.item_name,
				"quantite_totale": qty,
				"quantite_livree": delivered,
				"quantite_restante": max(qty - delivered, 0),
				"statut_article": item.get("custom_statut_article") or _article_status(qty, delivered),
				"raison_non_livraison": item.get("custom_raison_non_livraison"),
				"commentaire_article": item.get("custom_commentaire_article"),
			}
		)

	status = _get_status(doc)
	return {
		"name": doc.name,
		"status": status,
		"custom_statut": status,
		"client": doc.customer,
		"customer": doc.customer,
		"customer_name": doc.customer_name,
		"bl": doc.name,
		"articles": articles,
		"image": doc.get(QR_FIELD),
		"custom_qr_image": doc.get(QR_FIELD),
		"photo_livraison": doc.get("custom_photo_livraison"),
		"signature_livraison": doc.get("custom_signature_livraison"),
		"nom_signataire": doc.get("custom_nom_signataire"),
		"gps": doc.get("custom_gps"),
		"commentaire_livreur": doc.get("custom_commentaire_livreur"),
		"custom_commune": doc.get("custom_commune"),
		"custom_wilaya": doc.get("custom_wilaya"),
		"custom_livreur": doc.get("custom_livreur"),
		"custom_nom_livreur": doc.get("custom_nom_livreur"),
		"grand_total": doc.grand_total,
		"total_qty": doc.total_qty,
		"posting_date": str(doc.posting_date) if doc.posting_date else None,
		"custom_date_de_livraison": str(doc.custom_date_de_livraison)
		if doc.get("custom_date_de_livraison")
		else None,
	}


def _save_qr_image(dn_name, content):
	existing = frappe.get_all(
		"File",
		filters={
			"attached_to_doctype": "Delivery Note",
			"attached_to_name": dn_name,
			"file_name": ["like", "qr_code_%"],
		},
		pluck="name",
	)
	for name in existing:
		try:
			frappe.delete_doc("File", name, ignore_permissions=True)
		except Exception:
			pass

	file_doc = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": f"qr_code_{dn_name}.png",
			"attached_to_doctype": "Delivery Note",
			"attached_to_name": dn_name,
			"attached_to_field": QR_FIELD,
			"content": content,
			"is_private": 0,
		}
	)
	file_url = file_doc.insert(ignore_permissions=True).file_url
	frappe.db.set_value("Delivery Note", dn_name, QR_FIELD, file_url, update_modified=False)
	return file_url


def ensure_qr_code(doc, method=None):
	"""Génère le QR à la création (et au save s'il manque) et l'attache au champ image."""
	if getattr(frappe.flags, "in_generate_dn_qr", False):
		return
	if not doc.name or doc.is_new():
		return
	if not frappe.db.has_column("Delivery Note", QR_FIELD):
		return
	if frappe.db.get_value("Delivery Note", doc.name, QR_FIELD):
		return
	try:
		frappe.flags.in_generate_dn_qr = True
		generate_qr_code(doc.name, force=False)
	except Exception:
		frappe.log_error(title=_("Génération QR du bon {0}").format(doc.name))
	finally:
		frappe.flags.in_generate_dn_qr = False


@frappe.whitelist()
def generate_qr_code(docname, force=False):
	force = bool(frappe.utils.cint(force)) or str(force).lower() in ("true", "1", "yes")
	doc = frappe.get_doc("Delivery Note", docname)
	if doc.get(QR_FIELD) and not force:
		return {"success": True, "file_url": doc.get(QR_FIELD), "message": "QR déjà généré"}

	try:
		import qrcode
	except ImportError:
		frappe.throw(_("Le module qrcode n'est pas installé."))

	frontend_url = f"{get_url()}/distribution?bl={doc.name}"
	qr = qrcode.QRCode(version=4, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=6, border=2)
	qr.add_data(frontend_url)
	qr.make(fit=True)
	img = qr.make_image(fill_color="black", back_color="white")
	buffer = io.BytesIO()
	img.save(buffer, format="PNG", optimize=True)
	file_url = _save_qr_image(doc.name, buffer.getvalue())
	return {"success": True, "file_url": file_url, "url": frontend_url}


@frappe.whitelist()
def regenerate_qr_code(docname):
	return generate_qr_code(docname, force=True)


@frappe.whitelist()
def get_available_actions(docname):
	current = _get_status(frappe.get_doc("Delivery Note", docname))
	allowed = ALLOWED_TRANSITIONS.get(current, [])
	return {
		"current_status": current,
		"allowed": allowed,
		"can_set_nouveau": "Nouveau" in allowed,
		"can_set_prepare": "Préparé" in allowed,
		"can_set_enleve": "Enlevé" in allowed,
		"can_set_livre": "Livré" in allowed,
		"can_set_cancelled": "Annulé" in allowed,
		"can_set_not_delivered": "Non Livré" in allowed,
	}


def _apply_named_status(docname, status):
	doc = frappe.get_doc("Delivery Note", docname)
	previous = _get_status(doc)
	if previous == status:
		return {
			"success": True,
			"name": docname,
			"message": _("Déjà au statut {0}").format(status),
			"previous_status": previous,
			"new_status": status,
			"doc": serialize_delivery_note(doc),
		}
	new_status = _set_status(doc, status)
	if new_status == "Préparé":
		generate_qr_code(docname, force=False)
	_update_related_livraison_status(docname)
	return {
		"success": True,
		"name": docname,
		"message": _("Statut mis à jour vers {0}").format(new_status),
		"previous_status": previous,
		"new_status": new_status,
		"doc": serialize_delivery_note(frappe.get_doc("Delivery Note", docname)),
	}


@frappe.whitelist()
def set_status_nouveau(docname, confirm=False):
	return _apply_named_status(docname, "Nouveau")


@frappe.whitelist()
def set_status_prepare(docname, confirm=False):
	return _apply_named_status(docname, "Préparé")


@frappe.whitelist()
def set_status_enleve(docname, confirm=False):
	return _apply_named_status(docname, "Enlevé")


@frappe.whitelist()
def set_status_livre(docname, confirm=False):
	return _apply_named_status(docname, "Livré")


@frappe.whitelist()
def set_status_cancelled(docname, confirm=False):
	return _apply_named_status(docname, "Annulé")


@frappe.whitelist()
def set_status_not_delivered(docname, confirm=False):
	return _apply_named_status(docname, "Non Livré")


def _update_item_qty(item, quantity=None, mark_undeliverable=False, reason=""):
	qty = flt(item.qty)
	current = flt(item.get("custom_quantite_livree") or 0)
	if mark_undeliverable:
		item.custom_quantite_livree = current
		item.custom_raison_non_livraison = reason or item.get("custom_raison_non_livraison")
		item.custom_statut_article = "Non livré" if current <= 0 else "Partiellement livré"
		return

	new_qty = current if quantity is None else flt(quantity)
	if new_qty < 0:
		frappe.throw(_("La quantité livrée ne peut pas être négative."))
	if new_qty > qty:
		frappe.throw(_("La quantité livrée ({0}) dépasse la quantité commandée ({1}).").format(new_qty, qty))
	item.custom_quantite_livree = new_qty
	item.custom_statut_article = _article_status(qty, new_qty)


@frappe.whitelist()
def deliver_article_quantity(docname, article_name, quantity, confirm=False):
	doc = frappe.get_doc("Delivery Note", docname)
	item = next((i for i in doc.items if i.name == article_name), None)
	if not item:
		frappe.throw(_("Ligne d'article introuvable."))
	_update_item_qty(item, quantity=flt(quantity))
	_save_dn(doc)
	new_status = _recalculate_bl_status(doc)
	if new_status != _get_status(doc):
		_set_status(doc, new_status)
	_update_related_livraison_status(docname)
	return {"success": True, "doc": serialize_delivery_note(frappe.get_doc("Delivery Note", docname))}


@frappe.whitelist()
def deliver_article_remaining(docname, article_name, confirm=False):
	doc = frappe.get_doc("Delivery Note", docname)
	item = next((i for i in doc.items if i.name == article_name), None)
	if not item:
		frappe.throw(_("Ligne d'article introuvable."))
	return deliver_article_quantity(docname, article_name, item.qty, confirm=True)


@frappe.whitelist()
def mark_article_undeliverable(docname, article_name, reason="", confirm=False):
	doc = frappe.get_doc("Delivery Note", docname)
	item = next((i for i in doc.items if i.name == article_name), None)
	if not item:
		frappe.throw(_("Ligne d'article introuvable."))
	_update_item_qty(item, mark_undeliverable=True, reason=reason)
	_save_dn(doc)
	new_status = _recalculate_bl_status(doc)
	if new_status != _get_status(doc):
		_set_status(doc, new_status)
	_update_related_livraison_status(docname)
	return {"success": True, "doc": serialize_delivery_note(frappe.get_doc("Delivery Note", docname))}


@frappe.whitelist()
def deliver_all_articles(docname, confirm=False):
	doc = frappe.get_doc("Delivery Note", docname)
	for item in doc.items:
		_update_item_qty(item, quantity=item.qty)
	_save_dn(doc)
	_set_status(doc, "Livré")
	_update_related_livraison_status(docname)
	return {"success": True, "doc": serialize_delivery_note(frappe.get_doc("Delivery Note", docname))}


@frappe.whitelist()
def deliver_article_quantity_direct(article_docname, quantity_to_deliver, update_date=True):
	parent = frappe.db.get_value("Delivery Note Item", article_docname, "parent")
	if not parent:
		frappe.throw(_("Ligne introuvable."))
	return deliver_article_quantity(parent, article_docname, quantity_to_deliver, confirm=True)


@frappe.whitelist()
def upload_photo_livraison(bl_id=None, colis_id=None, file_data=None, filename=None):
	docname = bl_id or colis_id
	if not docname:
		frappe.throw(_("Bon de livraison manquant."))
	file_doc = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": filename or f"photo_{docname}.jpg",
			"attached_to_doctype": "Delivery Note",
			"attached_to_name": docname,
			"content": file_data,
			"decode": True,
			"is_private": 0,
		}
	)
	file_url = file_doc.insert(ignore_permissions=True).file_url
	frappe.db.set_value("Delivery Note", docname, "custom_photo_livraison", file_url)
	return {"success": True, "file_url": file_url}


@frappe.whitelist()
def delete_photo_livraison(bl_id=None, colis_id=None):
	docname = bl_id or colis_id
	frappe.db.set_value("Delivery Note", docname, "custom_photo_livraison", None)
	return {"success": True}


def _resolve_public_id(identifier):
	if not identifier:
		frappe.throw(_("Identifiant manquant."), frappe.DoesNotExistError)
	if frappe.db.exists("Delivery Note", identifier):
		return identifier

	for table in ("tabColis", "_archive_tabColis"):
		try:
			if frappe.db.sql("SHOW TABLES LIKE %s", (table,)):
				row = frappe.db.sql(
					f"SELECT bl FROM `{table}` WHERE name = %s LIMIT 1",
					(identifier,),
					as_dict=True,
				)
				if row and row[0].get("bl"):
					return row[0]["bl"]
		except Exception:
			continue
	frappe.throw(_("Bon de livraison introuvable."), frappe.DoesNotExistError)


@frappe.whitelist(allow_guest=True)
def get_public_bl_data(bl_id=None, colis_id=None):
	docname = _resolve_public_id(bl_id or colis_id)
	doc = frappe.get_doc("Delivery Note", docname)
	status = _get_status(doc)
	return public_tracking_payload(
		doc.name,
		status,
		[
			{
				"key": "prepared",
				"label": _("Préparé"),
				"completed": status in {"Préparé", "Enlevé", "Partiellement Livré", "Livré", "Non Livré"},
				"completed_at": str(doc.get("custom_date_preparation") or "") or None,
			},
			{
				"key": "picked_up",
				"label": _("Enlevé"),
				"completed": status in {"Enlevé", "Partiellement Livré", "Livré", "Non Livré"},
				"completed_at": str(doc.get("custom_date_enlevement") or "") or None,
			},
			{
				"key": "delivered",
				"label": _("Livraison"),
				"completed": status in {"Partiellement Livré", "Livré", "Non Livré"},
				"completed_at": str(doc.get("custom_date_livraison") or "") or None,
			},
		],
		[
			{
				"item_code": item.item_code,
				"item_name": item.item_name,
				"quantity": flt(item.qty),
				"delivered_quantity": flt(item.get("custom_quantite_livree") or 0),
			}
			for item in doc.items or []
		],
	)


@frappe.whitelist(allow_guest=True)
def get_colis_info(colis_id):
	return get_public_bl_data(colis_id=colis_id)


@frappe.whitelist(allow_guest=True)
def get_public_colis_data(colis_id):
	return get_public_bl_data(colis_id=colis_id)


@frappe.whitelist()
def enhanced_delivery_update(bl_id=None, colis_id=None, delivery_data=None, evidence_data=None):
	docname = bl_id or colis_id
	doc = frappe.get_doc("Delivery Note", docname)
	if isinstance(delivery_data, str):
		delivery_data = json.loads(delivery_data)
	if isinstance(evidence_data, str):
		evidence_data = json.loads(evidence_data)

	results, errors = [], []
	for update in (delivery_data or {}).get("articles") or []:
		article_name = update.get("article_name")
		item = next((i for i in doc.items if i.name == article_name), None)
		if not item:
			errors.append(f"Article {article_name} introuvable")
			results.append({"article_name": article_name, "success": False, "message": "Introuvable"})
			continue
		try:
			status = update.get("status")
			if status in ("deliver_all",) or (status == "delivered" and update.get("quantity_delivered") is None):
				_update_item_qty(item, quantity=item.qty)
			elif status == "undeliverable":
				_update_item_qty(item, mark_undeliverable=True, reason=update.get("reason") or "")
			else:
				qty = update.get("quantity_delivered")
				if qty is None:
					qty = flt(item.get("custom_quantite_livree") or 0) + flt(update.get("quantity") or 0)
				_update_item_qty(item, quantity=qty)
			results.append({"article_name": article_name, "success": True, "message": "OK"})
		except Exception as e:
			errors.append(str(e))
			results.append({"article_name": article_name, "success": False, "message": str(e)})

	if evidence_data:
		if evidence_data.get("comments"):
			doc.custom_commentaire_livreur = evidence_data["comments"]
		gps = evidence_data.get("gps_location")
		if gps:
			doc.custom_gps = f"{gps.get('latitude')},{gps.get('longitude')}"
		if evidence_data.get("photo_data"):
			upload_photo_livraison(
				bl_id=docname,
				file_data=evidence_data.get("photo_data"),
				filename=evidence_data.get("photo_filename") or f"photo_{docname}.jpg",
			)

	_save_dn(doc)
	new_status = _recalculate_bl_status(doc)
	if new_status != _get_status(doc):
		_set_status(doc, new_status)
	_update_related_livraison_status(docname)
	serialized = serialize_delivery_note(frappe.get_doc("Delivery Note", docname))
	return {
		"success": len(errors) == 0,
		"message": _("Livraison mise à jour"),
		"results": results,
		"errors": errors,
		"updated_colis_status": serialized["status"],
		"updated_bl_status": serialized["status"],
		"updated_colis_data": serialized,
		"updated_bl_data": serialized,
	}


@frappe.whitelist()
def get_smart_delivery_actions(bl_id=None, colis_id=None):
	doc = frappe.get_doc("Delivery Note", bl_id or colis_id)
	data = serialize_delivery_note(doc)
	articles = data["articles"]
	total_qty = sum(a["quantite_totale"] for a in articles) or 0
	delivered_qty = sum(a["quantite_livree"] for a in articles)
	remaining = sum(a["quantite_restante"] for a in articles)
	return {
		"success": True,
		"quick_actions": [
			{"id": "deliver_all", "label": "Tout livrer", "description": "Livrer toutes les quantités restantes", "type": "success", "icon": "check"},
			{"id": "partial_delivery", "label": "Livraison partielle", "description": "Saisir les quantités livrées", "type": "warning", "icon": "split"},
			{"id": "client_absent", "label": "Client absent", "description": "Marquer non livré", "type": "error", "icon": "user-x"},
		],
		"delivery_summary": {
			"total_articles": len(articles),
			"delivered_articles": len([a for a in articles if a["statut_article"] == "Livré"]),
			"partial_articles": len([a for a in articles if a["statut_article"] == "Partiellement livré"]),
			"undelivered_articles": len([a for a in articles if a["statut_article"] in ("En attente", "Non livré")]),
			"total_quantity": total_qty,
			"delivered_quantity": delivered_qty,
			"remaining_quantity": remaining,
			"completion_percentage": round((delivered_qty / total_qty) * 100) if total_qty else 0,
		},
		"status_info": {
			"current_status": data["status"],
			"can_complete": remaining <= 0,
			"requires_partial_status": remaining > 0 and delivered_qty > 0,
		},
	}


@frappe.whitelist()
def execute_quick_action(bl_id=None, colis_id=None, action_id=None, reason=None):
	docname = bl_id or colis_id
	if action_id == "deliver_all":
		return deliver_all_articles(docname, confirm=True)
	if action_id == "client_absent":
		doc = frappe.get_doc("Delivery Note", docname)
		for item in doc.items:
			_update_item_qty(item, mark_undeliverable=True, reason=reason or "Client absent")
		_save_dn(doc)
		_set_status(doc, "Non Livré")
		_update_related_livraison_status(docname)
		return {"success": True, "message": _("Marqué non livré"), "new_status": "Non Livré"}
	return {"success": False, "message": _("Action inconnue")}


@frappe.whitelist()
def get_delivery_notes_for_livraison(livraison_id):
	livraison = frappe.get_doc("Livraison", livraison_id)
	notes = []
	for row in livraison.bons_de_livraison or []:
		if row.bon_de_livraison:
			notes.append(serialize_delivery_note(frappe.get_doc("Delivery Note", row.bon_de_livraison)))
	return notes


@frappe.whitelist()
def prepare_delivery_notes(delivery_notes):
	"""Chemin hérité : BL déjà existants au statut Nouveau (avant le flux Pick List)."""
	if isinstance(delivery_notes, str):
		delivery_notes = json.loads(delivery_notes)
	results = []
	for name in delivery_notes or []:
		try:
			results.append(_apply_named_status(name, "Préparé"))
		except Exception as e:
			results.append({"success": False, "name": name, "message": str(e)})
	return results


def _save_dn(doc):
	doc.flags.ignore_validate_update_after_submit = True
	doc.save(ignore_permissions=True)


def _update_related_livraison_status(delivery_note_name):
	try:
		from log.livraison_hooks import update_livraison_status_from_delivery_note

		update_livraison_status_from_delivery_note(delivery_note_name)
	except Exception:
		frappe.log_error(title="Maj statut Livraison depuis BL", message=frappe.get_traceback())
