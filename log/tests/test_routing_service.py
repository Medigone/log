import unittest
from unittest.mock import Mock, patch

import requests

from log.services.routing import (
	OpenRouteServiceClient,
	RoutingProviderError,
	RoutingSettings,
	parse_coordinate,
	route_duration_summary,
)


def response(payload, *, status=200):
	result = Mock()
	result.ok = status < 400
	result.status_code = status
	result.json.return_value = payload
	return result


class TestOpenRouteServiceClient(unittest.TestCase):
	def setUp(self):
		self.settings = RoutingSettings(
			base_url="https://api.openrouteservice.org",
			profile="driving-car",
			api_key="secret-test-key",
			optimization_enabled=True,
			stop_duration_minutes=15,
		)

	@patch("log.services.routing.requests.post")
	def test_directions_uses_lon_lat_and_returns_geojson(self, post):
		post.return_value = response(
			{
				"features": [
					{
						"geometry": {"type": "LineString", "coordinates": [[-0.66, 35.67], [-0.6, 35.7]]},
						"properties": {"summary": {"distance": 12500, "duration": 1800}},
					}
				]
			}
		)
		result = OpenRouteServiceClient(self.settings).directions([[-0.66, 35.67], [-0.6, 35.7]])

		self.assertEqual(result["distanceMeters"], 12500)
		self.assertEqual(result["geometry"]["type"], "LineString")
		request = post.call_args
		self.assertEqual(request.kwargs["json"]["coordinates"][0], [-0.66, 35.67])
		self.assertEqual(request.kwargs["headers"]["Authorization"], "secret-test-key")
		self.assertEqual(request.kwargs["headers"]["Accept"], "application/geo+json")
		self.assertEqual(request.kwargs["timeout"], 20)

	@patch("log.services.routing.requests.post", side_effect=requests.Timeout)
	def test_timeout_is_translated(self, _post):
		with patch("log.services.routing._", side_effect=lambda message: message):
			with self.assertRaisesRegex(RoutingProviderError, "delai"):
				OpenRouteServiceClient(self.settings).directions([[-0.66, 35.67], [-0.6, 35.7]])

	@patch("log.services.routing.requests.post")
	def test_optimization_returns_every_job_in_provider_order(self, post):
		post.return_value = response(
			{"routes": [{"distance": 1000, "duration": 300, "steps": [{"type": "start"}, {"type": "job", "id": 2}, {"type": "job", "id": 1}, {"type": "end"}]}]}
		)
		jobs = [
			{"deliveryNote": "DN-1", "location": [-0.6, 35.7]},
			{"deliveryNote": "DN-2", "location": [-0.5, 35.8]},
		]
		result = OpenRouteServiceClient(self.settings).optimize([-0.66, 35.67], jobs)
		self.assertEqual(result["orderedDeliveryNotes"], ["DN-2", "DN-1"])
		self.assertEqual(post.call_args.kwargs["json"]["vehicles"][0]["start"], [-0.66, 35.67])
		self.assertEqual(post.call_args.kwargs["json"]["vehicles"][0]["end"], [-0.66, 35.67])
		self.assertEqual(post.call_args.kwargs["headers"]["Accept"], "application/json")

	def test_coordinate_validation(self):
		self.assertEqual(parse_coordinate("35.67", minimum=-90, maximum=90, label="latitude"), 35.67)
		with self.assertRaises(Exception):
			parse_coordinate("hors-limite", minimum=-90, maximum=90, label="latitude")

	def test_route_duration_adds_default_time_for_each_stop(self):
		summary = route_duration_summary(1800, 3, 15)
		self.assertEqual(summary["durationSeconds"], 1800)
		self.assertEqual(summary["stopDurationSeconds"], 2700)
		self.assertEqual(summary["totalDurationSeconds"], 4500)

	def test_route_duration_accepts_zero_and_rejects_negative_values(self):
		self.assertEqual(route_duration_summary(600, 2, 0)["totalDurationSeconds"], 600)
		self.assertEqual(route_duration_summary(600, -2, -10)["totalDurationSeconds"], 600)


if __name__ == "__main__":
	unittest.main()
