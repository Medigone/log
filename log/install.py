# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

import frappe
import os
import subprocess
from frappe.utils import get_bench_path

def after_install():
    """Hook exécuté après l'installation de l'app Log"""
    try:
        # Build du frontend React
        build_frontend()
        frappe.msgprint("Installation de l'app Log terminée avec succès. Frontend React construit.")
    except Exception as e:
        frappe.log_error(f"Erreur lors du build du frontend: {str(e)}", "Log App Installation")
        frappe.throw(f"Erreur lors de l'installation: {str(e)}")

def build_frontend():
    """Construit le frontend React et copie les fichiers dans le bon répertoire"""
    bench_path = get_bench_path()
    app_path = os.path.join(bench_path, "apps", "log")
    frontend_path = os.path.join(app_path, "Colis")
    
    if not os.path.exists(frontend_path):
        frappe.throw("Le répertoire frontend Colis n'existe pas")
    
    # Vérifier si Node.js est installé
    try:
        subprocess.run(["node", "--version"], check=True, capture_output=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        frappe.throw("Node.js n'est pas installé. Veuillez installer Node.js pour continuer.")
    
    # Vérifier si yarn est installé, sinon utiliser npm
    use_yarn = True
    try:
        subprocess.run(["yarn", "--version"], check=True, capture_output=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        use_yarn = False
    
    # Changer vers le répertoire frontend
    original_cwd = os.getcwd()
    os.chdir(frontend_path)
    
    try:
        # Installer les dépendances
        if use_yarn:
            frappe.msgprint("Installation des dépendances avec yarn...")
            subprocess.run(["yarn", "install"], check=True)
            
            # Build du projet
            frappe.msgprint("Construction du frontend React...")
            subprocess.run(["yarn", "build"], check=True)
        else:
            frappe.msgprint("Installation des dépendances avec npm...")
            subprocess.run(["npm", "install"], check=True)
            
            # Build du projet
            frappe.msgprint("Construction du frontend React...")
            subprocess.run(["npm", "run", "build"], check=True)
        
        frappe.msgprint("Frontend React construit avec succès!")
        
    except subprocess.CalledProcessError as e:
        raise Exception(f"Erreur lors du build: {str(e)}")
    finally:
        # Retourner au répertoire original
        os.chdir(original_cwd)

def before_install():
    """Hook exécuté avant l'installation de l'app Log"""
    frappe.msgprint("Début de l'installation de l'app Log...")