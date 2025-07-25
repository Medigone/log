# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import qrcode
import io
import base64


class Colis(Document):
	def validate(self):
		# Générer le QR code à chaque sauvegarde
		self.generate_qr_code()
		# Calculer le statut global basé sur les articles
		self.calculate_global_status()
	
	def on_update(self):
		"""Hook appelé après la mise à jour du document"""
		self.sync_with_delivery_note()
	
	def sync_with_delivery_note(self):
		"""Synchronise les quantités livrées avec le Delivery Note associé"""
		if not self.bl or not self.articles:
			return
		
		try:
			# Récupérer le Delivery Note
			delivery_note = frappe.get_doc("Delivery Note", self.bl)
			
			# Créer un dictionnaire des quantités livrées par article
			delivered_quantities = {}
			for article in self.articles:
				if article.article and article.quantite_livree > 0:
					if article.article in delivered_quantities:
						delivered_quantities[article.article] += article.quantite_livree
					else:
						delivered_quantities[article.article] = article.quantite_livree
			
			# Mettre à jour les quantités dans le Delivery Note
			for item in delivery_note.items:
				if item.item_code in delivered_quantities:
					# Calculer la nouvelle quantité livrée
					new_delivered_qty = delivered_quantities[item.item_code]
					
					# S'assurer que la quantité livrée ne dépasse pas la quantité commandée
					if new_delivered_qty > item.qty:
						new_delivered_qty = item.qty
					
					# Mettre à jour le champ delivered_qty s'il existe
					if hasattr(item, 'delivered_qty'):
						item.delivered_qty = new_delivered_qty
			
			# Sauvegarder le Delivery Note avec les nouvelles quantités
			delivery_note.save(ignore_permissions=True)
			
			frappe.logger().info(f"Synchronisation réussie avec Delivery Note {self.bl}")
			
		except Exception as e:
			frappe.logger().error(f"Erreur lors de la synchronisation avec Delivery Note {self.bl}: {str(e)}")
			# Ne pas lever l'erreur pour éviter de bloquer la sauvegarde du Colis
	
	def calculate_global_status(self):
		"""Calcule automatiquement le statut global du colis basé sur les statuts des articles"""
		if not self.articles:
			return
		
		# Compter les statuts des articles
		article_statuses = [article.statut_article for article in self.articles if article.statut_article]
		
		if not article_statuses:
			return
		
		# Logique de calcul du statut global
		if all(status == "Livré" for status in article_statuses):
			self.status = "Livré"
		elif all(status == "En attente" for status in article_statuses):
			# Garder le statut actuel si tous les articles sont en attente
			pass
		elif any(status == "Partiellement livré" for status in article_statuses) or \
			 (any(status == "Livré" for status in article_statuses) and 
			  any(status in ["En attente", "Partiellement livré"] for status in article_statuses)):
			self.status = "Partiellement Livré"
		elif all(status == "Non livré" for status in article_statuses):
			self.status = "Non Livré"
	
	@frappe.whitelist()
	def generate_qr_code(self):
		"""Génère un QR code pour le document Colis et le stocke directement comme pièce jointe"""
		if not self.name or self.name == "new-colis":
			return
		
		# Construire l'URL complète vers l'interface livreurs
		site_url = frappe.utils.get_url()
		frontend_url = f"{site_url}/frontend/colis/{self.name}"
		
		# URL vers l'application Frappe (pour les utilisateurs authentifiés)
		app_url = f"{site_url}/app/colis/{self.name}"
		
		# Préparer les données à encoder dans le QR code
		# Format JSON pour inclure plus d'informations
		qr_data = {
			"id": self.name,
			"url": frontend_url,  # URL de l'interface livreurs pour accès direct
			"app_url": app_url,  # URL de l'application pour les utilisateurs authentifiés
			"client": self.client if self.client else "",
			"date": str(self.date) if self.date else "",
			"status": self.status if self.status else ""
		}
		
		# Pour les scanners QR simples qui ne supportent que les URL, utiliser directement l'URL de l'interface livreurs
		data = frontend_url
		
		# Créer le QR code avec des paramètres optimisés pour réduire la taille
		# Augmenter légèrement la version pour accommoder plus de données
		qr = qrcode.QRCode(
			version=4,  # Version plus élevée pour plus de données
			error_correction=qrcode.constants.ERROR_CORRECT_M,
			box_size=6,
			border=2,
		)
		qr.add_data(data)
		qr.make(fit=True)
		
		# Créer l'image
		img = qr.make_image(fill_color="black", back_color="white")
		
		# Préparer le buffer pour l'image
		buffer = io.BytesIO()
		img.save(buffer, format="PNG", optimize=True)  # Optimiser l'image PNG
		buffer.seek(0)
		
		# Nom du fichier QR code
		file_name = f"qr_code_{self.name}.png"
		
		# Supprimer les anciennes pièces jointes de QR code si elles existent
		existing_files = frappe.get_all(
			"File",
			filters={
				"attached_to_doctype": "Colis",
				"attached_to_name": self.name,
				"file_name": ["like", "qr_code_%"]
			},
			fields=["name"]
		)
		
		for file in existing_files:
			try:
				frappe.delete_doc("File", file.name)
			except Exception as e:
				frappe.log_error(f"Erreur lors de la suppression du fichier QR code: {e}")
		
		# Sauvegarder comme pièce jointe
		file_doc = frappe.get_doc({
			"doctype": "File",
			"file_name": file_name,
			"attached_to_doctype": "Colis",
			"attached_to_name": self.name,
			"content": buffer.getvalue(),
			"is_private": 0
		})
		
		# Insérer le nouveau fichier et récupérer l'URL
		file_url = file_doc.insert().file_url
		
		# Mettre à jour le champ image
		self.image = file_url
		
		# Ne plus utiliser le champ qr_code pour éviter l'erreur "Valeur trop grande"
		self.qr_code = None


@frappe.whitelist()
def get_item_from_barcode(barcode):
	"""Récupère les informations d'un article à partir de son code-barres
	
	Args:
		barcode (str): Le code-barres à rechercher
	
	Returns:
		dict: Les informations de l'article (name, item_name) ou None si non trouvé
	"""
	# Sauvegarder les permissions actuelles
	original_flags = {}
	if hasattr(frappe.local, 'flags'):
		original_flags = dict(frappe.local.flags)
	
	try:
		# Désactiver la vérification des permissions
		frappe.flags.ignore_permissions = True
		
		# Rechercher le code-barres dans Item Barcode
		parent = frappe.db.get_value("Item Barcode", {"barcode": barcode}, "parent")
		
		if parent:
			# Récupérer les détails de l'article
			item = frappe.db.get_value("Item", parent, ["name", "item_name"], as_dict=True)
			return item
		
		return None
	finally:
		# Restaurer les permissions originales
		if original_flags:
			frappe.local.flags = frappe._dict(original_flags)
		else:
			frappe.flags.ignore_permissions = False


def get_allowed_transitions():
	"""Retourne les transitions de statut autorisées
	
	Returns:
		dict: Dictionnaire des transitions autorisées
	"""
	return {
		'Nouveau': ['Préparé', 'Annulé'],
		'Préparé': ['Nouveau', 'Enlevé', 'Annulé'],
		'Enlevé': ['Préparé', 'Livré', 'Non Livré'],
		'Livré': [],  # État final
		'Annulé': ['Nouveau'],  # Peut être réactivé
		'Non Livré': ['Enlevé', 'Annulé']  # Peut être relancé ou annulé
	}


def validate_status_transition(current_status, new_status):
	"""Valide les transitions de statut autorisées
	
	Args:
		current_status (str): Statut actuel
		new_status (str): Nouveau statut souhaité
	
	Returns:
		tuple: (is_valid, error_message)
	"""
	allowed_transitions = get_allowed_transitions()
	
	if current_status not in allowed_transitions:
		return False, f"Statut actuel '{current_status}' non reconnu"
	
	if new_status not in allowed_transitions[current_status]:
		return False, f"Transition de '{current_status}' vers '{new_status}' non autorisée"
	
	return True, None


@frappe.whitelist()
def get_available_actions(docname):
	"""Retourne les actions disponibles pour un colis selon son statut
	
	Args:
		docname (str): Le nom du document Colis
	
	Returns:
		dict: Actions disponibles et informations sur le statut
	"""
	doc = frappe.get_doc("Colis", docname)
	current_status = doc.status
	allowed_transitions = get_allowed_transitions()
	
	# Actions de statut disponibles
	status_actions = {
		'can_set_nouveau': 'Nouveau' in allowed_transitions.get(current_status, []),
		'can_set_prepare': 'Préparé' in allowed_transitions.get(current_status, []),
		'can_set_enleve': 'Enlevé' in allowed_transitions.get(current_status, []),
		'can_set_livre': 'Livré' in allowed_transitions.get(current_status, []),
		'can_cancel': 'Annulé' in allowed_transitions.get(current_status, []),
		'can_mark_not_delivered': 'Non Livré' in allowed_transitions.get(current_status, [])
	}
	
	# Actions sur les articles (si le colis est enlevé ou partiellement livré)
	article_actions = {
		'can_deliver_articles': current_status in ['Enlevé', 'Partiellement Livré'],
		'delivery_message': 'Le colis doit être "Enlevé" ou "Partiellement Livré" pour pouvoir livrer des articles' if current_status not in ['Enlevé', 'Partiellement Livré'] else None
	}
	
	return {
		'current_status': current_status,
		'status_actions': status_actions,
		'article_actions': article_actions,
		'allowed_next_statuses': allowed_transitions.get(current_status, [])
	}


@frappe.whitelist()
def set_status_nouveau(docname, confirm=False):
	"""Met le colis au statut Nouveau
	
	Args:
		docname (str): Le nom du document Colis
		confirm (bool): Confirmation de l'utilisateur
	
	Returns:
		dict: Résultat de l'opération
	"""
	doc = frappe.get_doc("Colis", docname)
	previous_status = doc.status
	
	# Validation de la transition
	is_valid, error_msg = validate_status_transition(previous_status, 'Nouveau')
	if not is_valid:
		return {
			'success': False,
			'message': error_msg
		}
	
	if not confirm:
		return {
			'success': False,
			'require_confirmation': True,
			'message': f'Êtes-vous sûr de vouloir remettre ce colis au statut "Nouveau" ?'
		}
	
	doc.status = 'Nouveau'
	doc.save()
	
	return {
		'success': True,
		'message': f'Statut mis à jour vers "Nouveau" (ancien statut: "{previous_status}")',
		'previous_status': previous_status,
		'new_status': 'Nouveau'
	}


@frappe.whitelist()
def set_status_prepare(docname, confirm=False):
	"""Met le colis au statut Préparé
	
	Args:
		docname (str): Le nom du document Colis
		confirm (bool): Confirmation de l'utilisateur
	
	Returns:
		dict: Résultat de l'opération
	"""
	doc = frappe.get_doc("Colis", docname)
	previous_status = doc.status
	
	# Validation de la transition
	is_valid, error_msg = validate_status_transition(previous_status, 'Préparé')
	if not is_valid:
		return {
			'success': False,
			'message': error_msg
		}
	
	if not confirm:
		return {
			'success': False,
			'require_confirmation': True,
			'message': f'Êtes-vous sûr de vouloir marquer ce colis comme "Préparé" ?'
		}
	
	doc.status = 'Préparé'
	doc.save()
	
	return {
		'success': True,
		'message': f'Statut mis à jour vers "Préparé" (ancien statut: "{previous_status}")',
		'previous_status': previous_status,
		'new_status': 'Préparé'
	}


@frappe.whitelist()
def set_status_enleve(docname, confirm=False):
	"""Met le colis au statut Enlevé
	
	Args:
		docname (str): Le nom du document Colis
		confirm (bool): Confirmation de l'utilisateur
	
	Returns:
		dict: Résultat de l'opération
	"""
	doc = frappe.get_doc("Colis", docname)
	previous_status = doc.status
	
	# Validation de la transition
	is_valid, error_msg = validate_status_transition(previous_status, 'Enlevé')
	if not is_valid:
		return {
			'success': False,
			'message': error_msg
		}
	
	if not confirm:
		return {
			'success': False,
			'require_confirmation': True,
			'message': f'Êtes-vous sûr de vouloir marquer ce colis comme "Enlevé" ?'
		}
	
	doc.status = 'Enlevé'
	doc.save()
	
	return {
		'success': True,
		'message': f'Statut mis à jour vers "Enlevé" (ancien statut: "{previous_status}")',
		'previous_status': previous_status,
		'new_status': 'Enlevé'
	}


@frappe.whitelist()
def set_status_livre(docname, confirm=False):
	"""Met le colis au statut Livré
	
	Args:
		docname (str): Le nom du document Colis
		confirm (bool): Confirmation de l'utilisateur
	
	Returns:
		dict: Résultat de l'opération
	"""
	doc = frappe.get_doc("Colis", docname)
	previous_status = doc.status
	
	# Validation de la transition
	is_valid, error_msg = validate_status_transition(previous_status, 'Livré')
	if not is_valid:
		return {
			'success': False,
			'message': error_msg
		}
	
	if not confirm:
		return {
			'success': False,
			'require_confirmation': True,
			'message': f'Êtes-vous sûr de vouloir marquer ce colis comme "Livré" ?'
		}
	
	doc.status = 'Livré'
	doc.save()
	
	return {
		'success': True,
		'message': f'Statut mis à jour vers "Livré" (ancien statut: "{previous_status}")',
		'previous_status': previous_status,
		'new_status': 'Livré'
	}


@frappe.whitelist()
def set_status_cancelled(docname, confirm=False):
	"""Met le colis au statut Annulé
	
	Args:
		docname (str): Le nom du document Colis
		confirm (bool): Confirmation de l'utilisateur
	
	Returns:
		dict: Résultat de l'opération
	"""
	doc = frappe.get_doc("Colis", docname)
	previous_status = doc.status
	
	# Validation de la transition
	is_valid, error_msg = validate_status_transition(previous_status, 'Annulé')
	if not is_valid:
		return {
			'success': False,
			'message': error_msg
		}
	
	if not confirm:
		return {
			'success': False,
			'require_confirmation': True,
			'message': f'Êtes-vous sûr de vouloir annuler ce colis ?'
		}
	
	doc.status = 'Annulé'
	doc.save()
	
	return {
		'success': True,
		'message': f'Colis annulé (ancien statut: "{previous_status}")',
		'previous_status': previous_status,
		'new_status': 'Annulé'
	}


@frappe.whitelist()
def set_status_not_delivered(docname, confirm=False):
	"""Met le colis au statut Non Livré
	
	Args:
		docname (str): Le nom du document Colis
		confirm (bool): Confirmation de l'utilisateur
	
	Returns:
		dict: Résultat de l'opération
	"""
	doc = frappe.get_doc("Colis", docname)
	previous_status = doc.status
	
	# Validation de la transition
	is_valid, error_msg = validate_status_transition(previous_status, 'Non Livré')
	if not is_valid:
		return {
			'success': False,
			'message': error_msg
		}
	
	if not confirm:
		return {
			'success': False,
			'require_confirmation': True,
			'message': f'Êtes-vous sûr de marquer ce colis comme non livré ? (Statut actuel: "{previous_status}")'
		}
	
	doc.status = 'Non Livré'
	doc.save()
	
	return {
		'success': True,
		'message': f'Colis marqué comme non livré (ancien statut: "{previous_status}")',
		'previous_status': previous_status,
		'new_status': 'Non Livré'
	}


@frappe.whitelist()
def download_qr_code(docname):
	"""Télécharge le QR code existant d'un colis ou en génère un nouveau si nécessaire
	
	Args:
		docname (str): Le nom du document Colis
	
	Returns:
		Response: Réponse HTTP avec le fichier QR code
	"""
	# Récupérer le document Colis
	doc = frappe.get_doc("Colis", docname)
	
	# Vérifier si une image QR code existe déjà
	if doc.image:
		# Récupérer le fichier existant
		file_path = frappe.get_site_path() + doc.image
		try:
			with open(file_path, 'rb') as f:
				content = f.read()
			
			# Renvoyer le fichier existant pour téléchargement
			frappe.response['filecontent'] = content
			frappe.response['filename'] = f"qr_code_{doc.name}.png"
			frappe.response['type'] = 'download'
			return
		except Exception:
			# Si le fichier n'est pas accessible, générer un nouveau QR code
			pass
	
	# Générer un nouveau QR code avec l'URL publique
	site_url = frappe.utils.get_url()
	public_url = f"{site_url}/colis_info?id={doc.name}"
	
	# Créer le QR code avec les mêmes paramètres optimisés que dans generate_qr_code
	qr = qrcode.QRCode(
		version=4,  # Version plus élevée pour plus de données
		error_correction=qrcode.constants.ERROR_CORRECT_M,
		box_size=6,
		border=2,
	)
	qr.add_data(public_url)  # Utiliser l'URL publique directement
	qr.make(fit=True)
	
	# Créer l'image
	img = qr.make_image(fill_color="black", back_color="white")
	
	# Préparer le buffer pour le téléchargement
	buffer = io.BytesIO()
	img.save(buffer, format="PNG", optimize=True)  # Optimiser l'image PNG
	buffer.seek(0)
	
	# Renvoyer le fichier pour téléchargement
	frappe.response['filecontent'] = buffer.getvalue()
	frappe.response['filename'] = f"qr_code_{doc.name}.png"
	frappe.response['type'] = 'download'


@frappe.whitelist()
def deliver_article_quantity(docname, article_name, quantity, confirm=False):
	"""Livre une quantité spécifique d'un article
	
	Args:
		docname (str): Le nom du document Colis
		article_name (str): Le nom de l'article dans la table
		quantity (int): La quantité à livrer
		confirm (bool): Confirmation de l'utilisateur
	
	Returns:
		dict: Résultat de l'opération
	"""
	if not confirm:
		return {
			'success': False,
			'require_confirmation': True,
			'message': f'Êtes-vous sûr de vouloir livrer {quantity} unités de cet article ?'
		}
	
	try:
		quantity = int(quantity)
		if quantity <= 0:
			return {
				'success': False,
				'message': 'La quantité doit être positive'
			}
		
		# Récupérer le document colis
		colis_doc = frappe.get_doc("Colis", docname)
		
		# Trouver l'article dans la table
		article_doc = None
		for article in colis_doc.articles:
			if article.name == article_name:
				article_doc = frappe.get_doc("Articles Colis", article.name)
				break
		
		if not article_doc:
			return {
				'success': False,
				'message': 'Article non trouvé'
			}
		
		# Utiliser la méthode de livraison de l'article
		result = article_doc.deliver_quantity(quantity)
		
		# Recharger le document colis pour récupérer les modifications
		colis_doc.reload()
		
		# Recalculer le statut global du colis
		colis_doc.calculate_global_status()
		colis_doc.save()
		
		# Forcer la validation et sauvegarde du document parent
		frappe.db.commit()
		
		# Ajouter les données complètes de l'article pour la mise à jour de l'interface
		if result.get('success'):
			result['article_data'] = {
				'quantite_totale': article_doc.quantite_totale,
				'quantite_livree': article_doc.quantite_livree,
				'quantite_restante': article_doc.quantite_restante,
				'statut_article': article_doc.statut_article
			}
		
		return result
		
	except Exception as e:
		frappe.log_error(f"Erreur lors de la livraison partielle: {e}")
		return {
			'success': False,
			'message': f'Erreur: {str(e)}'
		}


@frappe.whitelist()
def deliver_article_remaining(docname, article_name, confirm=False):
	"""Livre toute la quantité restante d'un article
	
	Args:
		docname (str): Le nom du document Colis
		article_name (str): Le nom de l'article dans la table
		confirm (bool): Confirmation de l'utilisateur
	
	Returns:
		dict: Résultat de l'opération
	"""
	if not confirm:
		return {
			'success': False,
			'require_confirmation': True,
			'message': 'Êtes-vous sûr de vouloir livrer toute la quantité restante de cet article ?'
		}
	
	try:
		# Récupérer le document colis
		colis_doc = frappe.get_doc("Colis", docname)
		
		# Trouver l'article dans la table
		article_doc = None
		for article in colis_doc.articles:
			if article.name == article_name:
				article_doc = frappe.get_doc("Articles Colis", article.name)
				break
		
		if not article_doc:
			return {
				'success': False,
				'message': 'Article non trouvé'
			}
		
		# Utiliser la méthode de livraison complète de l'article
		result = article_doc.deliver_remaining()
		
		# Recharger le document colis pour récupérer les modifications
		colis_doc.reload()
		
		# Recalculer le statut global du colis
		colis_doc.calculate_global_status()
		colis_doc.save()
		
		# Forcer la validation et sauvegarde du document parent
		frappe.db.commit()
		
		# Ajouter les données complètes de l'article pour la mise à jour de l'interface
		if result.get('success'):
			result['article_data'] = {
				'quantite_totale': article_doc.quantite_totale,
				'quantite_livree': article_doc.quantite_livree,
				'quantite_restante': article_doc.quantite_restante,
				'statut_article': article_doc.statut_article
			}
		
		return result
		
	except Exception as e:
		frappe.log_error(f"Erreur lors de la livraison complète: {e}")
		return {
			'success': False,
			'message': f'Erreur: {str(e)}'
		}


@frappe.whitelist()
def mark_article_undeliverable(docname, article_name, reason="", confirm=False):
	"""Marque un article comme non livrable
	
	Args:
		docname (str): Le nom du document Colis
		article_name (str): Le nom de l'article dans la table
		reason (str): Raison pour laquelle l'article n'est pas livrable
		confirm (bool): Confirmation de l'utilisateur
	
	Returns:
		dict: Résultat de l'opération
	"""
	if not confirm:
		return {
			'success': False,
			'require_confirmation': True,
			'message': 'Êtes-vous sûr de vouloir marquer cet article comme non livrable ?'
		}
	
	try:
		# Récupérer le document colis
		colis_doc = frappe.get_doc("Colis", docname)
		
		# Trouver l'article dans la table
		article_doc = None
		for article in colis_doc.articles:
			if article.name == article_name:
				article_doc = frappe.get_doc("Articles Colis", article.name)
				break
		
		if not article_doc:
			return {
				'success': False,
				'message': 'Article non trouvé'
			}
		
		# Marquer l'article comme non livrable
		result = article_doc.mark_as_undeliverable(reason)
		
		# Recharger le document colis pour récupérer les modifications
		colis_doc.reload()
		
		# Recalculer le statut global du colis
		colis_doc.calculate_global_status()
		colis_doc.save()
		
		# Forcer la validation et sauvegarde du document parent
		frappe.db.commit()
		
		# Ajouter les données complètes de l'article pour la mise à jour de l'interface
		if result.get('success'):
			result['article_data'] = {
				'quantite_totale': article_doc.quantite_totale,
				'quantite_livree': article_doc.quantite_livree,
				'quantite_restante': article_doc.quantite_restante,
				'statut_article': article_doc.statut_article
			}
		
		return result
		
	except Exception as e:
		frappe.log_error(f"Erreur lors du marquage non livrable: {e}")
		return {
			'success': False,
			'message': f'Erreur: {str(e)}'
		}


@frappe.whitelist()
def deliver_all_articles(docname, confirm=False):
	"""Livre tous les articles restants d'un colis
	
	Args:
		docname (str): Le nom du document Colis
		confirm (bool): Confirmation de l'utilisateur
	
	Returns:
		dict: Résultat de l'opération
	"""
	if not confirm:
		return {
			'success': False,
			'require_confirmation': True,
			'message': 'Êtes-vous sûr de vouloir livrer tous les articles restants ?'
		}
	
	try:
		# Récupérer le document colis
		colis_doc = frappe.get_doc("Colis", docname)
		
		# Compter les articles livrables
		articles_livres = 0
		articles_total = 0
		
		# Livrer tous les articles qui peuvent l'être
		for article in colis_doc.articles:
			article_doc = frappe.get_doc("Articles Colis", article.name)
			articles_total += 1
			
			# Vérifier si l'article peut être livré (quantité restante > 0 et statut approprié)
			if (article_doc.quantite_restante > 0 and 
				article_doc.statut_article in ['En Attente', 'Partiellement Livré']):
				
				# Livrer la quantité restante
				result = article_doc.deliver_remaining()
				if result.get('success'):
					articles_livres += 1
		
		# Recharger le document colis pour récupérer les modifications
		colis_doc.reload()
		
		# Recalculer le statut global du colis
		colis_doc.calculate_global_status()
		colis_doc.save()
		
		# Forcer la validation et sauvegarde du document parent
		frappe.db.commit()
		
		if articles_livres > 0:
			return {
				'success': True,
				'message': f'{articles_livres} article(s) livré(s) avec succès'
			}
		else:
			return {
				'success': False,
				'message': 'Aucun article à livrer'
			}
		
	except Exception as e:
		frappe.log_error(f"Erreur lors de la livraison de tous les articles: {e}")
		return {
			'success': False,
			'message': f'Erreur: {str(e)}'
		}
