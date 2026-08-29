"""Indexe les campagnes et événements promotionnels du portail."""

import frappe


def execute():
	indexes = [
		("Campagne Portail", "idx_campagne_portail_live", ["enabled", "published", "placement", "priority"]),
		("Evenement Promotion Portail", "idx_event_promo_campaign_type", ["campaign", "event_type"]),
	]
	for doctype, index_name, columns in indexes:
		table = f"tab{doctype}"
		if not frappe.db.table_exists(table):
			continue
		existing = frappe.db.sql(f"SHOW INDEX FROM `{table}` WHERE Key_name = %s", index_name)
		if existing:
			continue
		quoted = ", ".join(f"`{column}`" for column in columns)
		frappe.db.sql(f"ALTER TABLE `{table}` ADD INDEX `{index_name}` ({quoted})")
