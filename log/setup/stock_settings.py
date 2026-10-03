# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Réglages stock imposés par la distribution."""

import frappe

BATCH_PICKING_BASED_ON = "Expiry"


def ensure_expiry_threshold():
	"""Seuil « DLC proche » par défaut sur les sites existants (le défaut du champ ne s'applique pas aux singles déjà créés)."""
	from log.utils.batches import DEFAULT_THRESHOLD_DAYS, SETTINGS_DOCTYPE, THRESHOLD_FIELD, stored_threshold

	if stored_threshold() in (None, ""):
		frappe.db.set_single_value(SETTINGS_DOCTYPE, THRESHOLD_FIELD, DEFAULT_THRESHOLD_DAYS)


def ensure_fefo_batch_picking():
	"""Les Pick Lists allouent d'abord le lot qui périme le plus tôt (FEFO)."""
	if frappe.db.get_single_value("Stock Settings", "pick_serial_and_batch_based_on") == BATCH_PICKING_BASED_ON:
		return
	frappe.db.set_single_value("Stock Settings", "pick_serial_and_batch_based_on", BATCH_PICKING_BASED_ON)
