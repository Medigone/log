"""Restrictions serveur des documents exposés aux rôles Distribution."""

import frappe


def _roles(user: str) -> set[str]:
	if user == "Administrator":
		return {"System Manager", "Responsable"}
	return set(frappe.get_roles(user))


def livraison_query_conditions(user=None):
	user = user or frappe.session.user
	roles = _roles(user)
	if roles & {"System Manager", "Responsable", "Planificateur", "Caissier"}:
		return None
	if "Livreur" not in roles:
		return "1=0"
	driver = frappe.db.get_value("Livreur", {"id_utilisateur": user, "active": 1}, "name")
	if not driver:
		return "1=0"
	return (
		f"`tabLivraison`.`livreur` = {frappe.db.escape(driver)} "
		"AND `tabLivraison`.`etat_planification` IN ('Publiée', 'En cours', 'Retour dépôt', 'Contrôle caisse', 'Terminée')"
	)


def livraison_has_permission(doc, user=None, permission_type=None):
	user = user or frappe.session.user
	roles = _roles(user)
	if roles & {"System Manager", "Responsable", "Planificateur", "Caissier"}:
		return True
	if permission_type not in (None, "read", "print") or "Livreur" not in roles:
		return False
	driver = frappe.db.get_value("Livreur", {"id_utilisateur": user, "active": 1}, "name")
	return bool(
		driver
		and doc.livreur == driver
		and doc.etat_planification in {"Publiée", "En cours", "Retour dépôt", "Contrôle caisse", "Terminée"}
	)


def paiement_query_conditions(user=None):
	user = user or frappe.session.user
	roles = _roles(user)
	if roles & {"System Manager", "Responsable", "Caissier"}:
		return None
	if "Livreur" in roles:
		return f"`tabPaiement Client`.`id_beneficiaire` = {frappe.db.escape(user)}"
	return "1=0"


def paiement_has_permission(doc, user=None, permission_type=None):
	user = user or frappe.session.user
	roles = _roles(user)
	if roles & {"System Manager", "Responsable", "Caissier"}:
		return True
	if "Livreur" not in roles:
		return False
	if permission_type == "create":
		return True
	return permission_type in (None, "read", "print") and doc.id_beneficiaire == user
