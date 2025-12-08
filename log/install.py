# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

import frappe

def after_install():
    """Hook exécuté après l'installation de l'app Log"""
    frappe.msgprint("Installation de l'app Log terminée avec succès.")

def before_install():
    """Hook exécuté avant l'installation de l'app Log"""
    frappe.msgprint("Début de l'installation de l'app Log...")
