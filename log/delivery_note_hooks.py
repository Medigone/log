# intrapro_erp_distribution/delivery_note_hooks.py

import frappe
from frappe.utils import now_datetime
from frappe import _
import time

@frappe.whitelist()
def can_create_colis(delivery_note_name):
    """
    Retourne True si la DN possède au moins un article dont
    la quantité déjà colisée < quantité DN.
    """
    dn = frappe.get_doc("Delivery Note", delivery_note_name)
    dn_qty = {item.item_code: item.qty for item in dn.items}

    # cumul des qtés déjà en Colis
    noms = [c.name for c in frappe.get_all("Colis",
        filters={"bl": delivery_note_name}, fields=["name"])]
    cumul = {}
    if noms:
        for r in frappe.get_all("Articles Colis",
            filters={"parent": ["in", noms]},
            fields=["article", "quantite_totale"]):
            cumul[r.article] = cumul.get(r.article, 0) + (r.quantite_totale or 0)

    # s'il reste au moins une unité d'un article
    for code, total in dn_qty.items():
        if total - cumul.get(code, 0) > 0:
            return True
    return False

@frappe.whitelist()
def get_colis_for_delivery_note(delivery_note_name):
    """
    Renvoie la liste des Colis liés à la DN avec
    les champs name, status, date et custom_numero_sequence.
    """
    return frappe.get_all(
        "Colis",
        filters={"bl": delivery_note_name},
        fields=["name", "status", "date", "custom_numero_sequence"],
        order_by="creation asc"
    )

@frappe.whitelist()
def create_colis(delivery_note_name):
    """
    Crée un Colis avec la quantité restante pour chaque article,
    puis met à jour séquence et compteur.
    """
    dn = frappe.get_doc("Delivery Note", delivery_note_name)

    # 1) Calcul du cumul déjà colisé
    noms = [c.name for c in frappe.get_all("Colis",
        filters={"bl": delivery_note_name}, fields=["name"])]
    cumul = {}
    if noms:
        for r in frappe.get_all("Articles Colis",
            filters={"parent": ["in", noms]},
            fields=["article", "quantite_totale"]):
            cumul[r.article] = cumul.get(r.article, 0) + (r.quantite_totale or 0)

    # 2) Création du nouveau Colis
    colis = frappe.new_doc("Colis")
    colis.bl     = dn.name
    colis.client = dn.customer or dn.get("customer_name")
    colis.date   = now_datetime()

    for item in dn.items:
        used      = cumul.get(item.item_code, 0)
        remaining = (item.qty or 0) - used
        if remaining > 0:
            row = colis.append("articles", {})
            row.article  = item.item_code
            row.quantite_totale = remaining  # Initialiser quantite_totale
            row.quantite_livree = 0  # Initialiser quantite_livree
            row.quantite_restante = remaining  # Initialiser quantite_restante
            row.statut_article = "En attente"  # Initialiser statut_article
            row.description = item.get("description")

    colis.insert(ignore_permissions=True)

    # 3) Mise à jour des séquences et du compteur sur la DN
    _update_sequences(delivery_note_name)

    return colis.name

def _update_sequences(delivery_note_name):
    """
    Re-calcule custom_numero_sequence pour chaque Colis lié
    et met à jour custom_nombre_colis sur la Delivery Note.
    """
    try:
        # Vérifier que la Delivery Note existe
        if not frappe.db.exists("Delivery Note", delivery_note_name):
            frappe.log_error(f"Delivery Note {delivery_note_name} n'existe pas", 
                           "Erreur mise à jour séquences Colis")
            return
        
        # Forcer une requête SQL directe pour vérifier les colis liés
        # en contournant le cache potentiellement obsolète
        sql_query = """
            SELECT name 
            FROM `tabColis` 
            WHERE bl = %s AND docstatus < 2
            ORDER BY creation ASC
        """
        docs_result = frappe.db.sql(sql_query, (delivery_note_name,), as_dict=True)
        
        # Vérifier si des colis sont encore liés à cette DN
        total = len(docs_result)
        
        # Mettre à jour la séquence pour chaque Colis
        for idx, d in enumerate(docs_result, start=1):
            try:
                frappe.db.set_value("Colis", d.name,
                    "custom_numero_sequence", f"{idx}/{total}",
                    update_modified=False)
            except Exception as e:
                frappe.log_error(f"Erreur lors de la mise à jour de la séquence pour Colis {d.name}: {str(e)}", 
                               "Erreur mise à jour séquences Colis")
        
        # Mettre à jour le nombre total de Colis sur la Delivery Note avec une requête SQL directe
        try:
            # Utiliser une requête SQL directe pour mettre à jour le champ
            update_query = """
                UPDATE `tabDelivery Note`
                SET custom_nombre_colis = %s
                WHERE name = %s
            """
            frappe.db.sql(update_query, (total, delivery_note_name))
        except Exception as e:
            frappe.log_error(f"Erreur lors de la mise à jour du nombre de colis pour DN {delivery_note_name}: {str(e)}", 
                           "Erreur mise à jour nombre colis")
        
        # S'assurer que les modifications sont bien enregistrées
        frappe.db.commit()
        
        # Invalider le cache pour s'assurer que les modifications sont visibles
        frappe.clear_cache(doctype="Delivery Note")
        frappe.clear_cache(doctype="Colis")
        
    except Exception as e:
        frappe.log_error(f"Erreur générale lors de la mise à jour des séquences pour DN {delivery_note_name}: {str(e)}", 
                       "Erreur mise à jour séquences")
        # Essayer de faire un commit même en cas d'erreur pour sauvegarder ce qui a pu être fait
        frappe.db.commit()

def _update_sequences_after_delete(delivery_note_name):
    """
    Version spéciale de _update_sequences qui s'exécute après suppression
    avec un délai pour s'assurer que la suppression est complètement terminée.
    """
    try:
        # Attendre un court instant pour s'assurer que la suppression est complètement terminée
        time.sleep(3)
        
        # Vérifier que la Delivery Note existe
        if not frappe.db.exists("Delivery Note", delivery_note_name):
            frappe.log_error(f"Delivery Note {delivery_note_name} n'existe pas", 
                           "Erreur mise à jour séquences après suppression")
            return
        
        # Forcer une nouvelle connexion à la base de données pour éviter les problèmes de cache
        frappe.db.commit()
        
        # Requête SQL directe pour récupérer les colis restants
        colis_query = """
            SELECT name 
            FROM `tabColis` 
            WHERE bl = %s AND docstatus < 2
            ORDER BY creation ASC
        """
        colis_result = frappe.db.sql(colis_query, (delivery_note_name,), as_dict=True)
        total = len(colis_result)
        
        # Mettre à jour les séquences des colis restants
        for idx, colis in enumerate(colis_result, start=1):
            try:
                sequence_update = """
                    UPDATE `tabColis`
                    SET custom_numero_sequence = %s
                    WHERE name = %s
                """
                frappe.db.sql(sequence_update, (f"{idx}/{total}", colis.name))
            except Exception as e:
                frappe.log_error(f"Erreur lors de la mise à jour de la séquence pour Colis {colis.name}: {str(e)}", 
                               "Erreur mise à jour séquences après suppression")
        
        # Mettre à jour le nombre total de colis sur la Delivery Note
        try:
            count_update = """
                UPDATE `tabDelivery Note`
                SET custom_nombre_colis = %s
                WHERE name = %s
            """
            frappe.db.sql(count_update, (total, delivery_note_name))
        except Exception as e:
            frappe.log_error(f"Erreur lors de la mise à jour du nombre de colis après suppression pour DN {delivery_note_name}: {str(e)}", 
                           "Erreur mise à jour nombre colis après suppression")
        
        # S'assurer que les modifications sont bien enregistrées
        frappe.db.commit()
        
        # Invalider le cache
        frappe.clear_cache(doctype="Delivery Note")
        frappe.clear_cache(doctype="Colis")
        
    except Exception as e:
        frappe.log_error(f"Erreur générale lors de la mise à jour des séquences après suppression pour DN {delivery_note_name}: {str(e)}", 
                       "Erreur mise à jour séquences après suppression")
        frappe.db.commit()

def _update_sequences(delivery_note_name):
    """
    Re-calcule custom_numero_sequence pour chaque Colis lié
    et met à jour custom_nombre_colis sur la Delivery Note.
    """
    try:
        # Vérifier que la Delivery Note existe
        if not frappe.db.exists("Delivery Note", delivery_note_name):
            frappe.log_error(f"Delivery Note {delivery_note_name} n'existe pas", 
                           "Erreur mise à jour séquences Colis")
            return
        
        # Forcer une requête SQL directe pour vérifier les colis liés
        # en contournant le cache potentiellement obsolète
        sql_query = """
            SELECT name 
            FROM `tabColis` 
            WHERE bl = %s AND docstatus < 2
            ORDER BY creation ASC
        """
        docs_result = frappe.db.sql(sql_query, (delivery_note_name,), as_dict=True)
        
        # Vérifier si des colis sont encore liés à cette DN
        total = len(docs_result)
        
        # Mettre à jour la séquence pour chaque Colis
        for idx, d in enumerate(docs_result, start=1):
            try:
                frappe.db.set_value("Colis", d.name,
                    "custom_numero_sequence", f"{idx}/{total}",
                    update_modified=False)
            except Exception as e:
                frappe.log_error(f"Erreur lors de la mise à jour de la séquence pour Colis {d.name}: {str(e)}", 
                               "Erreur mise à jour séquences Colis")
        
        # Mettre à jour le nombre total de Colis sur la Delivery Note avec une requête SQL directe
        try:
            # Utiliser une requête SQL directe pour mettre à jour le champ
            update_query = """
                UPDATE `tabDelivery Note`
                SET custom_nombre_colis = %s
                WHERE name = %s
            """
            frappe.db.sql(update_query, (total, delivery_note_name))
            
            # Vérifier que la mise à jour a bien été effectuée
            check_query = "SELECT custom_nombre_colis FROM `tabDelivery Note` WHERE name = %s"
            result = frappe.db.sql(check_query, (delivery_note_name,), as_dict=True)
        except Exception as e:
            frappe.log_error(f"Erreur lors de la mise à jour du nombre de colis pour DN {delivery_note_name}: {str(e)}", 
                           "Erreur mise à jour nombre colis")
        
        # S'assurer que les modifications sont bien enregistrées
        frappe.db.commit()
        
        # Invalider le cache pour s'assurer que les modifications sont visibles
        frappe.clear_cache(doctype="Delivery Note")
        frappe.clear_cache(doctype="Colis")
        
    except Exception as e:
        frappe.log_error(f"Erreur générale lors de la mise à jour des séquences pour DN {delivery_note_name}: {str(e)}", 
                       "Erreur mise à jour séquences")
        # Essayer de faire un commit même en cas d'erreur pour sauvegarder ce qui a pu être fait
        frappe.db.commit()

def _update_sequences_after_delete(delivery_note_name):
    """
    Version spéciale de _update_sequences qui s'exécute après suppression
    avec un délai pour s'assurer que la suppression est complètement terminée.
    """
    try:
        # Attendre un court instant pour s'assurer que la suppression est complètement terminée
        time.sleep(3)
        
        # Vérifier que la Delivery Note existe
        if not frappe.db.exists("Delivery Note", delivery_note_name):
            frappe.log_error(f"Delivery Note {delivery_note_name} n'existe pas", 
                           "Erreur mise à jour séquences après suppression")
            return
        
        # Forcer une nouvelle connexion à la base de données pour éviter les problèmes de cache
        frappe.db.commit()
        
        # Requête SQL directe pour récupérer les colis restants
        colis_query = """
            SELECT name 
            FROM `tabColis` 
            WHERE bl = %s AND docstatus < 2
            ORDER BY creation ASC
        """
        colis_result = frappe.db.sql(colis_query, (delivery_note_name,), as_dict=True)
        total = len(colis_result)
        
        # Nombre de colis restants: {total}
        
        # Mettre à jour les séquences des colis restants
        for idx, colis in enumerate(colis_result, start=1):
            try:
                sequence_update = """
                    UPDATE `tabColis`
                    SET custom_numero_sequence = %s
                    WHERE name = %s
                """
                frappe.db.sql(sequence_update, (f"{idx}/{total}", colis.name))
            except Exception as e:
                frappe.log_error(f"Erreur lors de la mise à jour de la séquence pour Colis {colis.name}: {str(e)}", 
                               "Erreur mise à jour séquences Colis")
        
        # Mettre à jour le nombre total de Colis sur la Delivery Note
        try:
            # Utiliser frappe.db.set_value pour une mise à jour plus fiable
            frappe.db.set_value("Delivery Note", delivery_note_name, "custom_nombre_colis", total, update_modified=False)
            
            # Alternative avec SQL direct si set_value ne fonctionne pas
            update_query = """
                UPDATE `tabDelivery Note`
                SET custom_nombre_colis = %s, modified = modified
                WHERE name = %s
            """
            frappe.db.sql(update_query, (total, delivery_note_name))
            
            # Mise à jour du nombre de colis effectuée
            
        except Exception as e:
            frappe.log_error(f"Erreur lors de la mise à jour du nombre de colis pour DN {delivery_note_name}: {str(e)}", 
                           "Erreur mise à jour nombre colis")
        
        # S'assurer que les modifications sont bien enregistrées
        frappe.db.commit()
        
        # Invalider le cache de manière plus agressive
        frappe.clear_cache(doctype="Delivery Note")
        frappe.clear_cache(doctype="Colis")
        frappe.clear_document_cache("Delivery Note", delivery_note_name)
        
        # Vérification finale avec plusieurs tentatives
        for attempt in range(3):
            check_query = "SELECT custom_nombre_colis FROM `tabDelivery Note` WHERE name = %s"
            result = frappe.db.sql(check_query, (delivery_note_name,), as_dict=True)
            if result and len(result) > 0:
                final_value = result[0].custom_nombre_colis
                if final_value == total:
                    break
            time.sleep(1)
        
    except Exception as e:
        frappe.log_error(f"Erreur lors de la mise à jour après suppression pour DN {delivery_note_name}: {str(e)}", 
                       "Erreur mise à jour après suppression")
        frappe.db.commit()

def validate_colis_quantities(doc, method):
    """
    Bloque si somme(qtés des autres colis + qtés de ce colis)
    > qtés de la DN.
    """
    if not doc.bl:
        return

    dn = frappe.get_doc("Delivery Note", doc.bl)
    dn_qty = {i.item_code: i.qty for i in dn.items}

    autres = [c.name for c in frappe.get_all("Colis",
        filters={"bl": doc.bl, "name": ("!=", doc.name)},
        fields=["name"])]
    cumul = {}
    if autres:
        for r in frappe.get_all("Articles Colis",
            filters={"parent": ["in", autres]},
            fields=["article", "quantite_totale"]):
            cumul[r.article] = cumul.get(r.article, 0) + (r.quantite_totale or 0)

    for line in doc.articles:
        code = line.article
        qt   = line.quantite_totale or 0
        if cumul.get(code, 0) + qt > dn_qty.get(code, 0):
            frappe.throw(_(
                "Quantité trop élevée pour l'article « {0} » : "
                "{1} déjà colisé + {2} ici > {3} sur la DN."
            ).format(code, cumul.get(code, 0), qt, dn_qty.get(code, 0)))
    
    # Générer le QR code seulement si le document est nouveau et n'a pas encore d'image
    if doc.is_new() and (not doc.image or not doc.image.strip()):
        _generate_qr_code_for_colis(doc)
    
    # Calculer le statut global basé sur les articles
    _calculate_global_status_for_colis(doc)

def _generate_qr_code_for_colis(doc):
    """Génère un QR code pour le document Colis"""
    import qrcode
    import io
    import base64
    
    if not doc.name or doc.name == "new-colis":
        return
    
    # Construire l'URL complète vers l'interface livreurs React
    site_url = frappe.utils.get_url()
    frontend_url = f"{site_url}/Colis?colis={doc.name}"
    app_url = f"{site_url}/app/colis/{doc.name}"
    
    # Préparer les données à encoder dans le QR code
    qr_data = {
        "id": doc.name,
        "url": frontend_url,
        "app_url": app_url,
        "client": doc.client if doc.client else "",
        "date": str(doc.date) if doc.date else "",
        "status": doc.status if doc.status else ""
    }
    
    # Créer le QR code
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(str(qr_data))
    qr.make(fit=True)
    
    # Générer l'image
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Convertir en base64
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    img_str = base64.b64encode(buffer.getvalue()).decode()
    
    # Stocker l'image en base64 dans le champ image
    doc.image = f"data:image/png;base64,{img_str}"

def _calculate_global_status_for_colis(doc):
    """Calcule automatiquement le statut global du colis basé sur les statuts des articles"""
    if not doc.articles:
        return
    
    # Compter les statuts des articles
    article_statuses = [article.statut_article for article in doc.articles if article.statut_article]
    
    if not article_statuses:
        return
    
    # Logique de calcul du statut global
    if all(status == "Livré" for status in article_statuses):
        doc.status = "Livré"
    elif all(status == "En attente" for status in article_statuses):
        # Définir le statut "Nouveau" si tous les articles sont en attente et aucun statut n'est défini
        if not doc.status or doc.status in ["Draft", ""]:
            doc.status = "Nouveau"
    elif any(status == "Partiellement livré" for status in article_statuses) or \
         (any(status == "Livré" for status in article_statuses) and 
          any(status in ["En attente", "Partiellement livré"] for status in article_statuses)):
        doc.status = "Partiellement Livré"
    elif all(status == "Non livré" for status in article_statuses):
        doc.status = "Non Livré"

def on_trash_colis(doc, method):
    """
    Hook on_trash pour le DocType Colis.
    Stocke l'information pour traitement ultérieur.
    """
    try:
        if doc.bl:
            frappe.log_error(f"on_trash du colis {doc.name} pour la DN {doc.bl}", 
                           "Debug on_trash_colis")
            # Stocker l'information dans la session pour traitement par after_delete
            if not hasattr(frappe.local, 'colis_to_update'):
                frappe.local.colis_to_update = set()
            frappe.local.colis_to_update.add(doc.bl)
            
    except Exception as e:
        frappe.log_error(f"Erreur dans on_trash_colis pour {doc.name}: {str(e)}", 
                       "Erreur on_trash_colis")

def after_delete_colis(doc, method):
    """
    Hook after_delete pour s'assurer que la mise à jour se fait après suppression complète.
    Exécution directe et synchrone pour éviter les problèmes de timing.
    """
    try:
        if doc.bl:
            frappe.log_error(f"After delete du colis {doc.name} pour la DN {doc.bl}", 
                           "Debug after_delete_colis")
            
            # Exécuter directement la mise à jour après un court délai
            time.sleep(1)  # Délai court pour s'assurer que la suppression est terminée
            _update_sequences_after_delete(doc.bl)
            
    except Exception as e:
        frappe.log_error(f"Erreur dans after_delete_colis pour {doc.name}: {str(e)}", 
                       "Erreur after_delete_colis")
        # En cas d'erreur, essayer une seconde fois après un délai plus long
        if doc.bl:
            try:
                time.sleep(2)
                _update_sequences_after_delete(doc.bl)
            except Exception as inner_e:
                frappe.log_error(f"Échec de la récupération pour DN {doc.bl}: {str(inner_e)}", 
                               "Erreur critique after_delete_colis")

@frappe.whitelist()
def get_unpacked_items(delivery_note_name):
    """
    Retourne la liste des articles de la DN avec leurs quantités non emballées.
    """
    dn = frappe.get_doc("Delivery Note", delivery_note_name)
    dn_qty = {item.item_code: {"qty": item.qty, "description": item.description or item.item_code} for item in dn.items}

    # Cumul des quantités déjà en Colis
    noms = [c.name for c in frappe.get_all("Colis",
        filters={"bl": delivery_note_name}, fields=["name"])]
    cumul = {}
    if noms:
        for r in frappe.get_all("Articles Colis",
            filters={"parent": ["in", noms]},
            fields=["article", "quantite_totale"]):
            cumul[r.article] = cumul.get(r.article, 0) + (r.quantite_totale or 0)

    # Calculer les quantités restantes
    unpacked_items = []
    for code, item_info in dn_qty.items():
        total_qty = item_info["qty"]
        packed_qty = cumul.get(code, 0)
        remaining_qty = total_qty - packed_qty
        
        if remaining_qty > 0:
            unpacked_items.append({
                "item_code": code,
                "description": item_info["description"],
                "total_qty": total_qty,
                "packed_qty": packed_qty,
                "remaining_qty": remaining_qty
            })
    
    return unpacked_items

@frappe.whitelist()
def force_update_colis_count(delivery_note_name):
    """
    Fonction utilitaire pour forcer manuellement la mise à jour du nombre de colis.
    Peut être appelée depuis la console ou un script personnalisé.
    """
    try:
        frappe.log_error(f"Force update pour DN {delivery_note_name}", "Force update colis count")
        _update_sequences_after_delete(delivery_note_name)
        return {"success": True, "message": "Mise à jour forcée effectuée"}
    except Exception as e:
        frappe.log_error(f"Erreur lors de la mise à jour forcée pour DN {delivery_note_name}: {str(e)}", 
                       "Erreur force update")
        return {"success": False, "message": str(e)}

def calculate_global_status(doc):
    """
    Calcule le statut global du colis basé sur les statuts des articles
    """
    if not doc.articles:
        return "En attente"
    
    # Compter les statuts des articles
    article_statuses = [article.statut_article for article in doc.articles if article.statut_article]
    
    if not article_statuses:
        return "En attente"
    
    # Logique de calcul du statut global
    if all(status == "Livré" for status in article_statuses):
        return "Livré"
    elif all(status == "En attente" for status in article_statuses):
        return "En attente"
    elif any(status == "Partiellement livré" for status in article_statuses) or \
         (any(status == "Livré" for status in article_statuses) and 
          any(status in ["En attente", "Partiellement livré"] for status in article_statuses)):
        return "Partiellement Livré"
    elif all(status == "Non livré" for status in article_statuses):
        return "Non Livré"
    else:
        return "En attente"
