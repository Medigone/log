"""Merchandising du portail client : campagnes Desk, ciblage et vitrine."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, get_datetime, now_datetime

STORE_VISIBLE_FIELD = "custom_afficher_dans_store"
STORE_SHOW_PRICE_FIELD = "custom_afficher_prix_store"

PLACEMENT_HERO = "Hero"
PLACEMENT_BANNER = "Bandeau"
PLACEMENT_RAIL = "Rayon produits"
PLACEMENTS = (PLACEMENT_HERO, PLACEMENT_BANNER, PLACEMENT_RAIL)

STATUS_ACTIVE = "Active"
STATUS_SCHEDULED = "Planifiée"
STATUS_DRAFT = "Brouillon"
STATUS_EXPIRED = "Expirée"
STATUS_DISABLED = "Désactivée"

OFFER_NONE = "Aucune"
OFFER_PRICING_RULE = "Pricing Rule"
OFFER_SCHEME = "Promotional Scheme"
OFFER_COUPON = "Coupon Code"

CTA_CATALOG = "Catalogue"
CTA_GROUP = "Groupe d'articles"
CTA_ITEM = "Article"
CTA_RAIL = "Rayon"

CACHE_TTL_SECONDS = 60
RAIL_LIMIT_DEFAULT = 8
EVENT_RETENTION_DAYS = 90

TARGET_CUSTOMER_GROUP = "Customer Group"
TARGET_TERRITORY = "Territory"
TARGET_PRICE_LIST = "Price List"


def compute_campaign_status(campaign, now=None) -> str:
	now = get_datetime(now or now_datetime())
	if not cint(campaign.get("enabled")):
		return STATUS_DISABLED
	if not cint(campaign.get("published")):
		return STATUS_DRAFT
	valid_from = get_datetime(campaign.get("valid_from")) if campaign.get("valid_from") else None
	valid_upto = get_datetime(campaign.get("valid_upto")) if campaign.get("valid_upto") else None
	if valid_from and valid_from > now:
		return STATUS_SCHEDULED
	if valid_upto and valid_upto < now:
		return STATUS_EXPIRED
	return STATUS_ACTIVE


def campaign_is_live(campaign, now=None) -> bool:
	return compute_campaign_status(campaign, now) == STATUS_ACTIVE


def get_customer_segments(customer: str) -> dict[str, str | None]:
	fields = ["customer_group", "territory", "default_price_list"]
	row = frappe.db.get_value("Customer", customer, fields, as_dict=True) or {}
	return {
		TARGET_CUSTOMER_GROUP: row.get("customer_group"),
		TARGET_TERRITORY: row.get("territory"),
		TARGET_PRICE_LIST: row.get("default_price_list"),
	}


def campaign_matches_segments(campaign, segments: dict[str, str | None]) -> bool:
	grouped: dict[str, set[str]] = defaultdict(set)
	for row in campaign.get("targets") or []:
		target_type = cstr(row.get("target_type")).strip()
		target_value = cstr(row.get("target_value")).strip()
		if target_type and target_value:
			grouped[target_type].add(target_value)
	if not grouped:
		return True
	for dimension, allowed in grouped.items():
		current = cstr(segments.get(dimension) or "").strip()
		if current not in allowed:
			return False
	return True


def _campaign_sort_key(campaign) -> tuple:
	return (
		-cint(campaign.get("priority") or 0),
		cstr(campaign.get("title") or ""),
		cstr(campaign.get("name") or ""),
	)


def validate_campaign(campaign) -> None:
	campaign.computed_status = compute_campaign_status(campaign)
	if campaign.placement not in PLACEMENTS:
		frappe.throw(_("L'emplacement de la campagne est invalide."))
	if campaign.get("priority") in (None, ""):
		frappe.throw(_("La priorité est obligatoire."))
	if cint(campaign.priority) < 0:
		frappe.throw(_("La priorité ne peut pas être négative."))
	valid_from = get_datetime(campaign.valid_from) if campaign.valid_from else None
	valid_upto = get_datetime(campaign.valid_upto) if campaign.valid_upto else None
	if valid_from and valid_upto and valid_upto < valid_from:
		frappe.throw(_("La date de fin doit être postérieure à la date de début."))

	_validate_cta(campaign)
	_validate_offer_source(campaign)
	_validate_items(campaign)
	_validate_targets(campaign)
	_warn_overlapping_campaigns(campaign)


def _validate_cta(campaign) -> None:
	cta_type = cstr(campaign.cta_type) or CTA_CATALOG
	if cta_type == CTA_GROUP and not campaign.cta_item_group:
		frappe.throw(_("Le groupe d'articles de destination est obligatoire."))
	if cta_type == CTA_ITEM:
		if not campaign.cta_item:
			frappe.throw(_("L'article de destination est obligatoire."))
		_assert_store_item(campaign.cta_item)


def _validate_offer_source(campaign) -> None:
	source = cstr(campaign.offer_source) or OFFER_NONE
	links = {
		OFFER_PRICING_RULE: campaign.get("pricing_rule"),
		OFFER_SCHEME: campaign.get("promotional_scheme"),
		OFFER_COUPON: campaign.get("coupon_code"),
	}
	filled = [name for name, value in links.items() if value]
	if source == OFFER_NONE:
		if filled:
			frappe.throw(_("Une seule source d'offre est autorisée. Choisissez la source correspondante."))
		campaign.pricing_rule = None
		campaign.promotional_scheme = None
		campaign.coupon_code = None
		return
	expected = links.get(source)
	if not expected:
		frappe.throw(_("La source d'offre sélectionnée est incomplète."))
	unexpected = [name for name, value in links.items() if name != source and value]
	if unexpected:
		frappe.throw(_("Une campagne ne peut référencer qu'une seule source de remise."))
	_assert_offer_alignment(campaign, source)


def _assert_offer_alignment(campaign, source: str) -> None:
	segments_from_campaign = _target_values_by_type(campaign)
	if source == OFFER_PRICING_RULE:
		rule = frappe.db.get_value(
			"Pricing Rule",
			campaign.pricing_rule,
			["disable", "selling", "applicable_for", "customer_group", "territory", "for_price_list"],
			as_dict=True,
		)
		if not rule or cint(rule.disable):
			frappe.throw(_("La règle de prix liée est inactive ou introuvable."))
		if not cint(rule.selling):
			frappe.throw(_("La règle de prix liée doit s'appliquer aux ventes."))
		_warn_if_rule_narrower(campaign, rule, segments_from_campaign)
	elif source == OFFER_COUPON:
		if not frappe.db.exists("Coupon Code", campaign.coupon_code):
			frappe.throw(_("Le code promo lié est introuvable."))
	elif source == OFFER_SCHEME:
		if not frappe.db.exists("Promotional Scheme", campaign.promotional_scheme):
			frappe.throw(_("Le schéma promotionnel lié est introuvable."))


def _warn_if_rule_narrower(campaign, rule, campaign_targets: dict[str, set[str]]) -> None:
	mapping = {
		"Customer Group": (TARGET_CUSTOMER_GROUP, rule.get("customer_group")),
		"Territory": (TARGET_TERRITORY, rule.get("territory")),
	}
	applicable = cstr(rule.get("applicable_for"))
	if applicable in mapping:
		dimension, value = mapping[applicable]
		if value:
			campaign_values = campaign_targets.get(dimension) or set()
			if campaign_values and value not in campaign_values:
				frappe.msgprint(
					_("Le ciblage de la règle de prix ({0}) est plus étroit que celui de la campagne.").format(value),
					indicator="orange",
					alert=True,
				)
			elif not campaign_values and not _is_tree_root(dimension, value):
				frappe.msgprint(
					_(
						"La campagne s'applique à tous les clients, mais la règle de prix ne cible que {0}. "
						"Les clients hors de ce groupe ne bénéficieront pas de la remise. "
						"Pour une offre générale, choisissez le groupe racine ou videz le champ « Applicable For » de la règle."
					).format(value),
					indicator="orange",
					alert=True,
				)
	price_list = cstr(rule.get("for_price_list"))
	if price_list and campaign_targets.get(TARGET_PRICE_LIST) and price_list not in campaign_targets[TARGET_PRICE_LIST]:
		frappe.msgprint(
			_("La liste de prix de la règle ne correspond pas au ciblage de la campagne."),
			indicator="orange",
			alert=True,
		)


def _is_tree_root(doctype: str, name: str) -> bool:
	parent_field = {
		TARGET_CUSTOMER_GROUP: "parent_customer_group",
		TARGET_TERRITORY: "parent_territory",
	}.get(doctype)
	if not parent_field or not frappe.db.exists(doctype, name):
		return False
	return not cstr(frappe.db.get_value(doctype, name, parent_field))


def _target_values_by_type(campaign) -> dict[str, set[str]]:
	grouped: dict[str, set[str]] = defaultdict(set)
	for row in campaign.get("targets") or []:
		if row.get("target_type") and row.get("target_value"):
			grouped[cstr(row.target_type)].add(cstr(row.target_value))
	return grouped


def _validate_items(campaign) -> None:
	seen = set()
	for row in campaign.get("items") or []:
		code = cstr(row.item_code).strip()
		if not code:
			continue
		if code in seen:
			frappe.throw(_("L'article {0} est présent plusieurs fois.").format(code))
		seen.add(code)
		_assert_store_item(code)


def _assert_store_item(item_code: str) -> None:
	fields = ["name", "disabled", "is_sales_item", "has_variants"]
	if _portal()._item_has_column(STORE_VISIBLE_FIELD):
		fields.append(STORE_VISIBLE_FIELD)
	row = frappe.db.get_value("Item", item_code, fields, as_dict=True)
	if not row:
		frappe.throw(_("L'article {0} est introuvable.").format(item_code))
	if cint(row.disabled) or not cint(row.is_sales_item) or cint(row.has_variants):
		frappe.throw(_("L'article {0} n'est pas vendable dans le store.").format(item_code))
	if _portal()._item_has_column(STORE_VISIBLE_FIELD) and not cint(row.get(STORE_VISIBLE_FIELD)):
		frappe.throw(_("L'article {0} n'est pas affiché dans le store.").format(item_code))


def _validate_targets(campaign) -> None:
	for row in campaign.get("targets") or []:
		if cstr(row.target_type) not in {TARGET_CUSTOMER_GROUP, TARGET_TERRITORY, TARGET_PRICE_LIST}:
			frappe.throw(_("La dimension de ciblage est invalide."))
		if not row.target_value:
			frappe.throw(_("Chaque cible doit avoir une valeur."))
		if not frappe.db.exists(row.target_type, row.target_value):
			frappe.throw(_("La cible {0} est introuvable.").format(row.target_value))


def _warn_overlapping_campaigns(campaign) -> None:
	if not cint(campaign.enabled) or not cint(campaign.published):
		return
	filters = {
		"enabled": 1,
		"published": 1,
		"placement": campaign.placement,
		"name": ["!=", campaign.name or ""],
	}
	others = frappe.get_all(
		"Campagne Portail",
		filters=filters,
		fields=["name", "title", "valid_from", "valid_upto", "priority"],
	)
	now = now_datetime()
	for other in others:
		if not _periods_overlap(campaign, other):
			continue
		if compute_campaign_status(other, now) not in {STATUS_ACTIVE, STATUS_SCHEDULED}:
			continue
		frappe.msgprint(
			_("La campagne {0} utilise déjà l'emplacement {1} sur une période concurrente.").format(
				other.title or other.name, campaign.placement
			),
			indicator="orange",
			alert=True,
		)
		break


def _periods_overlap(left, right) -> bool:
	left_from = get_datetime(left.get("valid_from")) if left.get("valid_from") else None
	left_to = get_datetime(left.get("valid_upto")) if left.get("valid_upto") else None
	right_from = get_datetime(right.get("valid_from")) if right.get("valid_from") else None
	right_to = get_datetime(right.get("valid_upto")) if right.get("valid_upto") else None
	if left_from and right_to and left_from > right_to:
		return False
	if right_from and left_to and right_from > left_to:
		return False
	return True


def load_campaigns(*, include_unpublished: str | None = None) -> list:
	names = frappe.get_all("Campagne Portail", filters={"enabled": 1, "published": 1}, pluck="name")
	if include_unpublished and include_unpublished not in names and frappe.db.exists("Campagne Portail", include_unpublished):
		names.append(include_unpublished)
	return [frappe.get_doc("Campagne Portail", name) for name in names]


def resolve_campaigns(customer: str, *, now=None, include_unpublished: str | None = None) -> list:
	now = get_datetime(now or now_datetime())
	segments = get_customer_segments(customer)
	resolved = []
	for campaign in load_campaigns(include_unpublished=include_unpublished):
		status = compute_campaign_status(campaign, now)
		if campaign.name == include_unpublished:
			if status == STATUS_DISABLED:
				continue
		elif status != STATUS_ACTIVE:
			continue
		if not campaign_matches_segments(campaign, segments):
			continue
		resolved.append(campaign)
	return sorted(resolved, key=_campaign_sort_key)


def get_store_settings() -> frappe._dict:
	if not frappe.db.exists("DocType", "Parametres Boutique Portail"):
		return frappe._dict(
			fallback_headline="Commandez vos produits",
			fallback_cta_label="Parcourir le catalogue",
			fallback_body="",
			fallback_image=None,
			show_categories=1,
			show_promotions=1,
			show_featured=1,
			rail_limit=RAIL_LIMIT_DEFAULT,
			featured_groups=[],
		)
	try:
		return frappe.get_single("Parametres Boutique Portail")
	except frappe.DoesNotExistError:
		return frappe._dict(
			fallback_headline="Commandez vos produits",
			fallback_cta_label="Parcourir le catalogue",
			fallback_body="",
			fallback_image=None,
			show_categories=1,
			show_promotions=1,
			show_featured=1,
			rail_limit=RAIL_LIMIT_DEFAULT,
			featured_groups=[],
		)


def rail_limit(settings=None) -> int:
	settings = settings or get_store_settings()
	return min(max(cint(settings.get("rail_limit") or RAIL_LIMIT_DEFAULT), 1), 24)


def serialize_cta(campaign) -> dict[str, Any]:
	cta_type = cstr(campaign.get("cta_type") or CTA_CATALOG)
	return {
		"type": {
			CTA_CATALOG: "catalog",
			CTA_GROUP: "group",
			CTA_ITEM: "item",
			CTA_RAIL: "rail",
		}.get(cta_type, "catalog"),
		"itemGroup": campaign.get("cta_item_group"),
		"itemCode": campaign.get("cta_item"),
		"label": campaign.get("cta_label") or "Découvrir",
	}


def serialize_campaign_card(campaign, *, items: list[dict[str, Any]] | None = None) -> dict[str, Any]:
	offer = offer_summary(campaign)
	return {
		"campaign": campaign.name,
		"campaignTitle": campaign.title,
		"placement": campaign.placement,
		"title": campaign.headline or campaign.title,
		"body": campaign.body,
		"image": campaign.image_desktop,
		"imageMobile": campaign.image_mobile or campaign.image_desktop,
		"cta": serialize_cta(campaign),
		"offerLabel": offer.get("label"),
		"offerCondition": offer.get("condition"),
		"items": items or [],
	}


def offer_summary(campaign) -> dict[str, Any]:
	source = cstr(campaign.get("offer_source") or OFFER_NONE)
	if source == OFFER_NONE:
		return {"label": None, "condition": None, "minQty": None, "couponCode": None}
	if source == OFFER_COUPON:
		code = frappe.db.get_value("Coupon Code", campaign.coupon_code, "coupon_code") or campaign.coupon_code
		return {"label": _("Code {0}").format(code), "condition": None, "minQty": None, "couponCode": campaign.coupon_code}
	if source == OFFER_SCHEME:
		title = campaign.promotional_scheme
		return {"label": title, "condition": None, "minQty": None, "couponCode": None}
	rule = frappe.db.get_value(
		"Pricing Rule",
		campaign.pricing_rule,
		[
			"title",
			"rule_description",
			"min_qty",
			"discount_percentage",
			"discount_amount",
			"rate_or_discount",
			"price_or_product_discount",
			"free_item",
			"free_qty",
		],
		as_dict=True,
	)
	if not rule:
		return {"label": campaign.title, "condition": None, "minQty": None, "couponCode": None}
	min_qty = flt(rule.min_qty)
	condition = _("dès {0} unités").format(cint(min_qty)) if min_qty > 1 else None
	if rule.rule_description:
		label = rule.rule_description
	elif rule.price_or_product_discount == "Product":
		label = _("Produit offert")
	elif rule.rate_or_discount == "Discount Percentage":
		label = f"-{flt(rule.discount_percentage):g} %"
	elif rule.rate_or_discount == "Discount Amount":
		label = _("Remise")
	elif rule.rate_or_discount == "Rate":
		label = _("Prix promotionnel")
	else:
		label = rule.title or campaign.title
	return {"label": label, "condition": condition, "minQty": min_qty or None, "couponCode": None}


def _portal():
	from log.api import client_portal

	return client_portal


def serialize_item_row(row, *, currency: str, campaign=None, placement: str | None = None) -> dict[str, Any]:
	show_price = _portal()._shows_store_price(row)
	payload = {
		"itemCode": row.name,
		"itemName": row.item_name or row.name,
		"description": row.description,
		"itemGroup": row.item_group,
		"uom": row.stock_uom,
		"image": row.image,
		"showPrice": show_price,
		"unitPriceTtc": None,
		"catalogPriceTtc": None,
		"effectivePriceTtc": None,
		"savingsTtc": None,
		"offerLabel": None,
		"offerCondition": None,
		"campaign": campaign.name if campaign else None,
		"campaignTitle": campaign.title if campaign else None,
		"placement": placement or (campaign.placement if campaign else None),
		"currency": currency,
	}
	if campaign:
		offer = offer_summary(campaign)
		payload["offerLabel"] = offer.get("label")
		payload["offerCondition"] = offer.get("condition")
	return payload


def fetch_item_rows(item_codes: list[str]) -> dict[str, Any]:
	if not item_codes:
		return {}
	fields = ["name", "item_name", "description", "item_group", "stock_uom", "image"]
	if _portal()._item_has_column(STORE_SHOW_PRICE_FIELD):
		fields.append(STORE_SHOW_PRICE_FIELD)
	rows = frappe.get_all(
		"Item",
		filters={"name": ["in", item_codes], **_portal()._catalog_item_filters()},
		fields=fields,
	)
	return {row.name: row for row in rows}


def fetch_group_items(item_group: str, limit: int) -> list[Any]:
	fields = ["name", "item_name", "description", "item_group", "stock_uom", "image"]
	if _portal()._item_has_column(STORE_SHOW_PRICE_FIELD):
		fields.append(STORE_SHOW_PRICE_FIELD)
	return frappe.get_all(
		"Item",
		filters={**_portal()._catalog_item_filters(), "item_group": item_group},
		fields=fields,
		order_by="item_name asc, name asc",
		limit_page_length=limit,
	)


def apply_prices(products: list[dict[str, Any]], customer: str, portal_user: str) -> list[dict[str, Any]]:
	priced = [item for item in products if item.get("showPrice")]
	codes = [item["itemCode"] for item in priced]
	catalog: dict[str, float] = {}
	effective: dict[str, float] = {}
	if codes:
		rows = fetch_item_rows(codes)
		lines = [{"item_code": code, "qty": 1, "uom": rows[code].stock_uom} for code in codes if code in rows]
		if lines:
			effective = _price_map(customer, portal_user, lines, ignore_pricing_rule=False)
			catalog = _price_map(customer, portal_user, lines, ignore_pricing_rule=True)
	for item in products:
		code = item["itemCode"]
		if not item.get("showPrice"):
			item["unitPriceTtc"] = None
			item["catalogPriceTtc"] = None
			item["effectivePriceTtc"] = None
			item["savingsTtc"] = None
			continue
		catalog_price = catalog.get(code)
		effective_price = effective.get(code, catalog_price)
		item["catalogPriceTtc"] = catalog_price
		item["effectivePriceTtc"] = effective_price
		min_qty = _offer_min_qty(item)
		show_sale = (
			catalog_price is not None
			and effective_price is not None
			and flt(effective_price) + 0.009 < flt(catalog_price)
			and not (min_qty and flt(min_qty) > 1)
		)
		if show_sale:
			item["unitPriceTtc"] = effective_price
			item["savingsTtc"] = flt(catalog_price) - flt(effective_price)
		else:
			item["unitPriceTtc"] = catalog_price if catalog_price is not None else effective_price
			item["savingsTtc"] = None
			if min_qty and flt(min_qty) > 1:
				item["effectivePriceTtc"] = catalog_price
	return products


def _offer_min_qty(item: dict[str, Any]) -> float | None:
	if not item.get("campaign"):
		return None
	rule_name = frappe.db.get_value("Campagne Portail", item["campaign"], "pricing_rule")
	if not rule_name:
		return None
	return flt(frappe.db.get_value("Pricing Rule", rule_name, "min_qty"))


def _price_map(customer: str, portal_user: str, lines: list[dict[str, Any]], *, ignore_pricing_rule: bool) -> dict[str, float]:
	portal = _portal()
	with portal._allow_item_details([line["item_code"] for line in lines]):
		order = portal._new_sales_order(customer, lines, frappe.utils.today(), portal_user=portal_user)
		if ignore_pricing_rule and order.meta.has_field("ignore_pricing_rule"):
			order.ignore_pricing_rule = 1
			order.flags.ignore_pricing_rule = True
			order.set("pricing_rules", [])
			order.calculate_taxes_and_totals()
	preview = portal._preview(order)
	return {row["itemCode"]: flt(row["unitPriceTtc"]) for row in preview["items"]}


def _storefront_cache_key(customer: str) -> str:
	return f"log:portal_storefront:{customer}"


def clear_storefront_cache() -> None:
	frappe.cache().delete_keys("log:portal_storefront:*")


def build_storefront(customer: str, portal_user: str, *, include_unpublished: str | None = None) -> dict[str, Any]:
	cache = frappe.cache()
	cache_key = _storefront_cache_key(customer)
	if not include_unpublished:
		cached = cache.get_value(cache_key)
		if cached:
			return cached
	payload = _build_storefront_payload(customer, portal_user, include_unpublished=include_unpublished)
	if not include_unpublished:
		cache.set_value(cache_key, payload, expires_in_sec=CACHE_TTL_SECONDS)
	return payload


def _build_storefront_payload(customer: str, portal_user: str, *, include_unpublished: str | None = None) -> dict[str, Any]:
	settings = get_store_settings()
	campaigns = resolve_campaigns(customer, include_unpublished=include_unpublished)
	limit = rail_limit(settings)
	portal = _portal()
	currency = portal._currency(portal._customer_data(customer), portal._company())
	heroes = [c for c in campaigns if c.placement == PLACEMENT_HERO]
	banners = [c for c in campaigns if c.placement == PLACEMENT_BANNER]
	rails = [c for c in campaigns if c.placement == PLACEMENT_RAIL]

	hero = serialize_campaign_card(heroes[0]) if heroes else _fallback_hero(settings)
	banner_cards = [serialize_campaign_card(campaign) for campaign in banners]

	rail_payloads = []
	pending_items: list[dict[str, Any]] = []
	if cint(settings.get("show_promotions", 1)):
		for campaign in rails:
			products = _campaign_products(campaign, currency, limit)
			pending_items.extend(products)
			rail_payloads.append(
				{
					**serialize_campaign_card(campaign, items=products),
					"kind": "campaign",
				}
			)
	if cint(settings.get("show_featured", 1)):
		groups = sorted(settings.get("featured_groups") or [], key=lambda row: (cint(row.display_order), cstr(row.item_group)))
		for row in groups:
			items = [
				serialize_item_row(item, currency=currency, placement="featured_group")
				for item in fetch_group_items(row.item_group, limit)
			]
			pending_items.extend(items)
			rail_payloads.append(
				{
					"campaign": None,
					"campaignTitle": None,
					"placement": "featured_group",
					"kind": "group",
					"title": row.item_group,
					"body": None,
					"cta": {"type": "group", "itemGroup": row.item_group, "itemCode": None, "label": _("Voir le groupe")},
					"items": items,
				}
			)

	apply_prices(pending_items, customer, portal_user)
	categories = []
	if cint(settings.get("show_categories", 1)):
		categories = [{"name": name} for name in frappe.get_all("Item Group", filters={"is_group": 0}, pluck="name", order_by="name asc")]

	return {
		"hero": hero,
		"banners": banner_cards,
		"categories": categories,
		"rails": rail_payloads,
		"customerName": frappe.db.get_value("Customer", customer, "customer_name") or customer,
		"computedStatus": compute_campaign_status(frappe.get_doc("Campagne Portail", include_unpublished))
		if include_unpublished
		else None,
	}


def _fallback_hero(settings) -> dict[str, Any]:
	return {
		"campaign": None,
		"campaignTitle": None,
		"placement": PLACEMENT_HERO,
		"title": settings.get("fallback_headline") or _("Commandez vos produits"),
		"body": settings.get("fallback_body"),
		"image": settings.get("fallback_image"),
		"imageMobile": settings.get("fallback_image"),
		"cta": {
			"type": "catalog",
			"itemGroup": None,
			"itemCode": None,
			"label": settings.get("fallback_cta_label") or _("Parcourir le catalogue"),
		},
		"offerLabel": None,
		"offerCondition": None,
		"items": [],
	}


def _campaign_products(campaign, currency: str, limit: int) -> list[dict[str, Any]]:
	ordered = sorted(campaign.get("items") or [], key=lambda row: (cint(row.display_order), cstr(row.item_code)))
	codes = [cstr(row.item_code) for row in ordered if row.item_code][:limit]
	rows = fetch_item_rows(codes)
	products = []
	for code in codes:
		row = rows.get(code)
		if not row:
			continue
		products.append(serialize_item_row(row, currency=currency, campaign=campaign, placement=campaign.placement))
	return products


def serialize_catalog_item(row, customer: str, portal_user: str, currency: str, *, campaigns_by_item: dict[str, Any] | None = None) -> dict[str, Any]:
	campaign = (campaigns_by_item or {}).get(row.name)
	item = serialize_item_row(row, currency=currency, campaign=campaign, placement=campaign.placement if campaign else None)
	apply_prices([item], customer, portal_user)
	return item


def campaigns_by_item(customer: str) -> dict[str, Any]:
	mapping: dict[str, Any] = {}
	for campaign in resolve_campaigns(customer):
		for row in campaign.get("items") or []:
			code = cstr(row.item_code)
			if code and code not in mapping:
				mapping[code] = campaign
	return mapping


def get_product(customer: str, portal_user: str, item_code: str) -> dict[str, Any]:
	item_code = cstr(item_code).strip()
	rows = fetch_item_rows([item_code])
	row = rows.get(item_code)
	if not row:
		frappe.throw(_("Cet article n'est plus disponible à la vente."), frappe.DoesNotExistError)
	portal = _portal()
	currency = portal._currency(portal._customer_data(customer), portal._company())
	campaign = campaigns_by_item(customer).get(item_code)
	item = serialize_item_row(row, currency=currency, campaign=campaign, placement=campaign.placement if campaign else None)
	apply_prices([item], customer, portal_user)
	return item


def sanitize_line_attribution(customer: str, lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
	live = {campaign.name: campaign for campaign in resolve_campaigns(customer)}
	cleaned = []
	for line in lines:
		campaign_name = cstr(line.get("campaign") or "").strip() or None
		placement = cstr(line.get("placement") or "").strip() or None
		campaign = live.get(campaign_name) if campaign_name else None
		if campaign_name and not campaign:
			campaign_name = None
			placement = None
		elif campaign:
			item_codes = {cstr(row.item_code) for row in campaign.get("items") or []}
			if item_codes and line.get("item_code") not in item_codes and line.get("itemCode") not in item_codes:
				# Attribution last-touch remains valid for display even if the item is only
				# linked via a pricing rule covering a group. Keep campaign if live.
				placement = placement or campaign.placement
			else:
				placement = placement or campaign.placement
		cleaned.append({**line, "campaign": campaign.name if campaign else campaign_name, "placement": placement})
	return cleaned


def apply_order_attribution(order, lines: list[dict[str, Any]]) -> None:
	attributed = [line for line in lines if line.get("campaign")]
	header_campaign = attributed[-1]["campaign"] if attributed else None
	if order.meta.has_field("custom_campagne_portail"):
		order.custom_campagne_portail = header_campaign
	by_item = {cstr(line.get("item_code") or line.get("itemCode")): line for line in lines}
	for row in getattr(order, "items", None) or []:
		meta = by_item.get(row.item_code) or {}
		if row.meta.has_field("custom_campagne_portail"):
			row.custom_campagne_portail = meta.get("campaign")
		if row.meta.has_field("custom_placement_portail"):
			row.custom_placement_portail = meta.get("placement")


def coupon_from_lines(customer: str, lines: list[dict[str, Any]]) -> str | None:
	live = {campaign.name: campaign for campaign in resolve_campaigns(customer)}
	for line in reversed(lines):
		campaign = live.get(cstr(line.get("campaign")))
		if campaign and cstr(campaign.offer_source) == OFFER_COUPON and campaign.coupon_code:
			return campaign.coupon_code
	return None
