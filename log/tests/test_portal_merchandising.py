import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import frappe
from frappe.utils import get_datetime

from log.services import portal_merchandising as merchandising
from log.services import portal_promotion_events as events


def _campaign(**values):
	defaults = {
		"name": "CAMP-1",
		"title": "Promo",
		"enabled": 1,
		"published": 1,
		"placement": merchandising.PLACEMENT_RAIL,
		"priority": 10,
		"valid_from": None,
		"valid_upto": None,
		"targets": [],
		"items": [],
		"offer_source": merchandising.OFFER_NONE,
		"pricing_rule": None,
		"promotional_scheme": None,
		"coupon_code": None,
	}
	defaults.update(values)
	return frappe._dict(defaults)


class TestPortalMerchandising(unittest.TestCase):
	def test_untargeted_campaign_matches_all_customers(self):
		self.assertTrue(
			merchandising.campaign_matches_segments(
				_campaign(),
				{
					merchandising.TARGET_CUSTOMER_GROUP: "Grossistes",
					merchandising.TARGET_WILAYA: "Alger",
					merchandising.TARGET_PRICE_LIST: "Standard",
				},
			)
		)

	def test_targets_combine_and_within_dimension_or(self):
		campaign = _campaign(
			targets=[
				frappe._dict(target_type="Customer Group", target_value="Grossistes"),
				frappe._dict(target_type="Customer Group", target_value="Détaillants"),
				frappe._dict(target_type="Wilaya", target_value="Alger"),
			]
		)
		self.assertTrue(
			merchandising.campaign_matches_segments(
				campaign,
				{
					"Customer Group": "Détaillants",
					"Wilaya": "Alger",
					"Price List": None,
				},
			)
		)
		self.assertFalse(
			merchandising.campaign_matches_segments(
				campaign,
				{
					"Customer Group": "Grossistes",
					"Wilaya": "Oran",
					"Price List": None,
				},
			)
		)

	def test_campaign_status_uses_schedule_bounds(self):
		now = get_datetime("2026-08-28 12:00:00")
		self.assertEqual(
			merchandising.compute_campaign_status(_campaign(enabled=0, published=1), now),
			merchandising.STATUS_DISABLED,
		)
		self.assertEqual(
			merchandising.compute_campaign_status(_campaign(published=0), now),
			merchandising.STATUS_DRAFT,
		)
		self.assertEqual(
			merchandising.compute_campaign_status(
				_campaign(valid_from="2026-08-29 00:00:00"), now
			),
			merchandising.STATUS_SCHEDULED,
		)
		self.assertEqual(
			merchandising.compute_campaign_status(
				_campaign(valid_upto="2026-08-27 23:59:59"), now
			),
			merchandising.STATUS_EXPIRED,
		)
		self.assertEqual(merchandising.compute_campaign_status(_campaign(), now), merchandising.STATUS_ACTIVE)

	def test_resolve_orders_by_priority_then_title(self):
		items = [frappe._dict(item_code="ART-1", display_order=0)]
		low = _campaign(name="CAMP-LOW", title="Beta", priority=1, items=items)
		high = _campaign(name="CAMP-HIGH", title="Alpha", priority=20, items=items)
		visible = {"ART-1": frappe._dict(name="ART-1", item_group="Nutrition")}
		with patch.object(merchandising, "get_customer_segments", return_value={}), patch.object(
			merchandising, "load_campaigns", return_value=[low, high]
		), patch.object(merchandising, "fetch_item_rows", return_value=visible):
			resolved = merchandising.resolve_campaigns("CUST-1", now="2026-08-28 12:00:00")
		self.assertEqual([row.name for row in resolved], ["CAMP-HIGH", "CAMP-LOW"])

	def test_resolve_orders_by_valid_from_when_priority_ties(self):
		items = [frappe._dict(item_code="ART-1", display_order=0)]
		older = _campaign(name="CAMP-OLD", priority=10, valid_from="2026-01-01", items=items)
		newer = _campaign(name="CAMP-NEW", priority=10, valid_from="2026-08-01", items=items)
		visible = {"ART-1": frappe._dict(name="ART-1", item_group="Nutrition")}
		with patch.object(merchandising, "get_customer_segments", return_value={}), patch.object(
			merchandising, "load_campaigns", return_value=[older, newer]
		), patch.object(merchandising, "fetch_item_rows", return_value=visible):
			resolved = merchandising.resolve_campaigns("CUST-1", now="2026-08-28 12:00:00")
		self.assertEqual([row.name for row in resolved], ["CAMP-NEW", "CAMP-OLD"])

	def test_campaign_without_visible_items_is_not_resolved(self):
		campaign = _campaign(items=[frappe._dict(item_code="ART-HIDDEN", display_order=0)])
		with patch.object(merchandising, "get_customer_segments", return_value={}), patch.object(
			merchandising, "load_campaigns", return_value=[campaign]
		), patch.object(merchandising, "fetch_item_rows", return_value={}):
			self.assertEqual(merchandising.resolve_campaigns("CUST-1", now="2026-08-28 12:00:00"), [])

	def test_expired_campaign_is_not_resolved(self):
		expired = _campaign(valid_upto="2026-08-01 00:00:00")
		with patch.object(merchandising, "get_customer_segments", return_value={}), patch.object(
			merchandising, "load_campaigns", return_value=[expired]
		):
			self.assertEqual(merchandising.resolve_campaigns("CUST-1", now="2026-08-28 12:00:00"), [])

	def test_hidden_price_is_never_zero(self):
		item = {
			"itemCode": "ART-1",
			"showPrice": False,
			"unitPriceTtc": 99,
			"catalogPriceTtc": 99,
			"effectivePriceTtc": 99,
		}
		with patch.object(merchandising, "_price_map") as priced:
			merchandising.apply_prices([item], "CUST-1", "client@example.com")
		priced.assert_not_called()
		self.assertIsNone(item["unitPriceTtc"])
		self.assertIsNone(item["catalogPriceTtc"])
		self.assertIsNone(item["savingsTtc"])

	def test_quantity_tier_is_announced_without_fake_sale_price(self):
		item = {"itemCode": "ART-1", "showPrice": True, "campaign": "CAMP-1"}
		with patch.object(
			merchandising,
			"_price_map",
			side_effect=lambda *_args, ignore_pricing_rule, **_kwargs: {"ART-1": 80.0 if not ignore_pricing_rule else 100.0},
		), patch.object(merchandising, "fetch_item_rows", return_value={"ART-1": frappe._dict(stock_uom="Unité")}), patch.object(
			merchandising, "_offer_min_qty", return_value=5
		):
			merchandising.apply_prices([item], "CUST-1", "client@example.com")
		self.assertEqual(item["unitPriceTtc"], 100.0)
		self.assertIsNone(item["savingsTtc"])

	def test_qty_one_discount_exposes_sale_price(self):
		item = {"itemCode": "ART-1", "showPrice": True, "campaign": "CAMP-1"}
		with patch.object(
			merchandising,
			"_price_map",
			side_effect=lambda *_args, ignore_pricing_rule, **_kwargs: {"ART-1": 80.0 if not ignore_pricing_rule else 100.0},
		), patch.object(merchandising, "fetch_item_rows", return_value={"ART-1": frappe._dict(stock_uom="Unité")}), patch.object(
			merchandising, "_offer_min_qty", return_value=1
		):
			merchandising.apply_prices([item], "CUST-1", "client@example.com")
		self.assertEqual(item["unitPriceTtc"], 80.0)
		self.assertEqual(item["savingsTtc"], 20.0)

	def test_forged_attribution_is_dropped_when_campaign_is_not_live(self):
		with patch.object(merchandising, "resolve_campaigns", return_value=[]):
			cleaned = merchandising.sanitize_line_attribution(
				"CUST-1",
				[{"item_code": "ART-1", "qty": 1, "campaign": "CAMP-FAKE", "placement": "Bandeau"}],
			)
		self.assertIsNone(cleaned[0]["campaign"])
		self.assertIsNone(cleaned[0]["placement"])

	def test_live_campaign_attribution_is_kept(self):
		live = _campaign(name="CAMP-1", items=[frappe._dict(item_code="ART-1")])
		with patch.object(merchandising, "resolve_campaigns", return_value=[live]):
			cleaned = merchandising.sanitize_line_attribution(
				"CUST-1",
				[{"item_code": "ART-1", "qty": 1, "campaign": "CAMP-1", "placement": "Bandeau"}],
			)
		self.assertEqual(cleaned[0]["campaign"], "CAMP-1")
		self.assertEqual(cleaned[0]["placement"], "Bandeau")

	def test_legacy_hero_and_rail_cta_are_normalized(self):
		self.assertEqual(merchandising._normalize_placement("Hero"), merchandising.PLACEMENT_BANNER)
		self.assertEqual(merchandising._normalize_cta_type("Rayon"), merchandising.CTA_CATALOG)
		card = merchandising.serialize_campaign_card(_campaign(placement="Hero", cta_type="Rayon", cta_label="Voir"))
		self.assertEqual(card["placement"], merchandising.PLACEMENT_BANNER)
		self.assertEqual(card["cta"]["type"], "catalog")
		self.assertNotIn("image", card)
		self.assertNotIn("imageMobile", card)

	def test_order_attribution_never_changes_item_qty_or_rate(self):
		row = SimpleNamespace(item_code="ART-1", qty=2, rate=100, meta=SimpleNamespace(has_field=lambda _name: True))
		order = SimpleNamespace(meta=SimpleNamespace(has_field=lambda _name: True), items=[row])
		merchandising.apply_order_attribution(
			order,
			[{"item_code": "ART-1", "qty": 2, "campaign": "CAMP-1", "placement": "Rayon produits"}],
		)
		self.assertEqual(order.custom_campagne_portail, "CAMP-1")
		self.assertEqual(row.custom_campagne_portail, "CAMP-1")
		self.assertEqual(row.custom_placement_portail, "Rayon produits")
		self.assertEqual(row.qty, 2)
		self.assertEqual(row.rate, 100)

	def test_last_touch_coupon_is_selected(self):
		first = _campaign(name="CAMP-1", offer_source=merchandising.OFFER_COUPON, coupon_code="OLD")
		second = _campaign(name="CAMP-2", offer_source=merchandising.OFFER_COUPON, coupon_code="NEW")
		with patch.object(merchandising, "resolve_campaigns", return_value=[first, second]):
			code = merchandising.coupon_from_lines(
				"CUST-1",
				[
					{"item_code": "ART-1", "campaign": "CAMP-1"},
					{"item_code": "ART-2", "campaign": "CAMP-2"},
				],
			)
		self.assertEqual(code, "NEW")

	def test_untargeted_campaign_warns_when_pricing_rule_is_not_root(self):
		rule = frappe._dict(applicable_for="Customer Group", customer_group="All Customer Groups", for_price_list=None)
		with patch.object(merchandising, "_is_tree_root", return_value=False), patch.object(
			merchandising.frappe, "msgprint"
		) as warn:
			merchandising._warn_if_rule_narrower(_campaign(), rule, {})
		warn.assert_called_once()
		self.assertIn("All Customer Groups", warn.call_args.args[0])

	def test_legacy_territory_target_matches_wilaya_segment(self):
		campaign = _campaign(
			targets=[frappe._dict(target_type="Territory", target_value="Alger")],
		)
		self.assertTrue(
			merchandising.campaign_matches_segments(
				campaign,
				{merchandising.TARGET_WILAYA: "Alger"},
			)
		)

	def test_customer_segments_read_custom_wilaya(self):
		with patch.object(merchandising.frappe.db, "has_column", return_value=True), patch.object(
			merchandising.frappe.db,
			"get_value",
			return_value=frappe._dict(
				customer_group="Grossistes",
				custom_wilaya="Alger",
				default_price_list="Standard",
			),
		):
			segments = merchandising.get_customer_segments("CUST-1")
		self.assertEqual(segments[merchandising.TARGET_WILAYA], "Alger")
		self.assertEqual(segments[merchandising.TARGET_CUSTOMER_GROUP], "Grossistes")
		self.assertNotIn("Territory", segments)

	def test_unknown_or_empty_target_hides_campaign(self):
		segments = {merchandising.TARGET_WILAYA: "Oran"}
		self.assertFalse(
			merchandising.campaign_matches_segments(
				_campaign(targets=[frappe._dict(target_type="Unknown", target_value="Oran")]),
				segments,
			)
		)
		self.assertFalse(
			merchandising.campaign_matches_segments(
				_campaign(targets=[frappe._dict(target_type="Wilaya", target_value="")]),
				segments,
			)
		)

	def test_offer_summary_uses_pricing_rule_values(self):
		campaign = _campaign(offer_source=merchandising.OFFER_PRICING_RULE, pricing_rule="PRLE-1")
		rule = frappe._dict(
			min_qty=0,
			discount_percentage=10,
			discount_amount=0,
			rate_or_discount="Discount Percentage",
			price_or_product_discount="Price",
			currency="DZD",
		)
		with patch.object(merchandising.frappe.db, "get_value", return_value=rule):
			offer = merchandising.offer_summary(campaign, currency="DZD")
		self.assertEqual(offer["type"], "percentage")
		self.assertEqual(offer["percentage"], 10)
		self.assertEqual(offer["label"], "-10 %")

	def test_offer_summary_hides_unreliable_percentage(self):
		campaign = _campaign(offer_source=merchandising.OFFER_PRICING_RULE, pricing_rule="PRLE-1")
		rule = frappe._dict(
			min_qty=0,
			discount_percentage=0,
			discount_amount=0,
			rate_or_discount="Discount Percentage",
			price_or_product_discount="Price",
			currency="DZD",
		)
		with patch.object(merchandising.frappe.db, "get_value", return_value=rule):
			offer = merchandising.offer_summary(campaign)
		self.assertIsNone(offer["label"])
		self.assertIsNone(offer["type"])

	def test_serialize_campaign_card_exposes_groups_and_validity(self):
		campaign = _campaign(
			placement="Bandeau",
			headline="Promotion Biomil",
			valid_upto="2026-09-01 23:59:59",
			items=[frappe._dict(item_code="ART-1", display_order=0), frappe._dict(item_code="ART-2", display_order=1)],
		)
		campaign._visible_item_codes = ["ART-1", "ART-2"]
		campaign._visible_rows = {
			"ART-1": frappe._dict(item_group="Nutrition"),
			"ART-2": frappe._dict(item_group="Nutrition"),
		}
		card = merchandising.serialize_campaign_card(campaign, items=[], currency="DZD")
		self.assertEqual(card["placement"], merchandising.PLACEMENT_BANNER)
		self.assertEqual(card["itemCodes"], ["ART-1", "ART-2"])
		self.assertEqual(card["itemGroups"], ["Nutrition"])
		self.assertTrue(card["validUpto"].startswith("2026-09-01"))
		self.assertIn("offer", card)


class TestPortalPromotionEvents(unittest.TestCase):
	def test_duplicate_impression_is_deduplicated(self):
		with patch.object(events.frappe.db, "exists", side_effect=[True, True]):
			result = events.log_event(
				customer="CUST-1",
				event_type="view_promotion",
				campaign="CAMP-1",
				placement="Hero",
			)
		self.assertEqual(result, {"recorded": False, "duplicate": True})

	def test_invalid_event_type_is_rejected(self):
		def _raise(message, exc=frappe.ValidationError, **_kwargs):
			raise exc(message)

		with patch.object(events, "_", lambda value: value), patch.object(
			events.frappe, "throw", side_effect=_raise
		), self.assertRaises(frappe.ValidationError):
			events.log_event(customer="CUST-1", event_type="hack", campaign="CAMP-1")


if __name__ == "__main__":
	unittest.main()
