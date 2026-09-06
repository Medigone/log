import unittest
from types import SimpleNamespace
from unittest.mock import patch

from log.api import distribution
from log.services.geocoding import GeocodingError
from log.services.routing import RoutingConfigurationError


def _stop(**kwargs):
	data = {
		"customerName": "Client Test",
		"deliveryNote": "DN-1",
		"requiresCustomerGeolocation": True,
		"customerGpsStatus": "missing",
		"latitude": None,
		"longitude": None,
		"geolocationSource": None,
		"communeId": "COM-1",
		"commune": "Oran",
	}
	data.update(kwargs)
	return data


class TestGpsCollectionWarning(unittest.TestCase):
	def test_keeps_alert_without_blocking_routing(self):
		with patch.object(distribution, "_", side_effect=lambda message: message):
			warning = distribution._gps_collection_warning([_stop()])
		self.assertIn("1 client(s) sans GPS", warning)
		self.assertIn("centre de la commune", warning)
		self.assertNotIn("indisponibles", warning)

	def test_no_warning_when_every_customer_has_gps(self):
		self.assertIsNone(
			distribution._gps_collection_warning(
				[_stop(requiresCustomerGeolocation=False, customerGpsStatus="known")]
			)
		)


class TestApplyCommuneCoordinates(unittest.TestCase):
	def test_keeps_customer_gps_and_alert_flag(self):
		stop = _stop(
			latitude=35.7,
			longitude=-0.6,
			geolocationSource="customer",
			requiresCustomerGeolocation=False,
		)
		with patch.object(distribution, "get_commune_coordinates") as geocode:
			result = distribution._apply_commune_coordinates(stop, geocode_if_missing=True)
		self.assertEqual(result["geolocationSource"], "customer")
		self.assertEqual(result["latitude"], 35.7)
		geocode.assert_not_called()

	def test_fills_commune_cache_without_geocoding_on_serialize(self):
		with patch.object(
			distribution,
			"get_commune_coordinates",
			return_value={"latitude": 35.697, "longitude": -0.633, "source": "cache"},
		) as geocode:
			result = distribution._apply_commune_coordinates(_stop(), geocode_if_missing=False)
		self.assertEqual(result["geolocationSource"], "commune")
		self.assertEqual(result["latitude"], 35.697)
		self.assertTrue(result["requiresCustomerGeolocation"])
		geocode.assert_called_once_with("COM-1", geocode_if_missing=False)

	def test_geocoding_error_is_swallowed_when_not_routing(self):
		with patch.object(distribution, "get_commune_coordinates", side_effect=GeocodingError("timeout")):
			result = distribution._apply_commune_coordinates(_stop(), geocode_if_missing=False)
		self.assertIsNone(result["latitude"])


def _route_doc():
	doc = SimpleNamespace(depot="DEPOT")
	doc.get = lambda key, default=None: "DEPOT" if key == "depot" else default
	return doc


class TestRoutingPointsFallback(unittest.TestCase):
	def test_uses_commune_coordinates_when_customer_gps_is_missing(self):
		doc = _route_doc()
		depot = {"name": "DEPOT", "latitude": 35.67, "longitude": -0.66}
		stop = _stop(latitude=35.697, longitude=-0.633, geolocationSource="commune")
		with (
			patch.object(distribution, "get_depot_snapshot", return_value=depot),
			patch.object(distribution, "_serialize_route", return_value={"stops": [stop]}),
		):
			_depot, stops, coordinates = distribution._routing_points(doc)
		self.assertEqual(stops[0]["geolocationSource"], "commune")
		self.assertTrue(stops[0]["requiresCustomerGeolocation"])
		self.assertEqual(coordinates, [[-0.66, 35.67], [-0.633, 35.697], [-0.66, 35.67]])

	def test_geocodes_commune_when_cache_is_empty(self):
		doc = _route_doc()
		depot = {"name": "DEPOT", "latitude": 35.67, "longitude": -0.66}
		with (
			patch.object(distribution, "get_depot_snapshot", return_value=depot),
			patch.object(distribution, "_serialize_route", return_value={"stops": [_stop()]}),
			patch.object(
				distribution,
				"get_commune_coordinates",
				return_value={"latitude": 35.6, "longitude": -0.5, "source": "nominatim"},
			),
		):
			_depot, stops, coordinates = distribution._routing_points(doc)
		self.assertEqual(stops[0]["geolocationSource"], "commune")
		self.assertEqual(coordinates[1], [-0.5, 35.6])

	def test_still_fails_without_customer_gps_or_commune(self):
		doc = _route_doc()
		depot = {"name": "DEPOT", "latitude": 35.67, "longitude": -0.66}
		stop = _stop(communeId=None, commune=None)
		with (
			patch.object(distribution, "get_depot_snapshot", return_value=depot),
			patch.object(distribution, "_serialize_route", return_value={"stops": [stop]}),
			patch.object(distribution, "_", side_effect=lambda message: message),
		):
			with self.assertRaises(RoutingConfigurationError) as raised:
				distribution._routing_points(doc)
		self.assertIn("Client Test (DN-1)", str(raised.exception))

	def test_geocoding_failure_becomes_routing_error(self):
		doc = _route_doc()
		depot = {"name": "DEPOT", "latitude": 35.67, "longitude": -0.66}
		with (
			patch.object(distribution, "get_depot_snapshot", return_value=depot),
			patch.object(distribution, "_serialize_route", return_value={"stops": [_stop()]}),
			patch.object(distribution, "get_commune_coordinates", side_effect=GeocodingError("Nominatim timeout")),
		):
			with self.assertRaises(RoutingConfigurationError) as raised:
				distribution._routing_points(doc)
		self.assertEqual(str(raised.exception), "Nominatim timeout")


if __name__ == "__main__":
	unittest.main()
