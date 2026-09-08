// Copyright (c) 2025, IntraPro and contributors
// For license information, please see license.txt

frappe.ui.form.on("Parametres Livraison", {
	async refresh(frm) {
		const depots = await frappe.db.get_list("Depot Distribution", {
			filters: { is_default: 1 },
			fields: ["name", "nom", "adresse", "latitude_depot", "longitude_depot"],
			limit: 1,
		});
		const depot = depots[0];
		if (!depot) {
			frm.get_field("depot_principal_html").$wrapper.html(
				`<div class="alert alert-warning">${__("Aucun dépôt principal n'est configuré.")}</div>`,
			);
			return;
		}
		const label = frappe.utils.escape_html(depot.nom || depot.name);
		const address = frappe.utils.escape_html(depot.adresse || __("Adresse non renseignée"));
		const latitude = frappe.utils.escape_html(String(depot.latitude_depot || "—"));
		const longitude = frappe.utils.escape_html(String(depot.longitude_depot || "—"));
		const deskRoot = (frappe.boot && frappe.boot.desk_path) || "/app";
		const href = `${deskRoot}/depot-distribution/${encodeURIComponent(depot.name)}`;
		frm.get_field("depot_principal_html").$wrapper.html(`
			<div class="rounded border p-3">
				<div class="font-weight-bold">${label}</div>
				<div class="text-muted small">${address}</div>
				<div class="text-muted small mt-1">GPS : ${latitude}, ${longitude}</div>
				<a class="btn btn-xs btn-default mt-2" href="${href}">${__("Ouvrir le dépôt")}</a>
			</div>
		`);
	}
});
