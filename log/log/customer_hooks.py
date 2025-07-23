import frappe

def uppercase_customer_name(doc, method):
    # Convertir le nom du client en majuscules s'il existe
    if doc.customer_name:
        doc.customer_name = doc.customer_name.upper()


@frappe.whitelist()
def get_customer_contacts(customer):
    contacts_data = frappe.db.sql("""
        SELECT 
            c.name AS docname,
            TRIM(CONCAT_WS(' ', c.first_name, c.last_name)) AS contact,
            c.designation,
            MAX(CASE WHEN pn.is_primary_mobile_no = 1 THEN pn.phone END) AS mobile,
            MAX(CASE WHEN e.is_primary = 1 THEN e.email_id END) AS email
        FROM `tabContact` c
        LEFT JOIN `tabDynamic Link` dl 
            ON c.name = dl.parent AND dl.link_doctype = 'Customer' AND dl.link_name = %s
        LEFT JOIN `tabContact Phone` pn ON c.name = pn.parent
        LEFT JOIN `tabContact Email` e ON c.name = e.parent
        WHERE dl.link_name IS NOT NULL
        GROUP BY c.name
    """, (customer,), as_dict=True)
    
    return contacts_data