frappe.pages['generation-livraisons'].on_page_load = function(wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: 'Génération Livraisons',
    single_column: true
  });

  const html = `
<div class="generation-livraisons-page">
  <div class="page-head">
    <div class="container">
      <h1>Génération Automatique des Livraisons</h1>
      <p class="text-muted">Répartition intelligente des colis par livreur avec mode simulation</p>
    </div>
  </div>
  <div class="page-content">
    <div class="container">
      <!-- Filtres -->
      <div class="row">
        <div class="col-md-12">
          <div class="card">
            <div class="card-header"><h5>Paramètres de Répartition</h5></div>
            <div class="card-body">
              <div class="row">
                <div class="col-md-3">
                  <div class="form-group">
                    <label for="date_livraison">Date de Livraison</label>
                    <input type="date" class="form-control" id="date_livraison" required>
                  </div>
                </div>

                <div class="col-md-3">
                  <div class="form-group">
                    <div class="form-check mt-4">
                      <input type="checkbox" class="form-check-input" id="dry_run" checked>
                      <label class="form-check-label" for="dry_run">Mode Simulation (Dry-Run)</label>
                    </div>
                  </div>
                </div>
                <div class="col-md-3">
                  <div class="form-group">
                    <button type="button" class="btn btn-primary btn-block mt-4" id="btn_generer">
                      <i class="fa fa-cogs"></i> Générer Répartition
                    </button>
                  </div>
                </div>
                <div class="col-md-3">
                  <div class="form-group">
                    <button type="button" class="btn btn-info btn-block mt-4" id="btn_synchroniser">
                      <i class="fa fa-sync"></i> Synchroniser
                    </button>
                  </div>
                </div>
                <div class="col-md-3">
                  <div class="form-group">
                    <button type="button" class="btn btn-warning btn-block mt-4" id="btn_forcer_sync">
                      <i class="fa fa-exclamation-triangle"></i> Forcer Sync
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Résultats -->
      <div class="row mt-4" id="resultats_section" style="display: none;">
        <div class="col-md-12">
          <div class="card">
            <div class="card-header"><h5 id="resultats_title">Résultats de la Répartition</h5></div>
            <div class="card-body">
              <div id="summary_container"></div>
              <div id="repartition_container"></div>
              <div class="mt-3" id="actions_container" style="display: none;">
                <button type="button" class="btn btn-success" id="btn_confirmer">
                  <i class="fa fa-check"></i> Confirmer et Créer les Livraisons
                </button>
                <button type="button" class="btn btn-secondary ml-2" id="btn_reset">
                  <i class="fa fa-refresh"></i> Nouvelle Répartition
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</div>`;

  // injecte le HTML dans le body de la page Desk
  $(page.body).html(html);

  // === Ton code d'origine (adapté) ===

  let current_data = null;
  let is_simulation = true;

  $('#date_livraison').val(frappe.datetime.get_today());

  $('#btn_generer').on('click', generer_repartition);
  $('#btn_confirmer').on('click', confirmer_repartition);
  $('#btn_reset').on('click', reset_interface);
  $('#btn_synchroniser').on('click', synchroniser_livraisons);
  $('#btn_forcer_sync').on('click', forcer_synchronisation);
  $('#dry_run').on('change', function() {
    is_simulation = $(this).is(':checked');
    update_button_text();
  });

  update_button_text();

  function update_button_text() {
    const btn = $('#btn_generer');
    if (is_simulation) {
      btn.html('Simuler Répartition')
         .removeClass('btn-warning').addClass('btn-primary');
    } else {
      btn.html('<i class="fa fa-cogs"></i> Générer Répartition')
         .removeClass('btn-primary').addClass('btn-warning');
    }
  }

  function generer_repartition() {
    const date_livraison = $('#date_livraison').val();
    const simulate = $('#dry_run').is(':checked');

    if (!date_livraison) return frappe.msgprint('Veuillez sélectionner une date de livraison');

    const btn = $('#btn_generer');
    btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Traitement...');

    frappe.call({
      method: 'log.utils.distribution.repartir_livraisons_automatique',
      args: { date_livraison, mode: 'auto', simulate },
      callback: function(r) {
        btn.prop('disabled', false); update_button_text();
        
        if (r.message && r.message.success) {
          current_data = r.message; 
          is_simulation = r.message.simulate;
          afficher_resultats(r.message);
        } else if (r.message && r.message.requires_synchronization) {
          // Cas de livraisons existantes
          afficher_dialog_synchronisation(r.message);
        } else {
          frappe.msgprint('Erreur lors de la génération de la répartition');
        }
      },
      error: function() {
        btn.prop('disabled', false); update_button_text();
        frappe.msgprint('Erreur lors de la génération de la répartition');
      }
    });
  }

  function afficher_resultats(data) {
    const section = $('#resultats_section');
    const title = $('#resultats_title');
    const summary_container = $('#summary_container');
    const repartition_container = $('#repartition_container');
    const actions_container = $('#actions_container');

    title.html(data.simulate
      ? '<i class="fa fa-eye text-info"></i> Simulation de Répartition'
      : '<i class="fa fa-check text-success"></i> Répartition Créée');

    afficher_summary(data, summary_container);
    afficher_repartition(data.repartition, repartition_container);

    if (data.simulate && Object.keys(data.repartition).length > 0) {
      actions_container.html(`
        <div class="mt-3">
          <button type="button" class="btn btn-success" id="btn_confirmer">
            <i class="fa fa-check"></i> Confirmer et Créer les Livraisons
          </button>
          <button type="button" class="btn btn-warning ml-2" id="btn_modifier_assignations">
            <i class="fa fa-edit"></i> Modifier les Assignations
          </button>
          <button type="button" class="btn btn-secondary ml-2" id="btn_reset">
            <i class="fa fa-refresh"></i> Réinitialiser
          </button>
        </div>
      `);
      actions_container.show();
      
      // IMPORTANT: Réattacher les gestionnaires d'événements après création du HTML
      $('#btn_confirmer').off('click').on('click', confirmer_repartition);
      $('#btn_modifier_assignations').off('click').on('click', function() {
        modifier_assignations_manuellement();
      });
      $('#btn_reset').off('click').on('click', reset_interface);
      
    } else {
      actions_container.hide();
    }

    section.show();
  }

  function afficher_interface_manuelle(data) {
    const section = $('#resultats_section');
    const title = $('#resultats_title');
    const summary_container = $('#summary_container');
    const repartition_container = $('#repartition_container');
    const actions_container = $('#actions_container');

    title.html('<i class="fa fa-hand-paper-o text-warning"></i> Sélection Manuelle des Livreurs');

    // Afficher le résumé
    $(summary_container).html(`
      <div class="row mb-3">
        <div class="col-md-3"><div class="card" style="background-color: white; border: 1px solid #dee2e6; color: #333; box-shadow: 0 1px 3px rgba(0,0,0,0.1);"><div class="card-body text-center" style="padding: 12px;"><h6 style="margin-bottom: 5px; font-weight: 600;">${data.total_bons_date || 0}</h6><small style="color: #6c757d;">Total bons</small></div></div></div>
        <div class="col-md-3"><div class="card" style="background-color: white; border: 1px solid #dc3545; color: #333; box-shadow: 0 1px 3px rgba(0,0,0,0.1);"><div class="card-body text-center" style="padding: 12px;"><h6 style="margin-bottom: 5px; font-weight: 600; color: #dc3545;">${data.bons_non_repartis || 0}</h6><small style="color: #dc3545;">À répartir</small></div></div></div>
        <div class="col-md-3"><div class="card" style="background-color: white; border: 1px solid #dee2e6; color: #333; box-shadow: 0 1px 3px rgba(0,0,0,0.1);"><div class="card-body text-center" style="padding: 12px;"><h6 style="margin-bottom: 5px; font-weight: 600;">${data.communes_data.length}</h6><small style="color: #6c757d;">Communes</small></div></div></div>
        <div class="col-md-3"><div class="card" style="background-color: white; border: 1px solid #dee2e6; color: #333; box-shadow: 0 1px 3px rgba(0,0,0,0.1);"><div class="card-body text-center" style="padding: 12px;"><h6 style="margin-bottom: 5px; font-weight: 600;">${data.livreurs_actifs.length}</h6><small style="color: #6c757d;">Livreurs disponibles</small></div></div></div>
      </div>
    `);

    // Créer l'interface de sélection manuelle
    let html = `
      <div class="card">
        <div class="card-header">
          <h5><i class="fa fa-users"></i> Attribution Manuelle par Commune</h5>
          <p class="text-muted mb-0">Sélectionnez un livreur pour chaque commune</p>
        </div>
        <div class="card-body">
          <div class="table-responsive">
            <table class="table table-bordered">
              <thead class="thead-light">
                <tr>
                  <th>Commune</th>
                  <th>Classification</th>
                  <th>Bons</th>
                  <th>Colis</th>
                  <th>Livreur Assigné</th>
                </tr>
              </thead>
              <tbody id="communes_assignment_table">`;

    data.communes_data.forEach(commune => {
      html += `
        <tr data-commune="${commune.commune_id}">
          <td><strong>${commune.nom_commune}</strong></td>
          <td><span class="badge badge-${commune.classification === 'Proche' ? 'success' : commune.classification === 'Moyenne' ? 'warning' : 'danger'}">${commune.classification}</span></td>
          <td>${commune.nb_bons}</td>
          <td>${commune.nb_colis}</td>
          <td>
            <select class="form-control livreur-select" data-commune="${commune.commune_id}">
              <option value="">-- Sélectionner un livreur --</option>`;
      
      data.livreurs_actifs.forEach(livreur => {
        const capacite_restante = (livreur.capacite_max_colis || 0) - (livreur.charge_actuelle || 0);
        const peut_prendre = capacite_restante >= commune.nb_colis;
        html += `<option value="${livreur.name}" ${!peut_prendre ? 'disabled' : ''}>${livreur.nom} (${capacite_restante} colis restants)${!peut_prendre ? ' - Capacité insuffisante' : ''}</option>`;
      });
      
      html += `
            </select>
          </td>
        </tr>`;
    });

    html += `
              </tbody>
            </table>
          </div>
          <div class="mt-3">
             <button type="button" class="btn btn-success" id="btn_valider_assignations">
               <i class="fa fa-check"></i> Valider les Assignations
             </button>
             <button type="button" class="btn btn-info ml-2" id="btn_retour_auto">
               <i class="fa fa-arrow-left"></i> Retour à la Répartition Automatique
             </button>
             <button type="button" class="btn btn-secondary ml-2" id="btn_annuler_manuel">
               <i class="fa fa-times"></i> Annuler
             </button>
           </div>
        </div>
      </div>`;

    $(repartition_container).html(html);
    $(actions_container).hide();
    section.show();

    // Gestionnaires d'événements
     $('#btn_valider_assignations').on('click', function() {
       valider_assignations_manuelles(data);
     });

     $('#btn_retour_auto').on('click', function() {
       if (current_data && current_data.mode !== 'manuel') {
         afficher_resultats(current_data);
       } else {
         generer_repartition(); // Regénérer en mode auto
       }
     });

     $('#btn_annuler_manuel').on('click', function() {
       section.hide();
     });
  }

  function valider_assignations_manuelles(data) {
    const assignations = {};
    let toutes_assignees = true;

    $('.livreur-select').each(function() {
      const commune_id = $(this).data('commune');
      const livreur_id = $(this).val();
      
      if (livreur_id) {
        assignations[commune_id] = livreur_id;
      } else {
        toutes_assignees = false;
      }
    });

    if (!toutes_assignees) {
      frappe.msgprint('Veuillez assigner un livreur à toutes les communes.');
      return;
    }

    const btn = $('#btn_valider_assignations');
    btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Traitement...');

    const date_livraison = $('#date_livraison').val();
    const simulate = $('#dry_run').is(':checked');

    frappe.call({
      method: 'log.utils.distribution.repartir_livraisons_automatique',
      args: { 
        date_livraison, 
        mode: 'manuel', 
        simulate, 
        manual_assignments: assignations 
      },
      callback: function(r) {
        btn.prop('disabled', false).html('<i class="fa fa-check"></i> Valider les Assignations');
        if (r.message && r.message.success) {
          current_data = r.message;
          is_simulation = r.message.simulate;
          afficher_resultats(r.message);
          frappe.show_alert({ message: 'Assignations manuelles validées avec succès', indicator: 'green' });
        } else {
          frappe.msgprint('Erreur lors de la validation des assignations');
        }
      },
      error: function() {
        btn.prop('disabled', false).html('<i class="fa fa-check"></i> Valider les Assignations');
        frappe.msgprint('Erreur lors de la validation des assignations');
      }
    });
  }

  function afficher_summary(data, container) {
    const total_bons = data.total_bons_date || 0;
    const total_colis = data.total_colis_date || 0;
    const nb_livreurs = data.livreurs_actifs ? data.livreurs_actifs.length : 0;
    const nb_communes = data.communes_data ? data.communes_data.length : 0;

    $(container).html(`
      <div class="row mb-3">
        <div class="col-md-3">
          <div class="card" style="background-color: white; border: 1px solid #dee2e6; color: #333; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div class="card-body text-center" style="padding: 12px;">
              <h6 style="margin-bottom: 5px; font-weight: 600;">${total_bons}</h6>
              <small style="color: #6c757d;">Total bons</small>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card" style="background-color: white; border: 1px solid #dee2e6; color: #333; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div class="card-body text-center" style="padding: 12px;">
              <h6 style="margin-bottom: 5px; font-weight: 600;">${total_colis}</h6>
              <small style="color: #6c757d;">Total colis</small>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card" style="background-color: white; border: 1px solid #dee2e6; color: #333; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div class="card-body text-center" style="padding: 12px;">
              <h6 style="margin-bottom: 5px; font-weight: 600;">${nb_communes}</h6>
              <small style="color: #6c757d;">Communes</small>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card" style="background-color: white; border: 1px solid #dee2e6; color: #333; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div class="card-body text-center" style="padding: 12px;">
              <h6 style="margin-bottom: 5px; font-weight: 600;">${nb_livreurs}</h6>
              <small style="color: #6c757d;">Livreurs disponibles</small>
            </div>
          </div>
        </div>
      </div>
    `);
  }

  function afficher_repartition(repartition, container) {
    if (!repartition || Object.keys(repartition).length === 0) {
      $(container).html('<div class="alert alert-warning">Aucune répartition disponible</div>');
      return;
    }

    let html = `
      <div class="card">
        <div class="card-header">
          <h5><i class="fa fa-list"></i> Répartition par Livreur</h5>
        </div>
        <div class="card-body">
          <div class="table-responsive">
            <table class="table table-bordered">
              <thead class="thead-light">
                <tr>
                  <th>Livreur</th>
                  <th>Communes</th>
                  <th>Bons de Livraison</th>
                  <th>Total Colis</th>
                  <th>Taux de Charge</th>
                </tr>
              </thead>
              <tbody>`;

    Object.values(repartition).forEach(livreur_data => {
      const taux_charge = livreur_data.taux_charge || 0;
      const taux_class = taux_charge < 50 ? 'success' : taux_charge < 80 ? 'warning' : 'danger';
      
      html += `
        <tr>
          <td><strong>${livreur_data.livreur}</strong></td>
          <td>${livreur_data.communes ? livreur_data.communes.join(', ') : '-'}</td>
          <td>${livreur_data.total_bons || 0}</td>
          <td>${livreur_data.total_colis || 0}</td>
          <td><span class="badge badge-${taux_class}">${taux_charge}%</span></td>
        </tr>`;
    });

    html += `
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    $(container).html(html);
  }

  function confirmer_repartition() {
    // Protection contre les appels multiples
    if ($('#btn_confirmer').prop('disabled')) {
      return;
    }

    if (!current_data) {
      frappe.msgprint('Aucune donnée de répartition disponible');
      return;
    }

    if (!current_data.simulate) {
      frappe.msgprint('Aucune simulation à confirmer');
      return;
    }

    frappe.confirm('Êtes-vous sûr de vouloir créer les livraisons selon cette répartition ?', function() {
      const date_livraison = $('#date_livraison').val();
      const btn = $('#btn_confirmer');

      // Désactiver le bouton immédiatement pour éviter les appels multiples
      btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Création...');

      // Extraire les assignations de la simulation pour les reproduire exactement
      const manual_assignments = {};
      if (current_data.repartition) {
        Object.keys(current_data.repartition).forEach(livreur_nom => {
          const repartition_livreur = current_data.repartition[livreur_nom];
          if (repartition_livreur && repartition_livreur.livreur_id) {
            // Récupérer les bons de livraison de ce livreur pour extraire les communes
            if (repartition_livreur.bons_de_livraison) {
              repartition_livreur.bons_de_livraison.forEach(bon => {
                if (bon.commune) {
                  manual_assignments[bon.commune] = repartition_livreur.livreur_id;
                }
              });
            }
          }
        });
      }

      if (Object.keys(manual_assignments).length === 0) {
        frappe.msgprint('Erreur: Aucune assignation trouvée dans la simulation');
        btn.prop('disabled', false).html('<i class="fa fa-check"></i> Confirmer et Créer les Livraisons');
        return;
      }

      frappe.call({
        method: 'log.utils.distribution.repartir_livraisons_automatique',
        args: { date_livraison, mode: 'manuel', simulate: false, manual_assignments },
        callback: function(r) {
          btn.prop('disabled', false).html('<i class="fa fa-check"></i> Confirmer et Créer les Livraisons');

          if (r.message && r.message.success) {
            current_data = r.message;
            afficher_resultats(r.message);
            const nb_livraisons = r.message.livraisons_creees ? r.message.livraisons_creees.length : 0;
            frappe.show_alert({
              message: `${nb_livraisons} livraisons créées avec succès`,
              indicator: 'green'
            });

            // Rediriger vers la liste des livraisons créées
            if (r.message.livraisons_creees && r.message.livraisons_creees.length > 0) {
              setTimeout(() => {
                frappe.set_route('List', 'Livraison', { 'batch_id': r.message.batch_id });
              }, 2000);
            }
          } else {
            frappe.msgprint('Erreur lors de la création des livraisons: ' + (r.message?.error || 'Erreur inconnue'));
          }
        },
        error: function(xhr, status, error) {
          btn.prop('disabled', false).html('<i class="fa fa-check"></i> Confirmer et Créer les Livraisons');
          frappe.msgprint('Erreur lors de la création des livraisons: ' + error);
        }
      });
    });
  }

  function reset_interface() {
    current_data = null;
    $('#resultats_section').hide();
    $('#interface_manuelle_section').hide();
    $('#date_livraison').val(frappe.datetime.get_today());
    $('#dry_run').prop('checked', true);
    is_simulation = true;
    update_button_text();
  }

  function synchroniser_livraisons() {
    const date_livraison = $('#date_livraison').val();
    
    if (!date_livraison) {
      frappe.msgprint('Veuillez sélectionner une date de livraison');
      return;
    }

    frappe.confirm('Voulez-vous synchroniser les livraisons existantes pour cette date ?', function() {
      const btn = $('#btn_synchroniser');
      btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Synchronisation...');

      frappe.call({
        method: 'log.utils.distribution.synchroniser_livraisons_existantes',
        args: { date_livraison },
        callback: function(r) {
          btn.prop('disabled', false).html('<i class="fa fa-sync"></i> Synchroniser');
          
          if (r.message && r.message.success) {
            frappe.show_alert({ 
              message: r.message.message, 
              indicator: 'green' 
            });
            
            // Recharger la page ou afficher les résultats
            setTimeout(() => {
              location.reload();
            }, 2000);
          } else {
            frappe.msgprint('Erreur lors de la synchronisation: ' + (r.message?.error || 'Erreur inconnue'));
          }
        },
        error: function(xhr, status, error) {
          btn.prop('disabled', false).html('<i class="fa fa-sync"></i> Synchroniser');
          frappe.msgprint('Erreur lors de la synchronisation: ' + error);
        }
      });
    });
  }

  function forcer_synchronisation() {
    const date_livraison = $('#date_livraison').val();
    
    if (!date_livraison) {
      frappe.msgprint('Veuillez sélectionner une date de livraison');
      return;
    }

    frappe.confirm('ATTENTION: Cette opération va forcer la synchronisation de toutes les livraisons avec les bons de livraison actuels. Êtes-vous sûr ?', function() {
      const btn = $('#btn_forcer_sync');
      btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Synchronisation forcée...');

      frappe.call({
        method: 'log.utils.distribution.forcer_synchronisation_livraisons',
        args: { date_livraison },
        callback: function(r) {
          btn.prop('disabled', false).html('<i class="fa fa-exclamation-triangle"></i> Forcer Sync');
          
          if (r.message && r.message.success) {
            frappe.show_alert({ 
              message: r.message.message, 
              indicator: 'green' 
            });
            
            // Recharger la page
            setTimeout(() => {
              location.reload();
            }, 2000);
          } else {
            frappe.msgprint('Erreur lors de la synchronisation forcée: ' + (r.message?.error || 'Erreur inconnue'));
          }
        },
        error: function(xhr, status, error) {
          btn.prop('disabled', false).html('<i class="fa fa-exclamation-triangle"></i> Forcer Sync');
          frappe.msgprint('Erreur lors de la synchronisation forcée: ' + error);
        }
      });
    });
  }

  function modifier_assignations_manuellement() {
    if (!current_data) return;
    
    const date_livraison = $('#date_livraison').val();
    const simulate = $('#dry_run').is(':checked');
    
    frappe.call({
      method: 'log.utils.distribution.repartir_livraisons_automatique',
      args: { date_livraison, mode: 'manuel', simulate },
      callback: function(r) {
        if (r.message && r.message.success && r.message.requires_manual_selection) {
          afficher_interface_manuelle(r.message);
        } else {
          frappe.msgprint('Erreur lors du passage en mode manuel');
        }
      },
      error: function() {
        frappe.msgprint('Erreur lors du passage en mode manuel');
      }
    });
  }

  function afficher_dialog_synchronisation(data) {
    frappe.msgprint(data.message || 'Des livraisons existantes nécessitent une synchronisation. Veuillez forcer la synchronisation.');
    // Optionnel: Rediriger vers la page de synchronisation
    // frappe.set_route('Form', 'Livraison', { 'batch_id': data.batch_id });
  }
};