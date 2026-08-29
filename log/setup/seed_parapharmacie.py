# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Catalogue de démo parapharmacie pour les tests d'interface du portail client."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import frappe
from frappe.utils import flt
from frappe.utils.file_manager import save_file

ROOT_GROUP = "Tous les Groupes d'Articles"
PARENT_GROUP = "Parapharmacie"
COMPANY = "Modern Pharma"
WAREHOUSE = "Magasins - MP"
STOCK_UOM = "N°"
SELLING_PRICE_LIST = "Vente standard"
BUYING_PRICE_LIST = "Achat standard"

CATEGORIES = [
	"Soins du visage",
	"Soins du corps",
	"Cheveux",
	"Hygiène",
	"Bébé & maman",
	"Compléments alimentaires",
	"Protection solaire",
	"Premiers soins",
]

FEATURED_GROUPS = [
	"Soins du visage",
	"Bébé & maman",
	"Protection solaire",
	"Compléments alimentaires",
]

HERO_IMAGE_STEM = "PARA-HERO"

# item_code, item_name, group, description, wholesale DZD, purchase DZD, PPA DZD, store_visible, show_price
ARTICLES = [
	("PARA-001", "Crème hydratante visage 50 ml", "Soins du visage", "Crème hydratante quotidienne pour peaux normales à sèches.", 1200, 720, 1650, 1, 1),
	("PARA-002", "Sérum vitamine C 30 ml", "Soins du visage", "Sérum antioxydant pour un teint plus lumineux.", 2800, 1680, 3850, 1, 1),
	("PARA-003", "Eau micellaire 500 ml", "Soins du visage", "Démaquillant doux sans rinçage, yeux et visage.", 850, 510, 1190, 1, 1),
	("PARA-004", "Crème anti-âge nuit 50 ml", "Soins du visage", "Soin de nuit raffermissant à la rétinol-like.", 3200, 1920, 4450, 1, 1),
	("PARA-005", "Gel nettoyant visage 200 ml", "Soins du visage", "Gel moussant pour peaux mixtes à grasses.", 780, 470, 1090, 1, 1),
	("PARA-006", "Lait corporel hydratant 400 ml", "Soins du corps", "Lait nourrissant pour le corps, texture non grasse.", 980, 590, 1350, 1, 1),
	("PARA-007", "Huile sèche multi-usages 150 ml", "Soins du corps", "Huile sèche corps et cheveux à l'huile d'argan.", 1450, 870, 1990, 1, 1),
	("PARA-008", "Beurre de karité 200 ml", "Soins du corps", "Beurre de karité pur pour peaux très sèches.", 1100, 660, 1520, 1, 1),
	("PARA-009", "Crème mains réparatrice 75 ml", "Soins du corps", "Crème mains pour peaux abîmées et gercées.", 620, 370, 860, 1, 1),
	("PARA-010", "Shampooing doux 400 ml", "Cheveux", "Shampooing usage fréquent pour tous types de cheveux.", 740, 440, 1020, 1, 1),
	("PARA-011", "Après-shampooing démêlant 200 ml", "Cheveux", "Soin démêlant pour cheveux secs et ternes.", 690, 410, 950, 1, 1),
	("PARA-012", "Huile capillaire nourrissante 100 ml", "Cheveux", "Huile de soin pour pointes sèches et cheveux cassants.", 1280, 770, 1760, 1, 1),
	("PARA-013", "Masque réparateur 250 ml", "Cheveux", "Masque nutrition intense, pose 5 minutes.", 1550, 930, 2140, 1, 1),
	("PARA-014", "Gel douche surgras 500 ml", "Hygiène", "Gel douche dermatologique pour peaux sensibles.", 540, 320, 750, 1, 1),
	("PARA-015", "Déodorant roll-on 50 ml", "Hygiène", "Déodorant 24 h sans sels d'aluminium.", 480, 290, 670, 1, 1),
	("PARA-016", "Dentifrice protection complète 75 ml", "Hygiène", "Dentifrice fluoré pour dents et gencives.", 320, 190, 450, 1, 1),
	("PARA-017", "Savon dermatologique 100 g", "Hygiène", "Pain dermatologique surgras, sans savon.", 290, 170, 410, 1, 1),
	("PARA-018", "Liniment oléo-calcaire 250 ml", "Bébé & maman", "Liniment pour le change du nourrisson.", 890, 530, 1230, 1, 1),
	("PARA-019", "Crème change 100 ml", "Bébé & maman", "Crème isolante contre les rougeurs du siège.", 760, 460, 1050, 1, 1),
	("PARA-020", "Eau nettoyante bébé 500 ml", "Bébé & maman", "Eau nettoyante sans rinçage visage et siège.", 820, 490, 1140, 1, 1),
	("PARA-021", "Huile de massage bébé 100 ml", "Bébé & maman", "Huile douce pour le massage quotidien.", 980, 590, 1350, 1, 1),
	("PARA-022", "Magnésium marin 60 gélules", "Compléments alimentaires", "Complément alimentaire fatigue et nervosité.", 1650, 990, 2280, 1, 1),
	("PARA-023", "Vitamine D3 90 comprimés", "Compléments alimentaires", "Vitamine D3 1000 UI, une prise par jour.", 1420, 850, 1960, 1, 1),
	("PARA-024", "Oméga-3 60 capsules", "Compléments alimentaires", "Huile de poisson concentrée EPA/DHA.", 2100, 1260, 2890, 1, 1),
	("PARA-025", "Probiotiques 30 gélules", "Compléments alimentaires", "Flore intestinale, 10 milliards d'UFC.", 2380, 1430, 3280, 1, 1),
	("PARA-026", "Écran solaire visage SPF 50+ 50 ml", "Protection solaire", "Très haute protection, texture non grasse.", 2450, 1470, 3380, 1, 1),
	("PARA-027", "Lait solaire corps SPF 30 200 ml", "Protection solaire", "Protection solaire quotidienne pour toute la famille.", 1890, 1130, 2610, 1, 1),
	("PARA-028", "Lait après-soleil 150 ml", "Protection solaire", "Soin apaisant et hydratant après exposition.", 1120, 670, 1540, 1, 1),
	("PARA-029", "Stick solaire lèvres SPF 50", "Protection solaire", "Stick compact pour lèvres et zones sensibles.", 680, 410, 940, 1, 1),
	("PARA-030", "Solution antiseptique 125 ml", "Premiers soins", "Antiseptique cutané pour plaies superficielles.", 430, 260, 600, 1, 1),
	("PARA-031", "Pansements assortis x20", "Premiers soins", "Boîte de 20 pansements de tailles variées.", 350, 210, 490, 1, 1),
	("PARA-032", "Crème cicatrisante 40 g", "Premiers soins", "Crème réparatrice pour petites plaies et irritations.", 920, 550, 1270, 1, 1),
	("PARA-033", "Spray brûlure 50 ml", "Premiers soins", "Spray apaisant pour brûlures superficielles.", 1340, 800, 1850, 1, 1),
	# Cas d'interface : visible sans prix, et article masqué du store
	("PARA-034", "Crème contour des yeux 15 ml", "Soins du visage", "Soin contour des yeux anti-cernes — prix sur demande.", 1950, 1170, 2690, 1, 0),
	("PARA-035", "Gant de toilette bébé x5", "Bébé & maman", "Article interne, non affiché dans le store.", 180, 110, 250, 0, 1),
]


def execute():
	_ensure_groups()
	created, updated = _ensure_articles()
	imaged = _ensure_article_images()
	_ensure_store_settings()
	frappe.db.commit()
	try:
		from log.services.portal_merchandising import clear_storefront_cache

		clear_storefront_cache()
	except Exception:
		pass
	print(f"Groupes : {PARENT_GROUP} + {len(CATEGORIES)} catégories")
	print(f"Articles créés : {created}, mis à jour : {updated}")
	print(f"Images rattachées : {imaged}")
	print("Rayons portail : " + ", ".join(FEATURED_GROUPS))


def _ensure_groups():
	if not frappe.db.exists("Item Group", ROOT_GROUP):
		frappe.throw(f"Le groupe racine « {ROOT_GROUP} » est introuvable.")
	_upsert_group(PARENT_GROUP, ROOT_GROUP, is_group=1)
	for name in CATEGORIES:
		_upsert_group(name, PARENT_GROUP, is_group=0)


def _upsert_group(name: str, parent: str, *, is_group: int):
	if frappe.db.exists("Item Group", name):
		doc = frappe.get_doc("Item Group", name)
		changed = False
		if doc.parent_item_group != parent:
			doc.parent_item_group = parent
			changed = True
		if int(doc.is_group or 0) != is_group:
			doc.is_group = is_group
			changed = True
		if changed:
			doc.save(ignore_permissions=True)
		return
	frappe.get_doc(
		{
			"doctype": "Item Group",
			"item_group_name": name,
			"parent_item_group": parent,
			"is_group": is_group,
		}
	).insert(ignore_permissions=True)


def _ensure_articles():
	created = 0
	updated = 0
	for row in ARTICLES:
		code, name, group, description, selling, buying, ppa, visible, show_price = row
		if frappe.db.exists("Item", code):
			_update_item(code, name, group, description, selling, ppa, visible, show_price)
			updated += 1
		else:
			_insert_item(code, name, group, description, selling, ppa, visible, show_price)
			created += 1
		_upsert_item_price(code, SELLING_PRICE_LIST, selling)
		_upsert_item_price(code, BUYING_PRICE_LIST, buying)
	return created, updated


def _ensure_article_images() -> int:
	attached = 0
	for row in ARTICLES:
		code = row[0]
		path = _find_image(code)
		if not path:
			continue
		if _attach_file(path, "Item", code, "image"):
			attached += 1
	return attached


def _item_payload(code, name, group, description, selling, ppa, visible, show_price):
	payload = {
		"item_code": code,
		"item_name": name,
		"item_group": group,
		"stock_uom": STOCK_UOM,
		"description": description,
		"is_stock_item": 1,
		"is_sales_item": 1,
		"is_purchase_item": 1,
		"include_item_in_manufacturing": 0,
		"has_variants": 0,
		"disabled": 0,
		"standard_rate": flt(selling),
		"custom_ppa": flt(ppa),
		"item_defaults": [
			{
				"company": COMPANY,
				"default_warehouse": WAREHOUSE,
			}
		],
	}
	if frappe.db.has_column("Item", "custom_afficher_dans_store"):
		payload["custom_afficher_dans_store"] = visible
	if frappe.db.has_column("Item", "custom_afficher_prix_store"):
		payload["custom_afficher_prix_store"] = show_price
	return payload


def _insert_item(code, name, group, description, selling, ppa, visible, show_price):
	doc = frappe.get_doc({"doctype": "Item", **_item_payload(code, name, group, description, selling, ppa, visible, show_price)})
	doc.insert(ignore_permissions=True)


def _update_item(code, name, group, description, selling, ppa, visible, show_price):
	doc = frappe.get_doc("Item", code)
	payload = _item_payload(code, name, group, description, selling, ppa, visible, show_price)
	payload.pop("item_code", None)
	defaults = payload.pop("item_defaults")
	doc.update(payload)
	if not any(row.company == COMPANY for row in doc.get("item_defaults") or []):
		doc.append("item_defaults", defaults[0])
	doc.save(ignore_permissions=True)


def _upsert_item_price(item_code: str, price_list: str, rate: float):
	if not frappe.db.exists("Price List", price_list):
		return
	existing = frappe.db.get_value(
		"Item Price",
		{"item_code": item_code, "price_list": price_list, "uom": STOCK_UOM, "selling": 1 if price_list == SELLING_PRICE_LIST else 0},
		"name",
	)
	if not existing:
		existing = frappe.db.get_value("Item Price", {"item_code": item_code, "price_list": price_list}, "name")
	if existing:
		frappe.db.set_value("Item Price", existing, "price_list_rate", flt(rate), update_modified=False)
		return
	frappe.get_doc(
		{
			"doctype": "Item Price",
			"item_code": item_code,
			"price_list": price_list,
			"price_list_rate": flt(rate),
			"uom": STOCK_UOM,
		}
	).insert(ignore_permissions=True)


def _ensure_store_settings():
	if not frappe.db.exists("DocType", "Parametres Boutique Portail"):
		return
	settings = frappe.get_single("Parametres Boutique Portail")
	settings.fallback_headline = "Parapharmacie — vos essentiels santé & beauté"
	settings.fallback_cta_label = "Parcourir le catalogue"
	settings.fallback_body = "Soins, hygiène, bébé, solaires et compléments disponibles pour vos pharmacies."
	settings.show_categories = 1
	settings.show_promotions = 1
	settings.show_featured = 1
	if not settings.rail_limit:
		settings.rail_limit = 8
	settings.set("featured_groups", [])
	for index, group in enumerate(FEATURED_GROUPS):
		settings.append("featured_groups", {"item_group": group, "display_order": index})
	hero = _find_image(HERO_IMAGE_STEM)
	if hero:
		url = _attach_file(hero, "Parametres Boutique Portail", settings.name, "fallback_image")
		if url:
			settings.fallback_image = url
	settings.save(ignore_permissions=True)


def _image_search_dirs() -> list[Path]:
	dirs = [Path(__file__).resolve().parent / "parapharmacie_images"]
	cursor_assets = Path.home() / ".cursor/projects/Users-aminemelizi-Frappe-frappe-bench-apps-log/assets"
	if cursor_assets.is_dir():
		dirs.append(cursor_assets)
	return dirs


def _find_image(stem: str) -> Path | None:
	for folder in _image_search_dirs():
		for suffix in (".jpg", ".jpeg", ".png", ".webp"):
			path = folder / f"{stem}{suffix}"
			if path.is_file():
				return path
	return None


def _prepare_jpeg(path: Path, *, hero: bool = False) -> tuple[str, bytes]:
	from PIL import Image

	image = Image.open(path)
	if image.mode in {"RGBA", "P"}:
		image = image.convert("RGB")
	elif image.mode != "RGB":
		image = image.convert("RGB")
	image.thumbnail((1600, 900) if hero else (1000, 1000))
	buffer = BytesIO()
	image.save(buffer, format="JPEG", quality=82, optimize=True)
	return f"{path.stem}.jpg", buffer.getvalue()


def _attach_file(path: Path, doctype: str, name: str, fieldname: str) -> str | None:
	fname, content = _prepare_jpeg(path, hero=path.stem == HERO_IMAGE_STEM)
	for existing in frappe.get_all(
		"File",
		filters={"attached_to_doctype": doctype, "attached_to_name": name, "attached_to_field": fieldname},
		pluck="name",
	):
		frappe.delete_doc("File", existing, force=True, ignore_permissions=True)
	file_doc = save_file(fname, content, doctype, name, is_private=0, df=fieldname)
	url = file_doc.file_url
	frappe.db.set_value(doctype, name, fieldname, url, update_modified=False)
	return url
