# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

import frappe

def execute():
	"""Patch to clean up the colis system from the database.
	
	This patch:
	1. Removes the 'colis' field from Livraison (child table Livraison Colis)
	2. Removes the 'total_colis' field from Livraison
	3. Archives or drops the colis-related tables
	"""
	
	# List of DocTypes to remove from the database
	doctypes_to_remove = [
		"Colis",
		"Articles Colis", 
		"Articles Preparation",
		"Livraison Colis"
	]
	
	# Step 1: Remove child table link field from Livraison
	try:
		if frappe.db.has_column("tabLivraison", "total_colis"):
			frappe.db.sql("ALTER TABLE `tabLivraison` DROP COLUMN IF EXISTS `total_colis`")
			frappe.db.commit()
			print("Removed 'total_colis' column from Livraison")
	except Exception as e:
		print(f"Warning: Could not remove total_colis column: {str(e)}")
	
	# Step 2: Delete DocType records from database (metadata)
	for doctype in doctypes_to_remove:
		try:
			# Check if DocType exists in metadata
			if frappe.db.exists("DocType", doctype):
				# Delete all linked documents first
				frappe.db.delete("Custom Field", {"dt": doctype})
				frappe.db.delete("Property Setter", {"doc_type": doctype})
				frappe.db.delete("DocType Link", {"parent": doctype})
				frappe.db.delete("DocType Action", {"parent": doctype})
				frappe.db.delete("DocType State", {"parent": doctype})
				frappe.db.delete("DocField", {"parent": doctype})
				frappe.db.delete("DocPerm", {"parent": doctype})
				
				# Delete the DocType itself
				frappe.db.delete("DocType", {"name": doctype})
				print(f"Removed DocType metadata for '{doctype}'")
		except Exception as e:
			print(f"Warning: Could not remove DocType metadata for {doctype}: {str(e)}")
	
	# Step 3: Archive the data tables (rename instead of drop for safety)
	for doctype in doctypes_to_remove:
		table_name = f"tab{doctype}"
		archive_name = f"_archive_{table_name}"
		try:
			if frappe.db.table_exists(table_name):
				# Check if archive table already exists
				if frappe.db.table_exists(archive_name):
					# If archive exists, just drop the original
					frappe.db.sql(f"DROP TABLE IF EXISTS `{table_name}`")
					print(f"Dropped table '{table_name}' (archive already exists)")
				else:
					# Rename to archive
					frappe.db.sql(f"RENAME TABLE `{table_name}` TO `{archive_name}`")
					print(f"Archived table '{table_name}' to '{archive_name}'")
		except Exception as e:
			print(f"Warning: Could not archive table {table_name}: {str(e)}")
	
	# Step 4: Clean up references in Singles table
	try:
		frappe.db.delete("Singles", {"doctype": ["in", doctypes_to_remove]})
		print("Cleaned up Singles table references")
	except Exception as e:
		print(f"Warning: Could not clean Singles table: {str(e)}")
	
	# Step 5: Clear cache
	frappe.clear_cache()
	print("Cache cleared")
	
	frappe.db.commit()
	print("Colis system removal patch completed successfully")

