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

    # s’il reste au moins une unité d’un article
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
        frappe.log_error(f"Nombre de colis trouvés pour DN {delivery_note_name}: {total}", 
                       "Debug mise à jour séquences")
        
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
            if result and len(result) > 0:
                frappe.log_error(f"Valeur de custom_nombre_colis après mise à jour: {result[0].custom_nombre_colis}", 
                               "Debug mise à jour nombre colis")
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
        
        frappe.log_error(f"Nombre de colis restants après suppression pour DN {delivery_note_name}: {total}", 
                       "Debug mise à jour après suppression")
        
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
            
            frappe.log_error(f"Mise à jour du nombre de colis à {total} pour DN {delivery_note_name}", 
                           "Debug mise à jour après suppression")
            
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
                frappe.log_error(f"Tentative {attempt + 1} - Valeur de custom_nombre_colis: {final_value}", 
                               "Debug vérification finale")
                if final_value == total:
                    frappe.log_error(f"Mise à jour réussie après {attempt + 1} tentative(s)", 
                                   "Debug vérification finale")
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
