# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import qrcode
import io
import base64


class Colis(Document):
	def validate(self):
		"""Validation du document Colis"""
		try:
			# Validation basique
			if not self.bl:
				frappe.throw("Le champ BL (Delivery Note) est obligatoire")
			
			# Validation de la cohérence avec la préparation
			if self.preparation:
				self.validate_preparation_consistency()
			
			# Calculer le statut global si des articles existent
			if self.articles:
				self.calculate_global_status(use_smart_status=False)  # Éviter la récursion lors de la validation
			
		except Exception as e:
			frappe.logger().error(f"Erreur lors de la validation du Colis {self.name}: {e}")
			# Ne pas bloquer la validation pour des erreurs de calcul de statut
			pass
	
	def validate_preparation_consistency(self):
		"""Valide la cohérence entre le colis et sa préparation"""
		if not self.preparation:
			return
		
		try:
			# Récupérer la préparation
			preparation = frappe.get_doc("Preparation", self.preparation)
			
			# Vérifier que le client correspond
			if self.client != preparation.client:
				frappe.throw(f"Le client du colis ({self.client}) ne correspond pas au client de la préparation ({preparation.client})")
			
			# Vérifier que le bon de livraison est dans la préparation
			bl_in_preparation = any(
				article.bon_de_livraison == self.bl 
				for article in preparation.articles
			)
			
			if not bl_in_preparation:
				frappe.throw(f"Le bon de livraison {self.bl} n'est pas présent dans la préparation {self.preparation}")
			
			# Vérifier que les articles du colis correspondent aux articles préparés
			prep_articles = {
				(article.article, article.bon_de_livraison): article.quantite_preparee
				for article in preparation.articles
				if article.bon_de_livraison == self.bl
			}
			
			for colis_article in self.articles:
				key = (colis_article.article, self.bl)
				if key not in prep_articles:
					frappe.throw(f"L'article {colis_article.article} n'est pas dans la préparation pour le bon de livraison {self.bl}")
				
				# Vérifier que la quantité totale ne dépasse pas la quantité préparée
				if colis_article.quantite_totale > prep_articles[key]:
					frappe.throw(f"La quantité totale de l'article {colis_article.article} ({colis_article.quantite_totale}) dépasse la quantité préparée ({prep_articles[key]})")
			
		except Exception as e:
			if "n'est pas" in str(e) or "ne correspond pas" in str(e) or "dépasse" in str(e):
				# Re-lever les erreurs de validation métier
				raise
			else:
				# Logger les autres erreurs sans bloquer
				frappe.logger().error(f"Erreur lors de la validation de cohérence pour {self.name}: {str(e)}")
				pass

	def autoname(self):
		"""Génère automatiquement le nom du document au format {bl}-{numero_fixe}"""
		if self.bl:
			# Compter le nombre de colis existants pour cette delivery note
			existing_colis = frappe.db.count("Colis", {"bl": self.bl, "docstatus": ["<", 2]})
			
			# Calculer le numéro fixe du nouveau colis (nombre existant + 1)
			numero_fixe = existing_colis + 1
			
			# Stocker le numéro fixe dans custom_numero_sequence
			self.custom_numero_sequence = str(numero_fixe)
			
			# Générer le nom au format {bl}-{numero_fixe}
			self.name = f"{self.bl}-{numero_fixe}"
		else:
			# Fallback au comportement par défaut si bl n'est pas défini
			pass


	

	
	def sync_with_preparation(self):
		"""Synchronise les quantités livrées avec la Préparation associée"""
		if not self.preparation or not self.articles:
			return
		
		try:
			# Récupérer la Préparation
			preparation = frappe.get_doc("Preparation", self.preparation)
			
			# Créer un dictionnaire des quantités livrées par article
			delivered_quantities = {}
			for article in self.articles:
				if article.article and article.quantite_livree > 0:
					key = (article.article, self.bl)  # Clé combinée article + bon de livraison
					if key in delivered_quantities:
						delivered_quantities[key] += article.quantite_livree
					else:
						delivered_quantities[key] = article.quantite_livree
			
			# Mettre à jour les quantités dans la Préparation
			for prep_article in preparation.articles:
				key = (prep_article.article, prep_article.bon_de_livraison)
				if key in delivered_quantities:
					# Calculer la nouvelle quantité livrée
					new_delivered_qty = delivered_quantities[key]
					
					# S'assurer que la quantité livrée ne dépasse pas la quantité préparée
					if new_delivered_qty > prep_article.quantite_preparee:
						new_delivered_qty = prep_article.quantite_preparee
					
					# Mettre à jour les quantités dans l'article de préparation
					if hasattr(prep_article, 'quantite_livree'):
						prep_article.quantite_livree = new_delivered_qty
			
			# Sauvegarder la Préparation avec les nouvelles quantités
			preparation.save(ignore_permissions=True)
			
			frappe.logger().info(f"Synchronisation réussie avec Préparation {self.preparation}")
			
		except Exception as e:
			frappe.logger().error(f"Erreur lors de la synchronisation avec Préparation {self.preparation}: {str(e)}")
			# Ne pas lever l'erreur pour éviter de bloquer la sauvegarde du Colis
	
	def sync_with_delivery_note(self):
		"""Synchronise les quantités livrées avec le Delivery Note associé (méthode de compatibilité)"""
		# Si le colis est lié à une préparation, synchroniser avec la préparation
		if self.preparation:
			self.sync_with_preparation()
			return
		
		# Sinon, utiliser l'ancienne logique pour la compatibilité
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
	
	def calculate_global_status(self, use_smart_status=True):
		"""Calcule automatiquement le statut global du colis basé sur les statuts des articles
		
		Args:
			use_smart_status (bool): Utiliser le système de statut intelligent avec seuils
		"""
		if not self.articles:
			return
		
		if use_smart_status:
			# Utiliser le système de statut intelligent
			try:
				# Éviter la récursion infinie en vérifiant si on est déjà en train de calculer
				if getattr(self, '_calculating_smart_status', False):
					frappe.logger().warning(f"Évitement de récursion pour {self.name}")
					return
				
				self._calculating_smart_status = True
				result = calculate_smart_status(self.name, force_recalculate=True)
				if result.get('success') and result.get('status_changed'):
					self.status = result['new_status']
					frappe.logger().info(f"Statut intelligent appliqué pour {self.name}: {result['new_status']}")
					return
			except Exception as e:
				frappe.logger().warning(f"Erreur calcul statut intelligent pour {self.name}: {e}")
				# Retomber sur la logique classique en cas d'erreur
			finally:
				self._calculating_smart_status = False
		
		# Logique classique de calcul du statut global (fallback)
		article_statuses = [article.statut_article for article in self.articles if article.statut_article]
		
		if not article_statuses:
			return
		
		# Logique de calcul du statut global
		if all(status == "Livré" for status in article_statuses):
			self.status = "Livré"
		elif all(status == "En attente" for status in article_statuses):
			# Définir le statut "Nouveau" si tous les articles sont en attente et aucun statut n'est défini
			if not self.status or self.status in ["Draft", ""]:
				self.status = "Nouveau"
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
		
		# Vérifier si un QR code existe déjà (champ image non vide)
		if self.image and self.image.strip():
			# Permettre la régénération si demandée explicitement
			if not getattr(self, '_force_regenerate_qr', False):
				frappe.msgprint("Un QR code existe déjà pour ce colis.", indicator="blue")
				return
		
		# Construire l'URL complète vers l'interface livreurs React
		site_url = frappe.utils.get_url()
		# URL vers l'application React avec paramètre de requête pour accès direct
		frontend_url = f"{site_url}/Colis?colis={self.name}"
		
		# URL vers l'application Frappe (pour les utilisateurs authentifiés)
		app_url = f"{site_url}/app/colis/{self.name}"
		
		# Préparer les données à encoder dans le QR code
		# Format JSON pour inclure plus d'informations
		qr_data = {
			"id": self.name,
			"url": frontend_url,  # URL de l'application React pour accès direct aux détails du colis
			"app_url": app_url,  # URL de l'application Frappe pour les utilisateurs authentifiés
			"client": self.client if self.client else "",
			"date": str(self.date) if self.date else "",
			"status": self.status if self.status else ""
		}
		
		# Pour les scanners QR simples qui ne supportent que les URL, utiliser directement l'URL de l'application React
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
	def regenerate_qr_code(self):
		"""Force la régénération du QR code en supprimant l'ancien"""
		if not self.name or self.name == "new-colis":
			return
		
		# Supprimer l'ancien QR code
		if self.image:
			# Supprimer le fichier existant
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
			
			# Vider le champ image
			self.image = None
		
		# Forcer la régénération
		self._force_regenerate_qr = True
		self.generate_qr_code()
		self._force_regenerate_qr = False
		
		frappe.msgprint("QR code régénéré avec succès.", indicator="green")


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


@frappe.whitelist(allow_guest=True)
def get_colis_info(colis_id):
	"""Méthode publique pour récupérer les informations d'un colis"""
	try:
		# Récupérer le document colis
		colis = frappe.get_doc("Colis", colis_id)
		
		# Préparer les données de base
		data = {
			"name": colis.name,
			"status": colis.status,
			"client": colis.client,
			"bl": colis.bl,
			"date_creation": colis.creation,
			"articles": []
		}
		
		# Ajouter les articles
		for article in colis.articles:
			# Récupérer les détails de l'article depuis le doctype Item
			item_doc = frappe.get_doc("Item", article.article)
			
			article_data = {
				"name": article.name,
				"article": article.article,
				"item_name": item_doc.item_name,
				"quantite_totale": article.quantite_totale,
				"quantite_livree": article.quantite_livree,
				"quantite_restante": article.quantite_restante,
				"statut_article": article.statut_article
			}
			data["articles"].append(article_data)
		
		return data
		
	except frappe.DoesNotExistError:
		return {"error": "Colis non trouvé"}
	except Exception as e:
		frappe.log_error(f"Erreur get_colis_info: {str(e)}")
		return {"error": f"Erreur lors de la récupération des données: {str(e)}"}


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


@frappe.whitelist()
def upload_photo_livraison(colis_id, file_data, filename):
	"""Upload une photo de livraison pour un colis
	
	Args:
		colis_id (str): L'ID du colis
		file_data (str): Les données du fichier en base64
		filename (str): Le nom du fichier
	
	Returns:
		dict: Résultat de l'upload avec l'URL du fichier
	"""
	try:
		frappe.logger().info(f"Début upload_photo_livraison pour colis_id: {colis_id}")
		
		# Vérifier que colis_id n'est pas vide
		if not colis_id or colis_id == 'undefined' or colis_id == 'null':
			frappe.logger().error(f"colis_id invalide: {colis_id}")
			return {
				'success': False,
				'message': f'ID du colis invalide: {colis_id}'
			}
		
		# Vérifier que le colis existe
		try:
			colis = frappe.get_doc("Colis", colis_id)
			frappe.logger().info(f"Colis trouvé: {colis.name}")
		except frappe.DoesNotExistError:
			frappe.logger().error(f"Colis {colis_id} introuvable")
			return {
				'success': False,
				'message': f'Colis {colis_id} introuvable'
			}
		
		# Décoder les données base64
		import base64
		file_content = base64.b64decode(file_data.split(',')[1] if ',' in file_data else file_data)
		frappe.logger().info(f"Fichier décodé, taille: {len(file_content)} bytes")
		
		# Créer le document File directement
		file_doc = frappe.get_doc({
			"doctype": "File",
			"file_name": filename,
			"attached_to_doctype": "Colis",
			"attached_to_name": colis_id,
			"content": file_content,
			"is_private": 0
		})
		
		# Insérer le fichier et récupérer l'URL
		file_doc.insert()
		file_url = file_doc.file_url
		frappe.logger().info(f"Fichier créé avec URL: {file_url}")
		
		# Mettre à jour le champ photo_livraison du colis
		colis.photo_livraison = file_url
		colis.save()
		frappe.logger().info(f"Colis mis à jour avec photo_livraison: {file_url}")
		
		return {
			'success': True,
			'file_url': file_url,
			'message': 'Photo uploadée avec succès'
		}
		
	except Exception as e:
		frappe.log_error(f"Erreur upload_photo_livraison: {str(e)}")
		frappe.logger().error(f"Exception détaillée: {e}")
		return {
			'success': False,
			'message': f'Erreur lors de l\'upload: {str(e)}'
		}


@frappe.whitelist()
def delete_photo_livraison(colis_id):
	"""Supprime la photo de livraison d'un colis
	
	Args:
		colis_id (str): L'ID du colis
	
	Returns:
		dict: Résultat de la suppression
	"""
	try:
		frappe.logger().info(f"Début delete_photo_livraison pour colis_id: {colis_id}")
		
		# Vérifier que colis_id n'est pas vide
		if not colis_id or colis_id == 'undefined' or colis_id == 'null':
			frappe.logger().error(f"colis_id invalide: {colis_id}")
			return {
				'success': False,
				'message': f'ID du colis invalide: {colis_id}'
			}
		
		# Vérifier que le colis existe
		try:
			colis = frappe.get_doc("Colis", colis_id)
			frappe.logger().info(f"Colis trouvé: {colis.name}")
		except frappe.DoesNotExistError:
			frappe.logger().error(f"Colis {colis_id} introuvable")
			return {
				'success': False,
				'message': f'Colis {colis_id} introuvable'
			}
		
		# Vérifier s'il y a une photo à supprimer
		if not colis.photo_livraison:
			frappe.logger().info(f"Aucune photo à supprimer pour le colis {colis_id}")
			return {
				'success': True,
				'message': 'Aucune photo à supprimer'
			}
		
		# Extraire le nom du fichier depuis l'URL
		file_url = colis.photo_livraison
		file_name = file_url.split('/')[-1] if '/' in file_url else file_url
		frappe.logger().info(f"Tentative de suppression du fichier: {file_name}")
		
		# Chercher et supprimer le document File correspondant
		try:
			# Chercher le fichier attaché à ce colis
			files = frappe.get_all("File", 
				filters={
					"attached_to_doctype": "Colis",
					"attached_to_name": colis_id,
					"file_url": file_url
				},
				fields=["name"]
			)
			
			if files:
				for file_record in files:
					file_doc = frappe.get_doc("File", file_record.name)
					file_doc.delete()
					frappe.logger().info(f"Fichier supprimé: {file_record.name}")
			else:
				frappe.logger().warning(f"Aucun fichier trouvé pour l'URL: {file_url}")
			
		except Exception as file_error:
			frappe.logger().warning(f"Erreur lors de la suppression du fichier: {str(file_error)}")
			# Continuer même si la suppression du fichier échoue
		
		# Mettre à jour le champ photo_livraison du colis (le vider)
		colis.photo_livraison = None
		colis.save()
		frappe.logger().info(f"Champ photo_livraison vidé pour le colis {colis_id}")
		
		return {
			'success': True,
			'message': 'Photo supprimée avec succès'
		}
		
	except Exception as e:
		frappe.log_error(f"Erreur delete_photo_livraison: {str(e)}")
		frappe.logger().error(f"Exception détaillée: {e}")
		return {
			'success': False,
			'message': f'Erreur lors de la suppression: {str(e)}'
		}


@frappe.whitelist(allow_guest=True)
def get_public_colis_data(colis_id):
	"""API publique pour récupérer les données limitées d'un colis sans authentification"""
	try:
		# Vérifier que le colis existe
		if not frappe.db.exists('Colis', colis_id):
			frappe.throw("Colis non trouvé", frappe.DoesNotExistError)
		
		# Récupérer les données publiques du colis
		colis_doc = frappe.get_doc("Colis", colis_id)
		
		return {
			'success': True,
			'data': {
				'name': colis_doc.name,
				'custom_numero_sequence': getattr(colis_doc, 'custom_numero_sequence', ''),
				'client': colis_doc.client,
				'status': colis_doc.status,
				'date_creation': colis_doc.creation,
				'wilaya_destination': getattr(colis_doc, 'wilaya_destination', ''),
				'commune_destination': getattr(colis_doc, 'commune_destination', '')
			}
		}
		
	except Exception as e:
		frappe.log_error(f"Erreur get_public_colis_data: {str(e)}")
		return {
			'success': False,
			'message': f'Erreur lors de la récupération: {str(e)}'
		}


@frappe.whitelist()
def enhanced_delivery_update(colis_id, delivery_data, evidence_data=None):
	"""API améliorée pour mise à jour de livraison avec gestion avancée des articles
	
	Args:
		colis_id (str): ID du colis
		delivery_data (dict): Données de livraison avec articles et quantités
		evidence_data (dict): Photos, signature, GPS, commentaires (optionnel)
	
	Returns:
		dict: Résultat détaillé de l'opération
	"""
	try:
		frappe.logger().info(f"Début enhanced_delivery_update pour colis {colis_id}")
		
		# Vérifier que le colis existe
		if not frappe.db.exists('Colis', colis_id):
			return {
				'success': False,
				'message': 'Colis non trouvé'
			}
		
		colis_doc = frappe.get_doc("Colis", colis_id)
		results = []
		errors = []
		
		# Parser les données de livraison
		if isinstance(delivery_data, str):
			import json
			delivery_data = json.loads(delivery_data)
		
		# Traiter chaque article
		for article_update in delivery_data.get('articles', []):
			article_name = article_update.get('article_name')
			quantity_delivered = article_update.get('quantity_delivered', 0)
			reason = article_update.get('reason', '')
			status = article_update.get('status', '')
			
			try:
				# Trouver l'article dans le colis
				article_found = None
				for article in colis_doc.articles:
					if (article.name == article_name or 
					    article.article == article_name):
						article_found = article
						break
				
				if not article_found:
					errors.append(f"Article {article_name} non trouvé")
					continue
				
				# Sauvegarder les valeurs actuelles
				old_livree = article_found.quantite_livree or 0
				old_restante = article_found.quantite_restante or 0
				totale = article_found.quantite_totale or 0
				
				# Traitement selon le type d'action
				if status == 'delivered' and quantity_delivered > 0:
					# Livraison partielle ou complète
					new_livree = min(old_livree + quantity_delivered, totale)
					new_restante = totale - new_livree
					
					article_found.quantite_livree = new_livree
					article_found.quantite_restante = new_restante
					
					if new_restante == 0:
						article_found.statut_article = "Livré"
					elif new_livree > 0:
						article_found.statut_article = "Partiellement livré"
					else:
						article_found.statut_article = "En attente"
					
				elif status == 'undeliverable':
					# Article non livrable
					article_found.statut_article = "Non livré"
					if reason:
						article_found.raison_non_livraison = reason
					
				elif status == 'deliver_all':
					# Livrer tout le restant
					article_found.quantite_livree = totale
					article_found.quantite_restante = 0
					article_found.statut_article = "Livré"
					
				else:
					errors.append(f"Action non reconnue pour l'article {article_name}: {status}")
					continue
				
				results.append({
					'article_name': article_name,
					'success': True,
					'message': f'Article {article_name} mis à jour',
					'updated_data': {
						'quantite_totale': article_found.quantite_totale,
						'quantite_livree': article_found.quantite_livree,
						'quantite_restante': article_found.quantite_restante,
						'statut_article': article_found.statut_article
					}
				})
				
			except Exception as e:
				frappe.log_error(f"Erreur traitement article {article_name}: {str(e)}")
				errors.append(f"Erreur article {article_name}: {str(e)}")
		
		# Traiter les données de preuve (photos, signature, etc.)
		if evidence_data:
			try:
				if isinstance(evidence_data, str):
					import json
					evidence_data = json.loads(evidence_data)
				
				# Gérer les commentaires
				if evidence_data.get('comments'):
					colis_doc.commentaire_livreur = evidence_data['comments']
					results.append({'evidence': 'comments', 'success': True})
				
			except Exception as e:
				frappe.log_error(f"Erreur traitement evidence: {str(e)}")
				errors.append(f"Erreur données de preuve: {str(e)}")
		
		# Recalculer le statut global du colis
		try:
			total_articles = len(colis_doc.articles)
			delivered_articles = sum(1 for a in colis_doc.articles if a.statut_article == "Livré")
			partial_articles = sum(1 for a in colis_doc.articles if a.statut_article == "Partiellement livré")
			non_delivered_articles = sum(1 for a in colis_doc.articles if a.statut_article == "Non livré")
			
			if delivered_articles == total_articles:
				colis_doc.status = "Livré"
			elif delivered_articles > 0 or partial_articles > 0:
				colis_doc.status = "Partiellement Livré"
			elif non_delivered_articles == total_articles:
				colis_doc.status = "Non Livré"
			else:
				colis_doc.status = "Enlevé"
			
		except Exception as e:
			frappe.log_error(f"Erreur calcul statut global: {str(e)}")
			errors.append(f"Erreur calcul statut: {str(e)}")
		
		# Sauvegarder le colis
		try:
			colis_doc.save()
			frappe.db.commit()
		except Exception as e:
			frappe.log_error(f"Erreur sauvegarde colis: {str(e)}")
			return {
				'success': False,
				'message': f'Erreur lors de la sauvegarde: {str(e)}'
			}
		
		# Préparer la réponse
		success_count = len([r for r in results if r.get('success')])
		total_operations = len(delivery_data.get('articles', []))
		
		return {
			'success': len(errors) == 0,
			'message': f"Opération terminée: {success_count}/{total_operations} articles traités avec succès",
			'results': results,
			'errors': errors,
			'updated_colis_status': colis_doc.status,
			'updated_colis_data': {
				'status': colis_doc.status,
				'articles': [{
					'name': article.name,
					'article': article.article,
					'quantite_totale': article.quantite_totale,
					'quantite_livree': article.quantite_livree,
					'quantite_restante': article.quantite_restante,
					'statut_article': article.statut_article
				} for article in colis_doc.articles]
			}
		}
		
	except Exception as e:
		frappe.log_error(f"Erreur enhanced_delivery_update: {str(e)}")
		return {
			'success': False,
			'message': f'Erreur lors de la mise à jour: {str(e)}'
		}


@frappe.whitelist()
def get_smart_delivery_actions(colis_id):
	"""Retourne les actions de livraison intelligentes disponibles pour un colis
	
	Args:
		colis_id (str): ID du colis
	
	Returns:
		dict: Actions disponibles selon le contexte
	"""
	try:
		colis_doc = frappe.get_doc("Colis", colis_id)
		
		# Analyser l'état des articles
		total_articles = len(colis_doc.articles)
		delivered_articles = sum(1 for a in colis_doc.articles if a.statut_article == "Livré")
		partial_articles = sum(1 for a in colis_doc.articles if a.statut_article == "Partiellement livré")
		undelivered_articles = sum(1 for a in colis_doc.articles if a.statut_article in ["En attente", "Non livré"])
		
		# Calculer les quantités globales
		total_quantity = sum(a.quantite_totale for a in colis_doc.articles)
		delivered_quantity = sum(a.quantite_livree for a in colis_doc.articles)
		remaining_quantity = sum(a.quantite_restante for a in colis_doc.articles)
		
		# Déterminer les actions rapides disponibles
		quick_actions = []
		
		if remaining_quantity > 0:
			quick_actions.append({
				'id': 'deliver_all',
				'label': 'Livrer Tout',
				'description': f'Livrer les {remaining_quantity} articles restants',
				'type': 'success',
				'icon': 'check-circle'
			})
		
		if undelivered_articles > 0:
			quick_actions.extend([
				{
					'id': 'partial_delivery',
					'label': 'Livraison Partielle',
					'description': 'Livrer certains articles seulement',
					'type': 'warning',
					'icon': 'package'
				},
				{
					'id': 'client_absent',
					'label': 'Client Absent',
					'description': 'Marquer comme non livré - client absent',
					'type': 'error',
					'icon': 'user-x'
				},
				{
					'id': 'access_refused',
					'label': 'Accès Refusé',
					'description': 'Impossible d\'accéder au lieu de livraison',
					'type': 'error',
					'icon': 'lock'
				}
			])
		
		return {
			'success': True,
			'quick_actions': quick_actions,
			'delivery_summary': {
				'total_articles': total_articles,
				'delivered_articles': delivered_articles,
				'partial_articles': partial_articles,
				'undelivered_articles': undelivered_articles,
				'total_quantity': total_quantity,
				'delivered_quantity': delivered_quantity,
				'remaining_quantity': remaining_quantity,
				'completion_percentage': round((delivered_quantity / total_quantity * 100) if total_quantity > 0 else 0, 1)
			},
			'status_info': {
				'current_status': colis_doc.status,
				'can_complete': remaining_quantity == 0,
				'requires_partial_status': delivered_quantity > 0 and remaining_quantity > 0
			}
		}
		
	except Exception as e:
		frappe.log_error(f"Erreur get_smart_delivery_actions: {str(e)}")
		return {
			'success': False,
			'message': f'Erreur: {str(e)}'
		}


@frappe.whitelist()
def get_delivery_completion_config():
	"""Récupère la configuration des seuils de complétion de livraison
	
	Returns:
		dict: Configuration des seuils
	"""
	# Configuration par défaut (peut être stockée dans Frappe Settings)
	default_config = {
		'completion_thresholds': {
			'partial_threshold': 20,  # Seuil minimum pour "Partiellement Livré" (%)
			'nearly_complete_threshold': 80,  # Seuil pour "Presque Livré" (%)
			'complete_threshold': 100  # Seuil pour "Livré" (%)
		},
		'auto_status_transitions': {
			'enable_auto_transitions': True,
			'require_evidence_for_completion': True,
			'min_articles_for_partial': 1
		},
		'status_priorities': {
			'Nouveau': 1,
			'Préparé': 2,
			'Enlevé': 3,
			'Partiellement Livré': 4,
			'Presque Livré': 5,
			'Livré': 6,
			'Non Livré': 0,
			'Annulé': 0
		}
	}
	
	try:
		# Récupérer la configuration depuis les paramètres système si disponible
		settings = frappe.get_single('Parametres Livraison')
		if settings:
			# Récupérer les seuils personnalisés si définis
			if hasattr(settings, 'seuil_livraison_partielle') and settings.seuil_livraison_partielle:
				default_config['completion_thresholds']['partial_threshold'] = settings.seuil_livraison_partielle
			
			if hasattr(settings, 'seuil_presque_livre') and settings.seuil_presque_livre:
				default_config['completion_thresholds']['nearly_complete_threshold'] = settings.seuil_presque_livre
			
			if hasattr(settings, 'transitions_automatiques') and settings.transitions_automatiques is not None:
				default_config['auto_status_transitions']['enable_auto_transitions'] = settings.transitions_automatiques
	except Exception as e:
		frappe.logger().warning(f"Impossible de charger les paramètres de livraison: {e}")
	
	return {
		'success': True,
		'config': default_config
	}


@frappe.whitelist()
def calculate_smart_status(docname, force_recalculate=False):
	"""Calcule le statut intelligent basé sur les seuils de complétion
	
	Args:
		docname (str): Nom du document Colis
		force_recalculate (bool): Forcer le recalcul même si déjà calculé
	
	Returns:
		dict: Nouveau statut et métriques
	"""
	try:
		# Vérification de base
		if not docname:
			return {
				'success': False,
				'message': 'Document name is required'
			}
		
		# Vérifier que le document existe
		if not frappe.db.exists("Colis", docname):
			return {
				'success': False,
				'message': f'Colis document "{docname}" does not exist'
			}
		
		colis_doc = frappe.get_doc("Colis", docname)
		
		# Vérifier les permissions
		if not colis_doc.has_permission("read"):
			return {
				'success': False,
				'message': 'Insufficient permissions to read the document'
			}
		
		config_response = get_delivery_completion_config()
		config = config_response['config']
		
		# Calculer les métriques de livraison
		metrics = calculate_delivery_metrics(colis_doc.articles)
		
		# Déterminer le nouveau statut basé sur les seuils
		new_status = determine_smart_status(metrics, config, colis_doc.status)
		
		# Mettre à jour le statut si différent et si les transitions automatiques sont activées
		if (config['auto_status_transitions']['enable_auto_transitions'] and 
			new_status != colis_doc.status and 
			is_valid_status_transition(colis_doc.status, new_status, config)):
			
			old_status = colis_doc.status
			colis_doc.status = new_status
			colis_doc.save()
			
			# Log de la transition automatique
			frappe.logger().info(f"Transition automatique Colis {docname}: {old_status} → {new_status} (Completion: {metrics['completion_percentage']}%)")
			
			return {
				'success': True,
				'status_changed': True,
				'old_status': old_status,
				'new_status': new_status,
				'metrics': metrics,
				'message': f'Statut mis à jour automatiquement vers "{new_status}"'
			}
		else:
			return {
				'success': True,
				'status_changed': False,
				'current_status': colis_doc.status,
				'suggested_status': new_status,
				'metrics': metrics,
				'message': f'Statut actuel: "{colis_doc.status}", suggéré: "{new_status}"'
			}
			
	except frappe.DoesNotExistError:
		frappe.logger().error(f"Document Colis '{docname}' n'existe pas")
		return {
			'success': False,
			'message': f'Document Colis "{docname}" introuvable'
		}
	except frappe.PermissionError:
		frappe.logger().error(f"Permissions insuffisantes pour accéder au Colis '{docname}'")
		return {
			'success': False,
			'message': 'Permissions insuffisantes pour accéder au document'
		}
	except Exception as e:
		frappe.log_error(f"Erreur calculate_smart_status pour {docname}: {str(e)}")
		return {
			'success': False,
			'message': f'Erreur lors du calcul: {str(e)}'
		}


def calculate_delivery_metrics(articles):
	"""Calcule les métriques de livraison pour un ensemble d'articles
	
	Args:
		articles: Liste des articles du colis
	
	Returns:
		dict: Métriques de livraison
	"""
	if not articles:
		return {
			'total_articles': 0,
			'total_quantity': 0,
			'delivered_quantity': 0,
			'remaining_quantity': 0,
			'completion_percentage': 0,
			'delivered_articles': 0,
			'partial_articles': 0,
			'undelivered_articles': 0
		}
	
	try:
		total_articles = len(articles)
		total_quantity = sum(getattr(article, 'quantite_totale', 0) for article in articles)
		delivered_quantity = sum(getattr(article, 'quantite_livree', 0) for article in articles)
		remaining_quantity = sum(getattr(article, 'quantite_restante', 0) for article in articles)
		
		# Compter les articles par statut
		delivered_articles = sum(1 for a in articles if getattr(a, 'statut_article', '') == 'Livré')
		partial_articles = sum(1 for a in articles if getattr(a, 'statut_article', '') == 'Partiellement livré')
		undelivered_articles = sum(1 for a in articles if getattr(a, 'statut_article', '') in ['En attente', 'Non livré'])
		
		# Calculer le pourcentage de complétion
		completion_percentage = round((delivered_quantity / total_quantity * 100) if total_quantity > 0 else 0, 1)
		
		return {
			'total_articles': total_articles,
			'total_quantity': total_quantity,
			'delivered_quantity': delivered_quantity,
			'remaining_quantity': remaining_quantity,
			'completion_percentage': completion_percentage,
			'delivered_articles': delivered_articles,
			'partial_articles': partial_articles,
			'undelivered_articles': undelivered_articles,
			'article_completion_rate': round((delivered_articles / total_articles * 100) if total_articles > 0 else 0, 1)
		}
	except Exception as e:
		frappe.logger().error(f"Erreur lors du calcul des métriques de livraison: {e}")
		return {
			'total_articles': 0,
			'total_quantity': 0,
			'delivered_quantity': 0,
			'remaining_quantity': 0,
			'completion_percentage': 0,
			'delivered_articles': 0,
			'partial_articles': 0,
			'undelivered_articles': 0
		}

def determine_smart_status(metrics, config, current_status):
	"""Détermine le statut intelligent basé sur les métriques et la configuration
	
	Args:
		metrics (dict): Métriques de livraison
		config (dict): Configuration des seuils
		current_status (str): Statut actuel
	
	Returns:
		str: Nouveau statut suggéré
	"""
	completion = metrics['completion_percentage']
	thresholds = config['completion_thresholds']
	
	# Si aucune quantité n'est définie, garder le statut actuel ou "Nouveau"
	if metrics['total_quantity'] == 0:
		return current_status if current_status else 'Nouveau'
	
	# Logique de détermination du statut
	if completion >= thresholds['complete_threshold']:
		return 'Livré'
	elif completion >= thresholds['nearly_complete_threshold']:
		return 'Presque Livré'
	elif completion >= thresholds['partial_threshold']:
		return 'Partiellement Livré'
	elif completion > 0:
		# Quelque chose a été livré mais sous le seuil partiel
		return 'Partiellement Livré'
	else:
		# Rien n'a été livré
		if current_status in ['Enlevé', 'Préparé']:
			return current_status  # Garder le statut de workflow
		else:
			return 'Nouveau'

def is_valid_status_transition(current_status, new_status, config):
	"""Vérifie si une transition de statut est valide
	
	Args:
		current_status (str): Statut actuel
		new_status (str): Nouveau statut proposé
		config (dict): Configuration
	
	Returns:
		bool: True si la transition est valide
	"""
	if current_status == new_status:
		return False
	
	priorities = config['status_priorities']
	current_priority = priorities.get(current_status, 0)
	new_priority = priorities.get(new_status, 0)
	
	# Permettre les transitions vers un statut de priorité plus élevée
	# ou les transitions entre statuts de livraison
	if new_priority > current_priority:
		return True
	
	# Permettre certaines transitions spéciales
	special_transitions = {
		'Partiellement Livré': ['Presque Livré', 'Livré'],
		'Presque Livré': ['Livré', 'Partiellement Livré'],  # Peut revenir en arrière si des articles sont annulés
		'Enlevé': ['Partiellement Livré', 'Presque Livré', 'Livré', 'Non Livré']
	}
	
	return new_status in special_transitions.get(current_status, [])
	"""Exécute une action rapide de livraison
	
	Args:
		colis_id (str): ID du colis
		action_id (str): ID de l'action à exécuter
		reason (str): Raison pour les actions d'échec (optionnel)
	
	Returns:
		dict: Résultat de l'action
	"""
	try:
		colis_doc = frappe.get_doc("Colis", colis_id)
		
		if action_id == 'deliver_all':
			# Livrer tous les articles restants
			return deliver_all_articles(colis_id, confirm=True)
			
		elif action_id == 'client_absent':
			# Marquer tous les articles non livrés comme "client absent"
			results = []
			for article in colis_doc.articles:
				if article.statut_article in ['En attente', 'Partiellement livré'] and article.quantite_restante > 0:
					article_doc = frappe.get_doc("Articles Colis", article.name)
					result = article_doc.mark_as_undeliverable(reason or "Client absent")
					results.append(result)
			
			colis_doc.reload()
			colis_doc.calculate_global_status()
			colis_doc.save()
			frappe.db.commit()
			
			return {
				'success': True,
				'message': 'Colis marqué comme non livré - client absent',
				'new_status': colis_doc.status
			}
			
		elif action_id == 'access_refused':
			# Marquer comme "accès refusé"
			for article in colis_doc.articles:
				if article.statut_article in ['En attente', 'Partiellement livré'] and article.quantite_restante > 0:
					article_doc = frappe.get_doc("Articles Colis", article.name)
					article_doc.mark_as_undeliverable(reason or "Accès refusé au lieu de livraison")
			
			colis_doc.reload()
			colis_doc.calculate_global_status()
			colis_doc.save()
			frappe.db.commit()
			
			return {
				'success': True,
				'message': 'Colis marqué comme non livré - accès refusé',
				'new_status': colis_doc.status
			}
			
		else:
			return {
				'success': False,
				'message': f'Action non reconnue: {action_id}'
			}
			
	except Exception as e:
		frappe.log_error(f"Erreur execute_quick_action: {str(e)}")
		return {
			'success': False,
			'message': f'Erreur lors de l\'exécution: {str(e)}'
		}
		
		# Récupérer les données du colis avec seulement les champs nécessaires
		colis_data = frappe.get_doc('Colis', colis_id)
		
		# Préparer les données publiques (limitées)
		public_data = {
			'id': colis_data.name,
			'custom_numero_sequence': colis_data.custom_numero_sequence,
			'status': colis_data.status,
			'client': colis_data.client,
			'date_creation': colis_data.date_creation,
			'bl': colis_data.bl,
			'articles': []
		}
		
		# Ajouter les articles avec seulement les informations nécessaires
		if colis_data.articles:
			for article in colis_data.articles:
				public_data['articles'].append({
					'id': article.name,
					'article': article.article,
					'statut_article': article.statut_article,
					'quantite_totale': article.quantite_totale,
					'quantite_livree': article.quantite_livree,
					'quantite_restante': article.quantite_restante,
					'date_derniere_livraison': article.date_derniere_livraison
				})
		
		return public_data
		
	except frappe.DoesNotExistError:
		frappe.local.response.http_status_code = 404
		return {
			'error': 'Colis non trouvé',
			'message': 'Le colis demandé n\'existe pas ou n\'est pas accessible.'
		}
	except Exception as e:
		frappe.log_error(f"Erreur get_public_colis_data: {str(e)}")
		frappe.local.response.http_status_code = 500
		return {
				'error': 'Erreur serveur',
				'message': 'Une erreur est survenue lors de la récupération des données.'
			}


# ===== FONCTIONS POUR LA GÉNÉRATION DIRECTE DE COLIS =====

@frappe.whitelist()
def create_colis_from_delivery_note(delivery_note_name, articles_data=None):
	"""Crée un colis directement depuis un bon de livraison avec sélection manuelle des articles
	
	Args:
		delivery_note_name (str): Nom du bon de livraison
		articles_data (list): Liste des articles avec quantités sélectionnées
			[{"item_code": "ITEM001", "quantity": 5}, ...]
	
	Returns:
		dict: Résultat de la création avec le nom du colis créé
	"""
	try:
		# Vérifier les permissions
		if not frappe.has_permission("Colis", "create"):
			frappe.throw("Permission refusée pour créer un colis")
		
		# Vérifier que le bon de livraison existe
		if not frappe.db.exists("Delivery Note", delivery_note_name):
			frappe.throw(f"Le bon de livraison {delivery_note_name} n'existe pas")
		
		# Récupérer le bon de livraison
		delivery_note = frappe.get_doc("Delivery Note", delivery_note_name)
		
		# Créer le nouveau colis
		colis = frappe.new_doc("Colis")
		colis.client = delivery_note.customer
		colis.bl = delivery_note_name
		colis.date = frappe.utils.today()
		colis.status = "Nouveau"
		
		# Si des articles spécifiques sont fournis, les utiliser
		if articles_data:
			# Convertir en dict pour faciliter la recherche
			articles_dict = {item["item_code"]: item["quantity"] for item in articles_data}
			
			# Ajouter les articles sélectionnés
			for item in delivery_note.items:
				if item.item_code in articles_dict:
					quantity = articles_dict[item.item_code]
					if quantity > 0:
						colis.append("articles", {
							"article": item.item_code,
							"quantite_totale": quantity,
							"quantite_livree": 0,
							"quantite_restante": quantity,
							"statut_article": "Nouveau"
						})
		else:
			# Ajouter tous les articles du bon de livraison
			for item in delivery_note.items:
				colis.append("articles", {
					"article": item.item_code,
					"quantite_totale": item.qty,
					"quantite_livree": 0,
					"quantite_restante": item.qty,
					"statut_article": "Nouveau"
				})
		
		# Sauvegarder le colis
		colis.insert()
		
		# Mettre à jour le nombre de colis dans le bon de livraison
		from log.delivery_note_hooks import force_update_colis_count
		force_update_colis_count(delivery_note_name)
		
		return {
			"success": True,
			"colis_name": colis.name,
			"message": f"Colis {colis.name} créé avec succès"
		}
		
	except Exception as e:
		frappe.log_error(f"Erreur création colis depuis bon de livraison: {str(e)}")
		return {
			"success": False,
			"message": f"Erreur lors de la création: {str(e)}"
		}

@frappe.whitelist()
def get_delivery_note_items_for_colis(delivery_note_name):
	"""Récupère les articles d'un bon de livraison disponibles pour création de colis
	
	Args:
		delivery_note_name (str): Nom du bon de livraison
	
	Returns:
		dict: Liste des articles avec quantités disponibles
	"""
	try:
		# Vérifier que le bon de livraison existe
		if not frappe.db.exists("Delivery Note", delivery_note_name):
			frappe.throw(f"Le bon de livraison {delivery_note_name} n'existe pas")
		
		# Récupérer le bon de livraison
		delivery_note = frappe.get_doc("Delivery Note", delivery_note_name)
		
		# Calculer les quantités déjà dans les colis
		colis_quantities = {}
		existing_colis = frappe.get_all("Colis", 
			filters={"bl": delivery_note_name, "docstatus": ["<", 2]},
			fields=["name"]
		)
		
		for colis in existing_colis:
			colis_doc = frappe.get_doc("Colis", colis.name)
			for article in colis_doc.articles:
				if article.article in colis_quantities:
					colis_quantities[article.article] += article.quantite_totale
				else:
					colis_quantities[article.article] = article.quantite_totale
		
		# Préparer la liste des articles disponibles
		available_items = []
		for item in delivery_note.items:
			used_quantity = colis_quantities.get(item.item_code, 0)
			available_quantity = item.qty - used_quantity
			
			available_items.append({
				"item_code": item.item_code,
				"item_name": item.item_name,
				"total_quantity": item.qty,
				"used_quantity": used_quantity,
				"available_quantity": available_quantity,
				"uom": item.uom,
				"rate": item.rate
			})
		
		return {
			"success": True,
			"delivery_note": {
				"name": delivery_note.name,
				"customer": delivery_note.customer,
				"posting_date": delivery_note.posting_date
			},
			"items": available_items
		}
		
	except Exception as e:
		frappe.log_error(f"Erreur récupération articles bon de livraison: {str(e)}")
		return {
			"success": False,
			"message": f"Erreur lors de la récupération: {str(e)}"
		}

@frappe.whitelist()
def get_unpacked_delivery_notes(date_from=None, date_to=None, customer=None):
	"""Récupère les bons de livraison qui ont des articles non encore emballés en colis
	
	Args:
		date_from (str): Date de début (optionnel)
		date_to (str): Date de fin (optionnel)
		customer (str): Client spécifique (optionnel)
	
	Returns:
		dict: Liste des bons de livraison avec articles non emballés
	"""
	try:
		# Construire les filtres
		filters = {"docstatus": 1}  # Seulement les bons de livraison soumis
		
		if date_from:
			filters["posting_date"] = [">=", date_from]
		if date_to:
			if "posting_date" in filters:
				filters["posting_date"] = ["between", [date_from, date_to]]
			else:
				filters["posting_date"] = ["<=", date_to]
		if customer:
			filters["customer"] = customer
		
		# Récupérer tous les bons de livraison
		delivery_notes = frappe.get_all("Delivery Note", 
			filters=filters,
			fields=["name", "customer", "posting_date", "grand_total", "custom_nombre_colis"]
		)
		
		unpacked_notes = []
		
		for dn in delivery_notes:
			# Utiliser la fonction existante pour vérifier les articles non emballés
			from log.delivery_note_hooks import get_unpacked_items
			unpacked_items = get_unpacked_items(dn.name)
			
			if unpacked_items:
				unpacked_notes.append({
					"name": dn.name,
					"customer": dn.customer,
					"posting_date": dn.posting_date,
					"grand_total": dn.grand_total,
					"total_colis": dn.custom_nombre_colis or 0,
					"unpacked_items_count": len(unpacked_items),
					"unpacked_items": unpacked_items
				})
		
		return {
			"success": True,
			"unpacked_delivery_notes": unpacked_notes,
			"total_count": len(unpacked_notes)
		}
		
	except Exception as e:
		frappe.log_error(f"Erreur récupération bons de livraison non emballés: {str(e)}")
		return {
			"success": False,
			"message": f"Erreur lors de la récupération: {str(e)}"
		}



