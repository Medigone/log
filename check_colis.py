import frappe

# Vérifier les colis disponibles
colis_list = frappe.get_all('Colis', fields=['name', 'custom_numero_sequence'], limit=5)
print('Colis disponibles:')
for c in colis_list:
    print(f'- {c.name}: {c.custom_numero_sequence}')

if not colis_list:
    print('Aucun colis trouvé dans la base de données')
else:
    print(f'\nTotal: {len(colis_list)} colis trouvés') 