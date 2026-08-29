frappe.ui.form.on("Campagne Portail", {
	refresh(frm) {
		if (frm.is_new() || !frm.has_perm("write")) {
			return;
		}
		frm.add_custom_button(__("Prévisualiser"), () => preview_campaign(frm));
	},
});

function preview_campaign(frm) {
	const dialog = new frappe.ui.Dialog({
		title: __("Prévisualiser la campagne"),
		fields: [
			{
				fieldname: "customer",
				fieldtype: "Link",
				label: __("Client de test"),
				options: "Customer",
				reqd: 1,
			},
		],
		primary_action_label: __("Prévisualiser"),
		primary_action(values) {
			frappe.call({
				method: "log.api.client_portal.preview_campaign",
				args: { campaign: frm.doc.name, customer: values.customer },
				freeze: true,
				freeze_message: __("Calcul de l'aperçu…"),
				callback(response) {
					dialog.hide();
					show_preview(frm, response.message);
				},
			});
		},
	});
	dialog.show();
}

function show_preview(frm, payload) {
	const hero = payload.hero || {};
	const rails = payload.rails || [];
	const banners = payload.banners || [];
	const products = rails.flatMap((rail) => rail.items || []);
	const priced = products.filter((item) => item.showPrice !== false && item.unitPriceTtc != null);
	const discounted = priced.filter(
		(item) => item.catalogPriceTtc != null && item.catalogPriceTtc - item.unitPriceTtc > 0.009,
	);
	const productLines = products
		.slice(0, 8)
		.map((item) => {
			const label = frappe.utils.escape_html(item.itemName || item.itemCode || "");
			if (item.showPrice === false || item.unitPriceTtc == null) {
				return `<li>${label} — ${__("Prix masqué")}</li>`;
			}
			const current = format_currency(item.unitPriceTtc, item.currency);
			const onSale = item.catalogPriceTtc != null && item.catalogPriceTtc - item.unitPriceTtc > 0.009;
			const catalog = onSale ? `<s>${format_currency(item.catalogPriceTtc, item.currency)}</s> ` : "";
			return `<li>${label} — ${catalog}${current}</li>`;
		})
		.join("");
	const pricingHint =
		frm.doc.offer_source === "Pricing Rule" && priced.length && !discounted.length
			? `<p class="text-danger">${__(
					"ERPNext n'a pas appliqué de remise à ce client. Vérifiez le ciblage de la règle de prix (groupe client, territoire, dates, société) : il doit correspondre au client de test.",
				)}</p>`
			: "";
	const html = `
		<p><strong>${frappe.utils.escape_html(payload.customerName || "")}</strong>
		— ${frappe.utils.escape_html(payload.computedStatus || frm.doc.computed_status || "")}</p>
		<p>${__("Hero")} : ${frappe.utils.escape_html(hero.title || hero.headline || __("aucun"))}</p>
		<p>${__("Bandeaux")} : ${banners.length}</p>
		<p>${__("Rayons")} : ${rails.map((rail) => frappe.utils.escape_html(rail.title)).join(", ") || __("aucun")}</p>
		${productLines ? `<p>${__("Prix calculés")}</p><ul>${productLines}</ul>` : ""}
		${pricingHint}
		<p class="text-muted">${__("Les prix affichés au client sont toujours recalculés par ERPNext au panier.")}</p>
	`;
	frappe.msgprint({
		title: __("Aperçu portail"),
		indicator: discounted.length ? "green" : priced.length && frm.doc.offer_source === "Pricing Rule" ? "orange" : "blue",
		message: html,
	});
}
