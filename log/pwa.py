# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Sert le service worker du portail avec le MIME et le scope corrects."""

from __future__ import annotations

from pathlib import Path

from werkzeug.wrappers import Response

import frappe
from frappe.website.page_renderers.base_renderer import BaseRenderer

SW_PATH = "sw-client.js"
SW_SCOPE = "/client"


class ServiceWorkerRenderer(BaseRenderer):
	def can_render(self):
		return self.path == SW_PATH

	def render(self):
		filepath = Path(frappe.get_app_path("log")) / "www" / SW_PATH
		if not filepath.is_file():
			return Response("Service worker introuvable.", status=404, mimetype="text/plain")
		body = filepath.read_bytes()
		response = Response(body, mimetype="application/javascript")
		response.headers["Service-Worker-Allowed"] = SW_SCOPE
		response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
		return response
