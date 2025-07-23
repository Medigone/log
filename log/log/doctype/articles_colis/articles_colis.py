# -*- coding: utf-8 -*-
# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime

class ArticlesColis(Document):
	def validate(self):
		"""Validation et calculs automatiques"""
		self.calculate_quantite_restante()
		self.update_statut_article()
	
	def calculate_quantite_restante(self):
		"""Calculer la quantité restante"""
		if self.quantite_totale and self.quantite_livree:
			self.quantite_restante = max(0, self.quantite_totale - self.quantite_livree)
		elif self.quantite_totale:
			self.quantite_restante = self.quantite_totale
		else:
			self.quantite_restante = 0
	
	def update_statut_article(self):
		"""Mettre à jour le statut de l'article selon les quantités"""
		if not self.quantite_totale:
			self.statut_article = "En attente"
			return
		
		if self.quantite_livree == 0:
			self.statut_article = "En attente"
		elif self.quantite_livree >= self.quantite_totale:
			self.statut_article = "Livré"
		else:
			self.statut_article = "Partiellement livré"
	
	def deliver_quantity(self, quantity_to_deliver, update_date=True):
		"""Livrer une quantité spécifique"""
		if quantity_to_deliver <= 0:
			frappe.throw("La quantité à livrer doit être positive")
		
		if self.quantite_livree + quantity_to_deliver > self.quantite_totale:
			frappe.throw(f"Impossible de livrer {quantity_to_deliver}. Quantité restante: {self.quantite_restante}")
		
		self.quantite_livree += quantity_to_deliver
		
		if update_date:
			self.date_derniere_livraison = now_datetime()
		
		self.calculate_quantite_restante()
		self.update_statut_article()
		self.save()
		
		return {
			'success': True,
			'message': f"Livraison de {quantity_to_deliver} unités effectuée",
			'quantite_livree': self.quantite_livree,
			'quantite_restante': self.quantite_restante,
			'statut_article': self.statut_article
		}
	
	def deliver_remaining(self):
		"""Livrer toute la quantité restante"""
		if self.quantite_restante <= 0:
			frappe.throw("Aucune quantité restante à livrer")
		
		return self.deliver_quantity(self.quantite_restante)
	
	def mark_as_undeliverable(self, reason=""):
		"""Marquer l'article comme non livrable"""
		self.statut_article = "Non livré"
		self.save()
		
		return {
			'success': True,
			'message': f"Article marqué comme non livrable. Raison: {reason}",
			'quantite_totale': self.quantite_totale,
			'quantite_livree': self.quantite_livree,
			'quantite_restante': self.quantite_restante,
			'statut_article': self.statut_article
		}
