// Copyright (c) 2025, IntraPro and contributors
// For license information, please see license.txt

frappe.ui.form.on("Parametres Livraison", {
	refresh(frm) {
		// Ajouter les boutons de géolocalisation
		frm.add_custom_button(__("Géocoder Toutes les Communes"), function() {
			geocoder_toutes_communes(frm);
		}, __("Géolocalisation"));
		
		frm.add_custom_button(__("Géocoder par Wilaya"), function() {
			geocoder_par_wilaya(frm);
		}, __("Géolocalisation"));
		
		frm.add_custom_button(__("Calculer Distances Dépôt"), function() {
			calculer_distances_depot(frm);
		}, __("Géolocalisation"));
		
		frm.add_custom_button(__("Calculer Distances par Wilaya"), function() {
			calculer_distances_par_wilaya(frm);
		}, __("Géolocalisation"));
		
		frm.add_custom_button(__("Calculer Distances Route"), function() {
			calculer_distances_route(frm);
		}, __("Géolocalisation"));
		
		frm.add_custom_button(__("Géocoder Commune Spécifique"), function() {
			geocoder_commune_specifique(frm);
		}, __("Géolocalisation"));
		
		// Bouton pour tester la clé API Google
		if (frm.doc.cle_api_google) {
			frm.add_custom_button(__("Tester Clé API Google"), function() {
				tester_cle_api_google(frm);
			}, __("Configuration API"));
			
			frm.add_custom_button(__("Diagnostic Clé API"), function() {
				diagnostiquer_cle_api_google(frm);
			}, __("Configuration API"));
		}
	}
});

// Fonction pour géocoder toutes les communes
function geocoder_toutes_communes(frm) {
	frappe.confirm(
		__("Attention: Cette opération va géocoder TOUTES les communes sans coordonnées (potentiellement 1500+ communes). Cela peut prendre beaucoup de temps et risquer de bloquer l'API externe. Voulez-vous continuer ?"),
		function() {
			// Confirmation
			frappe.call({
				method: "log.utils.geolocation.geocoder_communes",
				btn: frm.page.btn_primary,
				callback: function(r) {
					if (r.exc) {
						frappe.msgprint({
							title: __("Erreur"),
							message: __("Erreur lors du géocodage : ") + r.exc,
							indicator: "red"
						});
					} else {
						frappe.msgprint({
							title: __("Succès"),
							message: r.message || __("Géocodage terminé avec succès"),
							indicator: "green"
						});
					}
				}
			});
		},
		function() {
			// Annulation
			frappe.msgprint(__("Opération annulée"));
		}
	);
}

// Fonction pour géocoder par wilaya
function geocoder_par_wilaya(frm) {
	// Créer un dialogue pour sélectionner la wilaya
	let d = new frappe.ui.Dialog({
		title: __("Géocoder les Communes d'une Wilaya"),
		fields: [
			{
				fieldtype: "Link",
				label: __("Wilaya"),
				fieldname: "wilaya",
				options: "Wilaya",
				reqd: 1,
				get_query: function() {
					// Retourner un filtre vide pour permettre la sélection de toutes les wilayas
					// Le filtrage se fera côté serveur dans la fonction Python
					return {
						filters: []
					};
				},
				onchange: function() {
					// Afficher le nombre de communes à traiter
					if (this.value) {
						// Utiliser frappe.call pour récupérer le nombre de communes
						frappe.call({
							method: "frappe.client.get_count",
							args: {
								doctype: "Commune",
								filters: [
									["wilaya", "=", this.value],
									["latitude", "is", "not set"]
								]
							},
							callback: function(r) {
								if (r.message > 0) {
									frappe.show_alert({
										message: __("Cette wilaya contient {0} communes à géocoder", [r.message]),
										indicator: "blue"
									});
								} else {
									frappe.show_alert({
										message: __("Cette wilaya n'a pas de communes à géocoder"),
										indicator: "yellow"
									});
								}
							}
						});
					}
				}
			},
			{
				fieldtype: "HTML",
				fieldname: "info",
				options: __("<div style='color: #666; font-size: 12px; margin-top: 10px;'>Cette opération ne géocodera que les communes de la wilaya sélectionnée qui n'ont pas encore de coordonnées GPS.</div>")
			}
		],
		primary_action_label: __("Géocoder"),
		primary_action: function(values) {
			if (values.wilaya) {
				geocoder_par_wilaya_execute(values.wilaya, d);
			}
		}
	});
	
	d.show();
}

// Exécuter le géocodage par wilaya
function geocoder_par_wilaya_execute(wilaya_name, dialog) {
	frappe.call({
		method: "log.utils.geolocation.geocoder_communes_par_wilaya",
		args: {
			wilaya_name: wilaya_name
		},
		callback: function(r) {
			dialog.hide();
			
			if (r.exc) {
				frappe.msgprint({
					title: __("Erreur"),
					message: __("Erreur lors du géocodage : ") + r.exc,
					indicator: "red"
				});
			} else if (r.message && r.message.success) {
				frappe.msgprint({
					title: __("Succès"),
					message: r.message.message || __("Géocodage par wilaya terminé avec succès"),
					indicator: "green"
				});
			} else {
				frappe.msgprint({
					title: __("Échec"),
					message: r.message.message || __("Échec du géocodage par wilaya"),
					indicator: "red"
				});
			}
		}
	});
}

// Fonction pour calculer les distances du dépôt
function calculer_distances_depot(frm) {
	frappe.confirm(
		__("Cette opération va calculer les distances pour TOUTES les communes géocodées. Voulez-vous continuer ?"),
		function() {
			// Confirmation
			frappe.call({
				method: "log.utils.geolocation.calculer_distances_depot",
				btn: frm.page.btn_primary,
				callback: function(r) {
					if (r.exc) {
						frappe.msgprint({
							title: __("Erreur"),
							message: __("Erreur lors du calcul des distances : ") + r.exc,
							indicator: "red"
						});
					} else {
						frappe.msgprint({
							title: __("Succès"),
							message: r.message || __("Distances calculées avec succès"),
							indicator: "green"
						});
					}
				}
			});
		},
		function() {
			// Annulation
			frappe.msgprint(__("Opération annulée"));
		}
	);
}

// Fonction pour calculer les distances par wilaya
function calculer_distances_par_wilaya(frm) {
	// Créer un dialogue pour sélectionner la wilaya
	let d = new frappe.ui.Dialog({
		title: __("Calculer les Distances d'une Wilaya"),
		fields: [
			{
				fieldtype: "Link",
				label: __("Wilaya"),
				fieldname: "wilaya",
				options: "Wilaya",
				reqd: 1,
				get_query: function() {
					// Retourner un filtre vide pour permettre la sélection de toutes les wilayas
					// Le filtrage se fera côté serveur dans la fonction Python
					return {
						filters: []
					};
				},
				onchange: function() {
					// Afficher le nombre de communes à traiter
					if (this.value) {
						// Utiliser frappe.call pour récupérer le nombre de communes
						frappe.call({
							method: "frappe.client.get_count",
							args: {
								doctype: "Commune",
								filters: [
									["wilaya", "=", this.value],
									["latitude", "is", "set"]
								]
							},
							callback: function(r) {
								if (r.message > 0) {
									frappe.show_alert({
										message: __("Cette wilaya contient {0} communes pour calculer les distances", [r.message]),
										indicator: "blue"
									});
								} else {
									frappe.show_alert({
										message: __("Cette wilaya n'a pas de communes géocodées pour calculer les distances"),
										indicator: "yellow"
									});
								}
							}
						});
					}
				}
			},
			{
				fieldtype: "HTML",
				fieldname: "info",
				options: __("<div style='color: #666; font-size: 12px; margin-top: 10px;'>Cette opération ne calculera que les distances pour les communes de la wilaya sélectionnée qui ont déjà des coordonnées GPS.</div>")
			}
		],
		primary_action_label: __("Calculer"),
		primary_action: function(values) {
			if (values.wilaya) {
				calculer_distances_par_wilaya_execute(values.wilaya, d);
			}
		}
	});
	
	d.show();
}

// Exécuter le calcul des distances par wilaya
function calculer_distances_par_wilaya_execute(wilaya_name, dialog) {
	frappe.call({
		method: "log.utils.geolocation.calculer_distances_depot_par_wilaya",
		args: {
			wilaya_name: wilaya_name
		},
		callback: function(r) {
			dialog.hide();
			
			if (r.exc) {
				frappe.msgprint({
					title: __("Erreur"),
					message: __("Erreur lors du calcul des distances : ") + r.exc,
					indicator: "red"
				});
			} else if (r.message && r.message.success) {
				frappe.msgprint({
					title: __("Succès"),
					message: r.message.message || __("Distances calculées avec succès"),
					indicator: "green"
				});
			} else {
				frappe.msgprint({
					title: __("Échec"),
					message: r.message.message || __("Échec du calcul des distances"),
					indicator: "red"
				});
			}
		}
	});
}

// Fonction pour calculer les distances par route
function calculer_distances_route(frm) {
	// Créer un dialogue pour configurer le calcul des distances par route
	let d = new frappe.ui.Dialog({
		title: __("Calculer les Distances par Route"),
		fields: [
			{
				fieldtype: "Link",
				label: __("Wilaya (optionnel)"),
				fieldname: "wilaya",
				options: "Wilaya",
				reqd: 0,
				description: __("Laissez vide pour calculer pour toutes les communes")
			},
			{
				fieldtype: "Select",
				label: __("Mode de Transport"),
				fieldname: "mode_transport",
				options: "driving\nwalking\nbicycling\ntransit",
				default: "driving",
				description: __("Mode de transport pour le calcul de la route")
			},
			{
				fieldtype: "Check",
				label: __("Forcer l'utilisation de l'API"),
				fieldname: "force_api",
				description: __("Cocher pour forcer l'utilisation de l'API Google Maps (peut être plus lent)")
			},
			{
				fieldtype: "HTML",
				fieldname: "info",
				options: __("<div style='color: #666; font-size: 12px; margin-top: 10px;'>Cette opération calcule les distances par route (pas en ligne droite) en utilisant l'API Google Maps ou un calcul approximatif en fallback.</div>")
			}
		],
		primary_action_label: __("Calculer"),
		primary_action: function(values) {
			calculer_distances_route_execute(values, d);
		}
	});
	
	d.show();
}

// Exécuter le calcul des distances par route
function calculer_distances_route_execute(values, dialog) {
	let args = {
		mode_transport: values.mode_transport || "driving",
		force_api: values.force_api || false
	};
	
	if (values.wilaya) {
		args.wilaya_name = values.wilaya;
	}
	
	frappe.call({
		method: "log.utils.geolocation.calculer_distances_depot_par_route",
		args: args,
		callback: function(r) {
			dialog.hide();
			
			if (r.exc) {
				frappe.msgprint({
					title: __("Erreur"),
					message: __("Erreur lors du calcul des distances par route : ") + r.exc,
					indicator: "red"
				});
			} else if (r.message && r.message.success) {
				// Afficher les statistiques détaillées
				let message = r.message.message || __("Distances par route calculées avec succès");
				
				if (r.message.stats) {
					message += "<br><br><strong>Statistiques :</strong><br>";
					message += `Total traité: ${r.message.stats.total}<br>`;
					message += `Succès: ${r.message.stats.success}<br>`;
					if (r.message.stats.api > 0) {
						message += `API Google Maps: ${r.message.stats.api}<br>`;
					}
					if (r.message.stats.fallback > 0) {
						message += `Calcul approximatif: ${r.message.stats.fallback}<br>`;
					}
					if (r.message.stats.errors > 0) {
						message += `Erreurs: ${r.message.stats.errors}`;
					}
				}
				
				frappe.msgprint({
					title: __("Succès"),
					message: message,
					indicator: "green"
				});
			} else {
				frappe.msgprint({
					title: __("Échec"),
					message: r.message.message || __("Échec du calcul des distances par route"),
					indicator: "red"
				});
			}
		}
	});
}

// Fonction pour tester la clé API Google
function tester_cle_api_google(frm) {
	frappe.call({
		method: "log.utils.geolocation.tester_cle_api_google",
		callback: function(r) {
			if (r.exc) {
				frappe.msgprint({
					title: __("Erreur"),
					message: __("Erreur lors du test de la clé API : ") + r.exc,
					indicator: "red"
				});
			} else if (r.message && r.message.success) {
				frappe.msgprint({
					title: __("Succès"),
					message: __("Clé API Google Maps valide et fonctionnelle") + 
						"<br><br><strong>Détails :</strong><br>" +
						`API: ${r.message.api_name}<br>` +
						`Limite quotidienne: ${r.message.daily_limit}<br>` +
						`Statut: ${r.message.status}`,
					indicator: "green"
				});
			} else {
				frappe.msgprint({
					title: __("Échec"),
					message: r.message.message || __("La clé API Google Maps n'est pas valide"),
					indicator: "red"
				});
			}
		}
	});
}

// Fonction pour diagnostiquer la clé API Google
function diagnostiquer_cle_api_google(frm) {
	frappe.call({
		method: "log.utils.geolocation.diagnostiquer_cle_api_google",
		callback: function(r) {
			if (r.exc) {
				frappe.msgprint({
					title: __("Erreur"),
					message: __("Erreur lors du diagnostic : ") + r.exc,
					indicator: "red"
				});
			} else if (r.message && r.message.success) {
				let message = __("Diagnostic de la clé API :") + "<br><br>";
				message += `<strong>Statut API :</strong> ${r.message.status_api}<br>`;
				message += `<strong>Message d'erreur :</strong> ${r.message.error_message}<br>`;
				message += `<strong>URL de test :</strong> ${r.message.url_test}<br><br>`;
				message += `<strong>Réponse complète :</strong><br>`;
				message += `<pre style='font-size: 11px; max-height: 200px; overflow-y: auto;'>${JSON.stringify(r.message.response_complete, null, 2)}</pre>`;
				
				frappe.msgprint({
					title: __("Diagnostic Clé API"),
					message: message,
					indicator: "blue"
				});
			} else {
				frappe.msgprint({
					title: __("Échec"),
					message: r.message.message || __("Échec du diagnostic"),
					indicator: "red"
				});
			}
		}
	});
}

// Fonction pour géocoder une commune spécifique
function geocoder_commune_specifique(frm) {
	// Créer un dialogue pour saisir le nom de la commune
	let d = new frappe.ui.Dialog({
		title: __("Géocoder une Commune Spécifique"),
		fields: [
			{
				fieldtype: "Link",
				label: __("Commune"),
				fieldname: "commune",
				options: "Commune",
				reqd: 1,
				get_query: function() {
					return {
						filters: [
							["latitude", "is", "not set"]
						]
					};
				}
			}
		],
		primary_action_label: __("Géocoder"),
		primary_action: function(values) {
			if (values.commune) {
				geocoder_commune_specifique_execute(values.commune, d);
			}
		}
	});
	
	d.show();
}

// Exécuter le géocodage d'une commune spécifique
function geocoder_commune_specifique_execute(commune_name, dialog) {
	frappe.call({
		method: "log.utils.geolocation.geocoder_commune_specifique",
		args: {
			commune_name: commune_name
		},
		callback: function(r) {
			dialog.hide();
			
			if (r.exc) {
				frappe.msgprint({
					title: __("Erreur"),
					message: __("Erreur lors du géocodage : ") + r.exc,
					indicator: "red"
				});
			} else if (r.message && r.message.success) {
				frappe.msgprint({
					title: __("Succès"),
					message: __("Commune géocodée avec succès") + 
						"<br>Latitude: " + r.message.latitude + 
						"<br>Longitude: " + r.message.longitude,
					indicator: "green"
				});
			} else {
				frappe.msgprint({
					title: __("Échec"),
					message: r.message.message || __("Échec du géocodage"),
					indicator: "red"
				});
			}
		}
	});
}
