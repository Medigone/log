import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import requests

from log.services import geocoding


def response(payload, *, status=200):
	result = Mock()
	result.ok = status < 400
	result.status_code = status
	result.json.return_value = payload
	return result


class TestOptionalCoordinates(unittest.TestCase):
	def test_rejects_empty_and_zero_zero(self):
		self.assertIsNone(geocoding._optional_coordinates(None, None))
		self.assertIsNone(geocoding._optional_coordinates(0, 0))
		self.assertIsNone(geocoding._optional_coordinates(0.0, 0.0))
		self.assertEqual(geocoding._optional_coordinates(35.697, -0.633), (35.697, -0.633))


class TestNominatimSearch(unittest.TestCase):
	@patch.object(geocoding, "_throttle")
	@patch.object(geocoding.requests, "get")
	def test_returns_first_hit(self, get, _throttle):
		get.return_value = response([{"lat": "35.6971", "lon": "-0.6337"}])
		self.assertEqual(geocoding.search_nominatim("Oran, Oran, Algérie"), (35.6971, -0.6337))
		request = get.call_args
		self.assertEqual(request.args[0], geocoding.NOMINATIM_SEARCH_URL)
		self.assertEqual(request.kwargs["params"]["countrycodes"], "dz")
		self.assertIn("IntraPro-Log-Distribution", request.kwargs["headers"]["User-Agent"])

	@patch.object(geocoding, "_throttle")
	@patch.object(geocoding.requests, "get")
	def test_empty_list_is_a_miss(self, get, _throttle):
		get.return_value = response([])
		self.assertIsNone(geocoding.search_nominatim("Inconnue, Algérie"))

	@patch.object(geocoding, "_throttle")
	@patch.object(geocoding.requests, "get", side_effect=requests.Timeout)
	def test_timeout_is_translated(self, _get, _throttle):
		with patch.object(geocoding, "_", side_effect=lambda message: message):
			with self.assertRaisesRegex(geocoding.GeocodingError, "délai"):
				geocoding.search_nominatim("Oran")


class TestCommuneCoordinates(unittest.TestCase):
	def test_cache_hit_skips_nominatim(self):
		db = Mock()
		db.get_value.return_value = {
			"name": "COM-1",
			"nom": "Oran",
			"wilaya": "Oran",
			"latitude": 35.697,
			"longitude": -0.633,
		}
		with (
			patch.object(geocoding, "frappe", SimpleNamespace(db=db)),
			patch.object(geocoding, "search_nominatim") as search,
		):
			result = geocoding.get_commune_coordinates("COM-1", geocode_if_missing=True)
		self.assertEqual(result["source"], "cache")
		self.assertEqual(result["latitude"], 35.697)
		search.assert_not_called()
		db.set_value.assert_not_called()

	def test_miss_geocodes_and_persists(self):
		db = Mock()
		db.get_value.return_value = {
			"name": "COM-1",
			"nom": "Oran",
			"wilaya": "Oran",
			"latitude": 0,
			"longitude": 0,
		}
		with (
			patch.object(geocoding, "frappe", SimpleNamespace(db=db)),
			patch.object(geocoding, "search_nominatim", return_value=(35.697, -0.633)) as search,
		):
			result = geocoding.get_commune_coordinates("COM-1", geocode_if_missing=True)
		self.assertEqual(result["source"], "nominatim")
		self.assertEqual(result["latitude"], 35.697)
		search.assert_called_once()
		self.assertEqual(db.set_value.call_count, 2)

	def test_miss_without_geocode_returns_none(self):
		db = Mock()
		db.get_value.return_value = {
			"name": "COM-1",
			"nom": "Oran",
			"wilaya": "Oran",
			"latitude": None,
			"longitude": None,
		}
		with (
			patch.object(geocoding, "frappe", SimpleNamespace(db=db)),
			patch.object(geocoding, "search_nominatim") as search,
		):
			self.assertIsNone(geocoding.get_commune_coordinates("COM-1", geocode_if_missing=False))
		search.assert_not_called()

	def test_nominatim_miss_returns_none(self):
		db = Mock()
		db.get_value.return_value = {
			"name": "COM-1",
			"nom": "Inconnue",
			"wilaya": "Oran",
			"latitude": None,
			"longitude": None,
		}
		with (
			patch.object(geocoding, "frappe", SimpleNamespace(db=db)),
			patch.object(geocoding, "search_nominatim", return_value=None),
		):
			self.assertIsNone(geocoding.get_commune_coordinates("COM-1", geocode_if_missing=True))
		db.set_value.assert_not_called()


if __name__ == "__main__":
	unittest.main()
