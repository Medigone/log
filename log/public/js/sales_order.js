// Copyright (c) 2026, IntraPro and contributors
// For license information, please see license.txt

frappe.ui.form.on("Sales Order", {
	refresh(frm) {
		const hide = () => {
			frm.remove_custom_button(__("Delivery Note"), __("Create"));
			frm.remove_custom_button(__("Bon de livraison"), __("Créer"));
			frm.remove_custom_button(__("Pick List"), __("Create"));
			frm.remove_custom_button(__("Liste de prélèvement"), __("Créer"));
		};
		hide();
		setTimeout(hide, 400);
		ensure_stock_grid_columns(frm);
		schedule_item_stock_refresh(frm);
	},
	set_warehouse(frm) {
		schedule_item_stock_refresh(frm);
	},
});

frappe.ui.form.on("Sales Order Item", {
	item_code(frm) {
		schedule_item_stock_refresh(frm);
	},
	warehouse(frm) {
		schedule_item_stock_refresh(frm);
	},
	items_remove(frm) {
		schedule_item_stock_refresh(frm);
	},
});

function sales_order_stock_fields_ready() {
	return (
		frappe.meta.has_field("Sales Order Item", "custom_stock_disponible") &&
		frappe.meta.has_field("Sales Order Item", "custom_stock_commande")
	);
}

function ensure_stock_grid_columns(frm) {
	if (!frm || !sales_order_stock_fields_ready()) {
		return;
	}
	const settings = frappe.get_user_settings(frm.doctype, "GridView");
	const cols = settings && settings["Sales Order Item"];
	if (!cols || !cols.length) {
		return;
	}
	const names = cols.map((col) => col.fieldname);
	const extra = [
		{ fieldname: "custom_stock_disponible", columns: 1, sticky: 0 },
		{ fieldname: "custom_stock_commande", columns: 1, sticky: 0 },
	];
	let inserted = false;
	extra.forEach((col) => {
		if (names.includes(col.fieldname)) {
			return;
		}
		let idx = cols.findIndex((row) => row.fieldname === "qty");
		if (col.fieldname === "custom_stock_commande") {
			const stock_idx = cols.findIndex((row) => row.fieldname === "custom_stock_disponible");
			if (stock_idx >= 0) {
				idx = stock_idx;
			}
		}
		cols.splice(idx >= 0 ? idx + 1 : cols.length, 0, col);
		names.push(col.fieldname);
		inserted = true;
	});
	if (!inserted) {
		return;
	}
	const grid = frm.get_field("items") && frm.get_field("items").grid;
	if (!grid) {
		return;
	}
	grid.user_defined_columns = [];
	if (typeof grid.reset_grid === "function") {
		grid.reset_grid();
		return;
	}
	grid.visible_columns = [];
	grid.grid_rows = [];
	$(grid.parent).find(".grid-body .grid-row").remove();
	grid.refresh();
}

function schedule_item_stock_refresh(frm) {
	if (!frm || !sales_order_stock_fields_ready()) {
		return;
	}
	if (frm._log_stock_timer) {
		clearTimeout(frm._log_stock_timer);
	}
	frm._log_stock_timer = setTimeout(() => refresh_item_stock(frm), 300);
}

function refresh_item_stock(frm) {
	if (!frm || !frm.doc || !sales_order_stock_fields_ready()) {
		return;
	}
	const items = (frm.doc.items || [])
		.filter((row) => row.item_code)
		.map((row) => ({
			item_code: row.item_code,
			warehouse: row.warehouse || "",
		}));
	if (!items.length) {
		return;
	}

	const request_id = (frm._log_stock_request_id || 0) + 1;
	frm._log_stock_request_id = request_id;

	frappe.call({
		method: "log.api.sales_order_stock.get_items_stock",
		args: {
			items,
			company: frm.doc.company,
		},
		callback(r) {
			if (frm._log_stock_request_id !== request_id) {
				return;
			}
			apply_item_stock(frm, r.message || {});
		},
	});
}

function apply_item_stock(frm, by_key) {
	const was_unsaved = frm.doc.__unsaved;
	let changed = false;
	(frm.doc.items || []).forEach((row) => {
		if (!row.item_code) {
			return;
		}
		const key = `${row.item_code}::${row.warehouse || ""}`;
		const stock = by_key[key] || { actual_qty: 0, reserved_qty: 0 };
		if (row.custom_stock_disponible !== stock.actual_qty) {
			row.custom_stock_disponible = stock.actual_qty;
			changed = true;
		}
		if (row.custom_stock_commande !== stock.reserved_qty) {
			row.custom_stock_commande = stock.reserved_qty;
			changed = true;
		}
		if (row.actual_qty !== stock.actual_qty) {
			row.actual_qty = stock.actual_qty;
			changed = true;
		}
	});
	if (changed) {
		frm.refresh_field("items");
		ensure_stock_grid_columns(frm);
		if (!was_unsaved) {
			frm.doc.__unsaved = 0;
		}
	}
}
