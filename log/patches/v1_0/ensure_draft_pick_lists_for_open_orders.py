# Copyright (c) 2026, IntraPro and contributors

import frappe


def execute():
	"""Rattrape les commandes déjà soumises sans Pick List couvrante."""
	frappe.enqueue(
		"log.pick_list_ops.ensure_open_order_pick_lists",
		queue="short",
		enqueue_after_commit=True,
	)
