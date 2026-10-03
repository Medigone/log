# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

import frappe


DISTRIBUTION_ROLES = ("Préparateur", "Planificateur", "Livreur", "Responsable", "Caissier", "Magasinier", "Commercial", "Gestionnaire catalogue")


def ensure_distribution_roles():
	for role_name in DISTRIBUTION_ROLES:
		if not frappe.db.exists("Role", role_name):
			frappe.get_doc({"doctype": "Role", "role_name": role_name, "desk_access": 1}).insert(
				ignore_permissions=True
			)

def after_install():
	"""Hook exécuté après l'installation de l'app Log"""
	from log.setup.brands import ensure_brands
	from log.setup.customer_groups import ensure_customer_groups
	from log.setup.item_groups import ensure_item_groups
	from log.setup.payment_terms import ensure_payment_terms
	from log.setup.taxes import ensure_algeria_vat
	from log.setup.permissions import ensure_catalog_permissions, ensure_order_permissions
	from log.setup.stock_settings import ensure_expiry_threshold, ensure_fefo_batch_picking

	ensure_distribution_roles()
	ensure_customer_groups()
	ensure_item_groups()
	ensure_brands()
	ensure_payment_terms()
	ensure_algeria_vat()
	ensure_order_permissions()
	ensure_catalog_permissions()
	ensure_fefo_batch_picking()
	ensure_expiry_threshold()
	frappe.msgprint("Installation de l'app Log terminée avec succès.")

def before_install():
	"""Hook exécuté avant l'installation de l'app Log"""
	frappe.msgprint("Début de l'installation de l'app Log...")
