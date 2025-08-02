import frappe

def test_sync():
    # Créer un nouveau document Livraison
    doc = frappe.new_doc('Livraison')
    doc.livreur = 'LIV-00001'
    doc.date_liv = frappe.utils.today()
    
    # Récupérer un bon de livraison existant
    delivery_notes = frappe.get_all('Delivery Note', limit=1)
    print(f'Delivery notes found: {len(delivery_notes)}')
    
    if delivery_notes:
        delivery_note = delivery_notes[0].name
        print(f'Using delivery note: {delivery_note}')
        
        # Vérifier les colis liés
        colis_lies = frappe.get_all('Colis', filters={'bl': delivery_note})
        print(f'Colis linked to delivery note: {len(colis_lies)}')
        
        if colis_lies:
            # Ajouter le bon de livraison
            doc.append('bons_de_livraison', {'bon_de_livraison': delivery_note})
            
            # Sauvegarder
            doc.save()
            print(f'Livraison created: {doc.name}')
            print(f'Colis synchronized: {len(doc.colis)}')
            
            for colis in doc.colis:
                print(f'- Colis: {colis.colis}, Client: {colis.client}')
        else:
            print('No colis linked to this delivery note')
    else:
        print('No delivery notes found')

test_sync()