# Copyright (c) 2025, Frappe Technologies and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import now_datetime, cint
from frappe import _

def after_insert_preparation(doc, method):
    """Hook appelé après l'insertion d'une nouvelle préparation"""
    frappe.logger().info(f"Nouvelle préparation créée: {doc.name}")

def validate_preparation(doc, method):
    """Hook de validation pour les préparations"""
    # Calculer les totaux
    calculate_preparation_totals(doc)
    
    # Valider les articles
    validate_preparation_articles(doc)

def on_update_preparation(doc, method):
    """Hook appelé lors de la mise à jour d'une préparation"""
    # Si la préparation est terminée, générer les colis automatiquement
    if doc.status == "Terminée" and doc.nombre_colis_generes == 0:
        generate_colis_from_preparation(doc)

def calculate_preparation_totals(doc):
    """Calcule les totaux de la préparation"""
    total_articles = 0
    
    for article in doc.articles:
        total_articles += cint(article.quantite_demandee or 0)
    
    doc.total_articles = total_articles

def validate_preparation_articles(doc):
    """Valide les articles de la préparation"""
    if not doc.articles:
        frappe.throw(_("Au moins un article doit être ajouté à la préparation"))
    
    # Vérifier les doublons d'articles par bon de livraison
    seen_combinations = set()
    for article in doc.articles:
        combination = (article.article, article.bon_de_livraison)
        if combination in seen_combinations:
            frappe.throw(_(f"L'article {article.article} est dupliqué pour le bon de livraison {article.bon_de_livraison}"))
        seen_combinations.add(combination)

def generate_colis_from_preparation(doc):
    """Génère automatiquement les colis à partir d'une préparation terminée"""
    try:
        # Vérifier si des colis existent déjà
        existing_colis = frappe.get_all("Colis", 
            filters={"preparation": doc.name},
            fields=["name"]
        )
        
        if existing_colis:
            frappe.logger().info(f"Des colis existent déjà pour la préparation {doc.name}")
            return
        
        # Grouper les articles par bon de livraison
        articles_by_delivery_note = {}
        for article in doc.articles:
            if article.bon_de_livraison and article.quantite_preparee > 0:
                if article.bon_de_livraison not in articles_by_delivery_note:
                    articles_by_delivery_note[article.bon_de_livraison] = []
                articles_by_delivery_note[article.bon_de_livraison].append(article)
        
        colis_created = 0
        
        # Créer un colis pour chaque bon de livraison
        for delivery_note_name, articles_list in articles_by_delivery_note.items():
            try:
                # Récupérer les informations du bon de livraison
                delivery_note = frappe.get_doc("Delivery Note", delivery_note_name)
                
                # Créer le colis
                colis = frappe.new_doc("Colis")
                colis.client = doc.client
                colis.bl = delivery_note_name
                colis.preparation = doc.name
                colis.status = "Préparé"
                colis.date_creation = now_datetime().date()
                
                # Générer le numéro de séquence
                colis.custom_numero_sequence = generate_colis_sequence_number()
                
                # Ajouter les articles au colis
                for article in articles_list:
                    if article.quantite_preparee > 0:
                        colis.append("articles", {
                            "article": article.article,
                            "quantite_totale": article.quantite_preparee,
                            "quantite_livree": 0,
                            "quantite_restante": article.quantite_preparee,
                            "statut_article": "En attente"
                        })
                
                # Sauvegarder le colis seulement s'il a des articles
                if colis.articles:
                    colis.insert(ignore_permissions=True)
                    colis_created += 1
                    frappe.logger().info(f"Colis créé: {colis.name} pour le bon de livraison {delivery_note_name}")
                    
            except Exception as e:
                frappe.log_error(f"Erreur lors de la création du colis pour {delivery_note_name}: {str(e)}", "Preparation Hooks")
                continue
        
        # Mettre à jour le nombre de colis générés
        if colis_created > 0:
            frappe.db.set_value("Preparation", doc.name, "nombre_colis_generes", colis_created)
            frappe.db.commit()
            frappe.msgprint(_(f"{colis_created} colis ont été générés avec succès à partir de la préparation"))
        
    except Exception as e:
        frappe.log_error(f"Erreur lors de la génération des colis pour la préparation {doc.name}: {str(e)}", "Preparation Hooks")
        frappe.throw(_("Erreur lors de la génération des colis. Veuillez contacter l'administrateur."))

def generate_colis_sequence_number():
    """Génère un numéro de séquence unique pour le colis"""
    # Récupérer le dernier numéro de séquence
    last_sequence = frappe.db.sql("""
        SELECT MAX(CAST(SUBSTRING(custom_numero_sequence, 4) AS UNSIGNED)) as last_num
        FROM `tabColis` 
        WHERE custom_numero_sequence LIKE 'COL%'
    """, as_dict=True)
    
    next_number = 1
    if last_sequence and last_sequence[0].last_num:
        next_number = last_sequence[0].last_num + 1
    
    return f"COL{next_number:06d}"

@frappe.whitelist()
def create_preparation_from_delivery_notes(delivery_notes, client=None, date_preparation=None):
    """API pour créer une préparation à partir de bons de livraison"""
    try:
        if isinstance(delivery_notes, str):
            import json
            delivery_notes = json.loads(delivery_notes)
        
        if not delivery_notes:
            frappe.throw(_("Aucun bon de livraison sélectionné"))
        
        # Créer la préparation
        preparation = frappe.new_doc("Preparation")
        preparation.date_preparation = date_preparation or frappe.utils.today()
        preparation.status = "Brouillon"
        
        # Si pas de client spécifié, prendre le client du premier bon de livraison
        if not client and delivery_notes:
            first_dn = frappe.get_doc("Delivery Note", delivery_notes[0])
            client = first_dn.customer
        
        preparation.client = client
        
        # Collecter tous les articles des bons de livraison
        for dn_name in delivery_notes:
            dn = frappe.get_doc("Delivery Note", dn_name)
            
            # Vérifier que le client est cohérent
            if dn.customer != client:
                frappe.throw(_(f"Le bon de livraison {dn_name} appartient à un client différent ({dn.customer})"))
            
            for item in dn.items:
                preparation.append("articles", {
                    "article": item.item_code,
                    "quantite_demandee": item.qty,
                    "quantite_preparee": 0,
                    "bon_de_livraison": dn_name,
                    "statut_preparation": "En attente"
                })
        
        preparation.insert()
        frappe.db.commit()
        
        return {
            "status": "success",
            "preparation_name": preparation.name,
            "message": _(f"Préparation {preparation.name} créée avec succès")
        }
        
    except Exception as e:
        frappe.log_error(f"Erreur lors de la création de la préparation: {str(e)}", "Preparation API")
        frappe.throw(_(f"Erreur lors de la création de la préparation: {str(e)}"))

@frappe.whitelist()
def update_article_preparation_quantity(preparation_name, article_name, new_quantity):
    """Met à jour la quantité préparée d'un article"""
    try:
        preparation = frappe.get_doc("Preparation", preparation_name)
        
        for article in preparation.articles:
            if article.name == article_name:
                article.quantite_preparee = cint(new_quantity)
                break
        
        preparation.save()
        frappe.db.commit()
        
        return {"status": "success", "message": "Quantité mise à jour"}
        
    except Exception as e:
        frappe.log_error(f"Erreur lors de la mise à jour de la quantité: {str(e)}", "Preparation API")
        frappe.throw(_(f"Erreur lors de la mise à jour: {str(e)}"))

@frappe.whitelist()
def finalize_preparation(preparation_name):
    """Finalise une préparation et génère les colis"""
    try:
        preparation = frappe.get_doc("Preparation", preparation_name)
        
        # Vérifier que tous les articles ont été préparés
        unprepared_articles = []
        for article in preparation.articles:
            if article.quantite_preparee == 0:
                unprepared_articles.append(article.article)
        
        if unprepared_articles:
            frappe.msgprint(_(f"Attention: Les articles suivants n'ont pas été préparés: {', '.join(unprepared_articles)}"))
        
        # Changer le statut à terminée
        preparation.status = "Terminée"
        preparation.save()
        frappe.db.commit()
        
        return {
            "status": "success",
            "message": _(f"Préparation {preparation_name} finalisée. {preparation.nombre_colis_generes} colis générés.")
        }
        
    except Exception as e:
        frappe.log_error(f"Erreur lors de la finalisation: {str(e)}", "Preparation API")
        frappe.throw(_(f"Erreur lors de la finalisation: {str(e)}"))