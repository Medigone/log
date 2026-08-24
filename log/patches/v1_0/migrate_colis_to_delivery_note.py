# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

import frappe

COLIS_FIELD_CANDIDATES = [
	("status", "custom_statut"),
	("image", "custom_qr_image"),
	("photo_livraison", "custom_photo_livraison"),
	("gps", "custom_gps"),
	("commentaire_livreur", "custom_commentaire_livreur"),
	("preparation_user", "custom_user_preparation"),
	("user_preparation", "custom_user_preparation"),
	("date_preparation", "custom_date_preparation"),
	("enlevement_user", "custom_user_enlevement"),
	("user_enlevement", "custom_user_enlevement"),
	("date_enlevement", "custom_date_enlevement"),
	("livraison_user", "custom_user_livraison"),
	("user_livraison", "custom_user_livraison"),
	("date_livraison", "custom_date_livraison"),
]

ARTICLE_FIELD_CANDIDATES = [
	("quantite_livree", "custom_quantite_livree"),
	("statut_article", "custom_statut_article"),
	("raison_non_livraison", "custom_raison_non_livraison"),
	("commentaire_article", "custom_commentaire_article"),
]


def execute():
	"""Copy operational data from archived Colis onto Delivery Notes, then refresh Livraison statuses."""
	_migrate_colis_rows()
	_refresh_livraison_statuses()
	_archive_colis_tables_if_ready()


def run_after_migrate():
	"""Re-run the copy after custom fields are synced. Skip once Colis tables are archived."""
	if not _table_exists("tabColis"):
		return
	execute()


def _table_exists(table_name):
	return bool(frappe.db.sql("SHOW TABLES LIKE %s", (table_name,)))


def _columns(table_name):
	if not _table_exists(table_name):
		return set()
	return {row[0] for row in frappe.db.sql(f"SHOW COLUMNS FROM `{table_name}`")}


def _source_table():
	for table in ("tabColis", "_archive_tabColis"):
		if _table_exists(table):
			return table
	return None


def _articles_table():
	for table in ("tabArticles Colis", "_archive_tabArticles_Colis", "_archive_tabArticles Colis"):
		if _table_exists(table):
			return table
	return None


def _mapped_select(candidates, source_cols, target_doctype):
	"""Return {alias: source_col} for columns that exist on both source and target."""
	mapping = {}
	for source_col, target_field in candidates:
		if source_col not in source_cols:
			continue
		if target_field in mapping.values():
			continue
		if not frappe.db.has_column(target_doctype, target_field):
			continue
		mapping[source_col] = target_field
	return mapping


def _migrate_colis_rows():
	source = _source_table()
	if not source:
		return

	source_cols = _columns(source)
	if "bl" not in source_cols:
		return

	colis_map = _mapped_select(COLIS_FIELD_CANDIDATES, source_cols, "Delivery Note")
	select_cols = ["name", "bl"] + list(colis_map.keys())
	colis_rows = frappe.db.sql(
		f"""
		SELECT {", ".join(f"`{col}`" for col in select_cols)}
		FROM `{source}`
		WHERE bl IS NOT NULL AND bl != ''
		ORDER BY modified ASC
		""",
		as_dict=True,
	)

	articles_table = _articles_table()
	article_map = {}
	if articles_table:
		article_map = _mapped_select(
			ARTICLE_FIELD_CANDIDATES, _columns(articles_table), "Delivery Note Item"
		)

	for colis in colis_rows:
		bl = colis.bl
		if not frappe.db.exists("Delivery Note", bl):
			continue

		values = {}
		for source_col, target_field in colis_map.items():
			value = colis.get(source_col)
			if target_field == "custom_statut":
				value = value or "Nouveau"
			if value not in (None, ""):
				values[target_field] = value
		if values:
			frappe.db.set_value("Delivery Note", bl, values, update_modified=False)

		if not articles_table or not article_map:
			continue

		article_select = ["article"] + list(article_map.keys())
		articles = frappe.db.sql(
			f"""
			SELECT {", ".join(f"`{col}`" for col in article_select)}
			FROM `{articles_table}`
			WHERE parent = %s
			""",
			(colis.name,),
			as_dict=True,
		)
		for article in articles:
			if not article.get("article"):
				continue
			item_name = frappe.db.get_value(
				"Delivery Note Item",
				{"parent": bl, "item_code": article.article},
				"name",
			)
			if not item_name:
				continue
			item_values = {}
			for source_col, target_field in article_map.items():
				value = article.get(source_col)
				if target_field == "custom_statut_article":
					value = value or "En attente"
				if value not in (None, ""):
					item_values[target_field] = value
			if item_values:
				frappe.db.set_value("Delivery Note Item", item_name, item_values, update_modified=False)


def _refresh_livraison_statuses():
	if not frappe.db.exists("DocType", "Livraison"):
		return
	if not frappe.db.has_column("Delivery Note", "custom_statut"):
		return
	from log.livraison_hooks import calculate_livraison_status_from_bls

	for name in frappe.get_all("Livraison", pluck="name"):
		doc = frappe.get_doc("Livraison", name)
		doc.db_set("status", calculate_livraison_status_from_bls(doc), update_modified=False)


def _archive_colis_tables_if_ready():
	"""Rename leftover Colis tables only after target DN fields exist (customizations synced)."""
	if not frappe.db.has_column("Delivery Note", "custom_statut"):
		return
	for table in ("tabColis", "tabArticles Colis", "tabLivraison Colis", "tabArticles Preparation"):
		archive = f"_archive_{table}"
		if not _table_exists(table):
			continue
		if _table_exists(archive):
			frappe.db.sql(f"DROP TABLE IF EXISTS `{table}`")
		else:
			frappe.db.sql(f"RENAME TABLE `{table}` TO `{archive}`")
		print(f"Archived leftover table {table}")
