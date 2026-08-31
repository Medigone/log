"""Initialise les clés VAPID du portail client."""

from log.services.portal_push import ensure_vapid_keys


def execute():
	ensure_vapid_keys()
