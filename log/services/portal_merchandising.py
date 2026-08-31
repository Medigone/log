"""Merchandising du portail client : campagnes Desk, ciblage et vitrine."""

from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, fmt_money, get_datetime, now_datetime

STORE_VISIBLE_FIELD = "custom_afficher_dans_store"
STORE_SHOW_PRICE_FIELD = "custom_afficher_prix_store"

PLACEMENT_BANNER = "Bandeau"
PLACEMENT_RAIL = "Rayon produits"
PLACEMENTS = (PLACEMENT_BANNER, PLACEMENT_RAIL)
LEGACY_PLACEMENT_HERO = "Hero"

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
LEGACY_CTA_RAIL = "Rayon"

CACHE_TTL_SECONDS = 60
RAIL_LIMIT_DEFAULT = 8
EVENT_RETENTION_DAYS = 90
BANNER_PREVIEW_ITEMS = 2
BANNER_CAROUSEL_LIMIT = 3
EXPIRING_SOON_HOURS = 72

TARGET_CUSTOMER_GROUP = "Customer Group"
TARGET_WILAYA = "Wilaya"
TARGET_PRICE_LIST = "Price List"
LEGACY_TARGET_TERRITORY = "Territory"
VALID_TARGET_TYPES = {TARGET_CUSTOMER_GROUP, TARGET_WILAYA, TARGET_PRICE_LIST}


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


def _normalize_target_type(target_type: str) -> str:
	value = cstr(target_type).strip()
	if value == LEGACY_TARGET_TERRITORY:
		return TARGET_WILAYA
	return value


def get_customer_segments(customer: str) -> dict[str, str | None]:
	fields = ["customer_group", "default_price_list"]
	if frappe.db.has_column("Customer", "custom_wilaya"):
		fields.append("custom_wilaya")
	row = frappe.db.get_value("Customer", customer, fields, as_dict=True) or {}
	return {
		TARGET_CUSTOMER_GROUP: row.get("customer_group"),
		TARGET_WILAYA: row.get("custom_wilaya"),
		TARGET_PRICE_LIST: row.get("default_price_list"),
	}


def campaign_matches_segments(campaign, segments: dict[str, str | None]) -> bool:
	grouped: dict[str, set[str]] = defaultdict(set)
	for row in campaign.get("targets") or []:
		target_type = _normalize_target_type(row.get("target_type"))
		target_value = cstr(row.get("target_value")).strip()
		if not target_type and not target_value:
			continue
		if target_type not in VALID_TARGET_TYPES or not target_value:
			return False
		grouped[target_type].add(target_value)
	if not grouped:
		return True
	for dimension, allowed in grouped.items():
		current = cstr(segments.get(dimension) or "").strip()
		if current not in allowed:
			return False
	return True


def _campaign_sort_key(campaign) -> tuple:
	valid_from = get_datetime(campaign.get("valid_from")) if campaign.get("valid_from") else None
	return (
		-cint(campaign.get("priority") or 0),
		-(valid_from.timestamp() if valid_from else 0),
		cstr(campaign.get("name") or ""),
	)


def validate_campaign(campaign) -> None:
	campaign.computed_status = compute_campaign_status(campaign)
	campaign.placement = _normalize_placement(campaign.placement)
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


def _normalize_placement(placement: str) -> str:
	value = cstr(placement).strip()
	if value == LEGACY_PLACEMENT_HERO:
		return PLACEMENT_BANNER
	return value


def _normalize_cta_type(cta_type: str) -> str:
	value = cstr(cta_type).strip() or CTA_CATALOG
	if value == LEGACY_CTA_RAIL:
		return CTA_CATALOG
	return value


def _validate_cta(campaign) -> None:
	campaign.cta_type = _normalize_cta_type(campaign.cta_type)
	cta_type = campaign.cta_type
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
	applicable = cstr(rule.get("applicable_for"))
	if applicable == TARGET_CUSTOMER_GROUP:
		value = rule.get("customer_group")
		campaign_values = campaign_targets.get(TARGET_CUSTOMER_GROUP) or set()
		if value:
			if campaign_values and value not in campaign_values:
				frappe.msgprint(
					_("Le ciblage de la règle de prix ({0}) est plus étroit que celui de la campagne.").format(value),
					indicator="orange",
					alert=True,
				)
			elif not campaign_values and not _is_tree_root(TARGET_CUSTOMER_GROUP, value):
				_warn_rule_narrower_than_untargeted_campaign(value)
	elif applicable == LEGACY_TARGET_TERRITORY:
		value = cstr(rule.get("territory"))
		campaign_values = campaign_targets.get(TARGET_WILAYA) or set()
		if value:
			if campaign_values and not _territory_overlaps_wilayas(value, campaign_values):
				frappe.msgprint(
					_("Le ciblage de la règle de prix ({0}) est plus étroit que celui de la campagne.").format(value),
					indicator="orange",
					alert=True,
				)
			elif not campaign_values and not _is_tree_root(LEGACY_TARGET_TERRITORY, value):
				_warn_rule_narrower_than_untargeted_campaign(value)
	price_list = cstr(rule.get("for_price_list"))
	if price_list and campaign_targets.get(TARGET_PRICE_LIST) and price_list not in campaign_targets[TARGET_PRICE_LIST]:
		frappe.msgprint(
			_("La liste de prix de la règle ne correspond pas au ciblage de la campagne."),
			indicator="orange",
			alert=True,
		)


def _warn_rule_narrower_than_untargeted_campaign(value: str) -> None:
	frappe.msgprint(
		_(
			"La campagne s'applique à tous les clients, mais la règle de prix ne cible que {0}. "
			"Les clients hors de ce groupe ne bénéficieront pas de la remise. "
			"Pour une offre générale, choisissez le groupe racine ou videz le champ « Applicable For » de la règle."
		).format(value),
		indicator="orange",
		alert=True,
	)


def _territory_overlaps_wilayas(territory: str, wilayas: set[str]) -> bool:
	if territory in wilayas:
		return True
	for wilaya in wilayas:
		region = cstr(frappe.db.get_value("Wilaya", wilaya, "region") or "")
		if region and region == territory:
			return True
	return False


def _is_tree_root(doctype: str, name: str) -> bool:
	parent_field = {
		TARGET_CUSTOMER_GROUP: "parent_customer_group",
		LEGACY_TARGET_TERRITORY: "parent_territory",
	}.get(doctype)
	if not parent_field or not frappe.db.exists(doctype, name):
		return False
	return not cstr(frappe.db.get_value(doctype, name, parent_field))


def _target_values_by_type(campaign) -> dict[str, set[str]]:
	grouped: dict[str, set[str]] = defaultdict(set)
	for row in campaign.get("targets") or []:
		if row.get("target_type") and row.get("target_value"):
			grouped[_normalize_target_type(row.target_type)].add(cstr(row.target_value))
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
	valid = {TARGET_CUSTOMER_GROUP, TARGET_WILAYA, TARGET_PRICE_LIST}
	for row in campaign.get("targets") or []:
		row.target_type = _normalize_target_type(row.target_type)
		if cstr(row.target_type) not in valid:
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
	candidates = []
	for campaign in load_campaigns(include_unpublished=include_unpublished):
		status = compute_campaign_status(campaign, now)
		if campaign.name == include_unpublished:
			if status == STATUS_DISABLED:
				continue
		elif status != STATUS_ACTIVE:
			continue
		if not campaign_matches_segments(campaign, segments):
			continue
		candidates.append(campaign)
	all_codes: list[str] = []
	for campaign in candidates:
		all_codes.extend(campaign_item_codes(campaign))
	visible_rows = fetch_item_rows(list(dict.fromkeys(all_codes)))
	resolved = []
	for campaign in candidates:
		codes = campaign_visible_item_codes(campaign, visible_rows)
		if not codes:
			continue
		campaign._visible_item_codes = codes
		campaign._visible_rows = {code: visible_rows[code] for code in codes}
		resolved.append(campaign)
	return sorted(resolved, key=_campaign_sort_key)


def get_live_campaign(customer: str, campaign_name: str, *, now=None):
	name = cstr(campaign_name).strip()
	if not name:
		return None
	for campaign in resolve_campaigns(customer, now=now):
		if campaign.name == name:
			return campaign
	return None


def campaign_item_codes(campaign) -> list[str]:
	ordered = sorted(
		campaign.get("items") or [],
		key=lambda row: (cint(row.get("display_order")), cstr(row.get("item_code"))),
	)
	return [cstr(row.item_code).strip() for row in ordered if cstr(row.get("item_code")).strip()]


def campaign_visible_item_codes(campaign, visible_rows: dict | None = None) -> list[str]:
	codes = list(getattr(campaign, "_visible_item_codes", None) or campaign_item_codes(campaign))
	if not codes:
		return []
	rows = visible_rows if visible_rows is not None else getattr(campaign, "_visible_rows", None)
	if rows is None:
		rows = fetch_item_rows(codes)
	return [code for code in codes if code in rows]


def campaign_item_groups(campaign, visible_rows: dict | None = None) -> list[str]:
	rows = visible_rows if visible_rows is not None else getattr(campaign, "_visible_rows", None)
	codes = campaign_visible_item_codes(campaign, rows)
	if rows is None:
		rows = fetch_item_rows(codes)
	groups: list[str] = []
	seen: set[str] = set()
	for code in codes:
		row = rows.get(code) if rows else None
		if not row:
			continue
		group = cstr(row.get("item_group") or "")
		if group and group not in seen:
			seen.add(group)
			groups.append(group)
	return groups


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
	cta_type = _normalize_cta_type(campaign.get("cta_type"))
	return {
		"type": {
			CTA_CATALOG: "catalog",
			CTA_GROUP: "group",
			CTA_ITEM: "item",
		}.get(cta_type, "catalog"),
		"itemGroup": campaign.get("cta_item_group"),
		"itemCode": campaign.get("cta_item"),
		"label": campaign.get("cta_label") or "Découvrir",
	}


def serialize_campaign_card(campaign, *, items: list[dict[str, Any]] | None = None, currency: str | None = None) -> dict[str, Any]:
	offer = offer_summary(campaign, currency=currency)
	visible_codes = campaign_visible_item_codes(campaign)
	preview = (items or [])[:BANNER_PREVIEW_ITEMS]
	item_groups = campaign_item_groups(campaign)
	valid_upto = campaign.get("valid_upto")
	valid_from = campaign.get("valid_from")
	now = now_datetime()
	return {
		"campaign": campaign.name,
		"campaignTitle": campaign.title,
		"placement": _normalize_placement(campaign.placement),
		"priority": cint(campaign.get("priority") or 0),
		"title": campaign.headline or campaign.title,
		"body": campaign.body,
		"cta": serialize_cta(campaign),
		"offer": offer,
		"offerLabel": offer.get("label"),
		"offerCondition": offer.get("condition"),
		"validFrom": get_datetime(valid_from).isoformat() if valid_from else None,
		"validUpto": get_datetime(valid_upto).isoformat() if valid_upto else None,
		"expiringSoon": _is_expiring_soon(valid_upto, now),
		"itemCodes": visible_codes,
		"itemGroups": item_groups,
		"items": preview,
		"kind": "campaign",
	}


def _is_expiring_soon(valid_upto, now=None) -> bool:
	if not valid_upto:
		return False
	now = get_datetime(now or now_datetime())
	upto = get_datetime(valid_upto)
	return now <= upto <= now + timedelta(hours=EXPIRING_SOON_HOURS)


def _empty_offer() -> dict[str, Any]:
	return {
		"type": None,
		"percentage": None,
		"amount": None,
		"label": None,
		"currency": None,
		"condition": None,
		"minQty": None,
		"couponCode": None,
	}


def offer_summary(campaign, *, currency: str | None = None) -> dict[str, Any]:
	source = cstr(campaign.get("offer_source") or OFFER_NONE)
	empty = _empty_offer()
	if source == OFFER_NONE:
		return empty
	if source == OFFER_COUPON:
		code = frappe.db.get_value("Coupon Code", campaign.coupon_code, "coupon_code") or campaign.coupon_code
		return {
			**empty,
			"type": "coupon",
			"label": _("Code {0}").format(code) if code else None,
			"couponCode": campaign.coupon_code,
		}
	if source == OFFER_SCHEME:
		return empty
	rule = frappe.db.get_value(
		"Pricing Rule",
		campaign.pricing_rule,
		[
			"title",
			"min_qty",
			"discount_percentage",
			"discount_amount",
			"rate_or_discount",
			"price_or_product_discount",
			"currency",
		],
		as_dict=True,
	)
	if not rule:
		return empty
	min_qty = flt(rule.min_qty)
	condition = _("dès {0} unités").format(cint(min_qty)) if min_qty > 1 else None
	rule_currency = cstr(rule.get("currency") or currency or "")
	if rule.price_or_product_discount == "Product":
		return {**empty, "type": "product", "label": _("Offre spéciale"), "condition": condition, "minQty": min_qty or None}
	if rule.rate_or_discount == "Discount Percentage":
		pct = flt(rule.discount_percentage)
		if pct <= 0:
			return {**empty, "condition": condition, "minQty": min_qty or None}
		return {
			**empty,
			"type": "percentage",
			"percentage": pct,
			"label": f"-{pct:g} %",
			"condition": condition,
			"minQty": min_qty or None,
		}
	if rule.rate_or_discount == "Discount Amount":
		amount = flt(rule.discount_amount)
		if amount <= 0:
			return {**empty, "condition": condition, "minQty": min_qty or None}
		money = fmt_money(amount, currency=rule_currency) if rule_currency else f"{amount:g}"
		return {
			**empty,
			"type": "amount",
			"amount": amount,
			"currency": rule_currency or None,
			"label": _("{0} de remise").format(money),
			"condition": condition,
			"minQty": min_qty or None,
		}
	if rule.rate_or_discount == "Rate":
		return {
			**empty,
			"type": "rate",
			"label": _("Prix promotionnel"),
			"condition": condition,
			"minQty": min_qty or None,
		}
	return {**empty, "condition": condition, "minQty": min_qty or None}


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
		"placement": _normalize_placement(placement or (campaign.placement if campaign else "") ) or None,
		"currency": currency,
	}
	if campaign:
		offer = offer_summary(campaign, currency=currency)
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
	campaigns = resolve_campaigns(customer, include_unpublished=include_unpublished) if cint(settings.get("show_promotions", 1)) else []
	portal = _portal()
	currency = portal._currency(portal._customer_data(customer), portal._company())
	serialized: list[dict[str, Any]] = []
	pending_items: list[dict[str, Any]] = []
	for campaign in campaigns:
		products = _campaign_products(campaign, currency, BANNER_PREVIEW_ITEMS)
		pending_items.extend(products)
		serialized.append(serialize_campaign_card(campaign, items=products, currency=currency))
	apply_prices(pending_items, customer, portal_user)
	banners = [row for row in serialized if row["placement"] == PLACEMENT_BANNER][:BANNER_CAROUSEL_LIMIT]
	rails = [row for row in serialized if row["placement"] == PLACEMENT_RAIL]
	categories = []
	if cint(settings.get("show_categories", 1)):
		categories = [{"name": name} for name in frappe.get_all("Item Group", filters={"is_group": 0}, pluck="name", order_by="name asc")]

	return {
		"campaigns": serialized,
		"banners": banners,
		"categories": categories,
		"rails": rails,
		"customerName": frappe.db.get_value("Customer", customer, "customer_name") or customer,
		"computedStatus": compute_campaign_status(frappe.get_doc("Campagne Portail", include_unpublished))
		if include_unpublished
		else None,
	}


def _campaign_products(campaign, currency: str, limit: int) -> list[dict[str, Any]]:
	codes = campaign_visible_item_codes(campaign)[:limit]
	rows = getattr(campaign, "_visible_rows", None) or fetch_item_rows(codes)
	products = []
	for code in codes:
		row = rows.get(code)
		if not row:
			continue
		products.append(
			serialize_item_row(
				row,
				currency=currency,
				campaign=campaign,
				placement=_normalize_placement(campaign.placement),
			)
		)
	return products


def serialize_catalog_item(row, customer: str, portal_user: str, currency: str, *, campaigns_by_item: dict[str, Any] | None = None) -> dict[str, Any]:
	campaign = (campaigns_by_item or {}).get(row.name)
	item = serialize_item_row(row, currency=currency, campaign=campaign, placement=campaign.placement if campaign else None)
	apply_prices([item], customer, portal_user)
	return item


def campaigns_by_item(customer: str, campaigns: list | None = None) -> dict[str, Any]:
	mapping: dict[str, Any] = {}
	for campaign in campaigns if campaigns is not None else resolve_campaigns(customer):
		for code in campaign_visible_item_codes(campaign):
			if code not in mapping:
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
		placement = _normalize_placement(cstr(line.get("placement") or "").strip()) or None
		campaign = live.get(campaign_name) if campaign_name else None
		if campaign_name and not campaign:
			campaign_name = None
			placement = None
		elif campaign:
			item_codes = {cstr(row.item_code) for row in campaign.get("items") or []}
			if item_codes and line.get("item_code") not in item_codes and line.get("itemCode") not in item_codes:
				# Attribution last-touch remains valid for display even if the item is only
				# linked via a pricing rule covering a group. Keep campaign if live.
				placement = placement or _normalize_placement(campaign.placement)
			else:
				placement = placement or _normalize_placement(campaign.placement)
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
