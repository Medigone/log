  function afficher_dialog_synchronisation(data) {
    const options = data.options || ['synchroniser', 'recréer', 'annuler'];
    
    let message = data.message || 'Il existe déjà des livraisons pour cette date.';
    message += '\n\nQue souhaitez-vous faire ?';
    
    const dialog = new frappe.ui.Dialog({
      title: 'Livraisons existantes détectées',
      size: 'large',
      fields: [
        {
          fieldtype: 'HTML',
          options: `<div class="alert alert-info">
            <strong>${data.livraisons_existantes}</strong> livraison(s) existante(s) pour le ${$('#date_livraison').val()}
            <br><br>
            <strong>Options disponibles :</strong>
            <ul>
              <li><strong>Synchroniser :</strong> Mettre à jour les livraisons existantes avec les changements</li>
              <li><strong>Recréer :</strong> Supprimer les anciennes et créer de nouvelles livraisons</li>
              <li><strong>Annuler :</strong> Ne rien faire</li>
            </ul>
          </div>`
        }
      ],
      primary_action_label: 'Synchroniser',
      primary_action: function() {
        dialog.hide();
        synchroniser_livraisons();
      },
      secondary_action_label: 'Recréer',
      secondary_action: function() {
        dialog.hide();
        recréer_livraisons();
      }
    });
    
    dialog.show();
    
    // Ajouter un bouton Annuler
    dialog.$wrapper.find('.modal-footer').append(`
      <button class="btn btn-default" onclick="dialog.hide()">
        Annuler
      </button>
    `);
  }

  function recréer_livraisons() {
    const date_livraison = $('#date_livraison').val();
    
    frappe.confirm('Êtes-vous sûr de vouloir supprimer toutes les livraisons existantes et en créer de nouvelles ?', function() {
      // Supprimer d'abord les livraisons existantes
      frappe.call({
        method: 'log.utils.distribution.nettoyer_livraisons_vides',
        callback: function(r) {
          if (r.message && r.message.success) {
            frappe.show_alert({ 
              message: 'Livraisons supprimées, génération de nouvelles livraisons...', 
              indicator: 'green' 
            });
            
            // Relancer la génération
            setTimeout(() => {
              generer_repartition();
            }, 1000);
          }
        }
      });
    });
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
          btn.prop('disabled', false).html('<i class fa-sync"></i> Synchroniser');
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
