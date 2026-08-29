const CUSTOMER_PORTAL_API = "log.api.customer_portal_admin";
const MANUAL_CONTACT = "__manual__";
const PORTAL_ACCESS_BUTTON = __("Ajouter un accès portail");

frappe.ui.form.on("Customer", {
	refresh(frm) {
		if (frm.is_new() || !frm.has_perm("write")) {
			return;
		}

		frm.add_custom_button(PORTAL_ACCESS_BUTTON, () => open_portal_access_from_form(frm));
		frm.change_custom_button_type(PORTAL_ACCESS_BUTTON, null, "primary");

		const grid = frm.get_field("portal_users")?.grid;
		if (grid) {
			grid.add_custom_button(PORTAL_ACCESS_BUTTON, () => open_portal_access_from_form(frm), "top");
			frm.set_df_property(
				"portal_users",
				"description",
				__("Utilisez le bouton « Ajouter un accès portail » pour créer un compte ClientPortal."),
			);
		}
	},
});

function is_customer_eligible_for_portal(frm) {
	if (frm.doc.disabled) {
		return false;
	}
	if (frappe.meta.has_field(frm.doctype, "custom_status") && frm.doc.custom_status !== "Actif") {
		return false;
	}
	return true;
}

function open_portal_access_from_form(frm) {
	if (!is_customer_eligible_for_portal(frm)) {
		frappe.msgprint({
			title: __("Client inactif"),
			indicator: "orange",
			message: __("Un accès portail ne peut être créé que pour un client au statut Actif et non désactivé."),
		});
		return;
	}
	open_customer_portal_access_dialog(frm);
}

async function open_customer_portal_access_dialog(frm) {
	const response = await frappe.call({
		method: `${CUSTOMER_PORTAL_API}.get_customer_portal_access_setup`,
		args: { customer: frm.doc.name },
		freeze: true,
		freeze_message: __("Chargement des contacts…"),
	});
	const setup = response.message;
	const contacts = new Map(setup.contacts.map((contact) => [contact.name, contact]));
	const options = [
		{
			label: __("Saisie libre (créer un contact)"),
			value: MANUAL_CONTACT,
			description: __("Prénom, nom et e-mail seront saisis ci-dessous."),
		},
		...setup.contacts.map((contact) => ({
			label: contact.fullName,
			value: contact.name,
			description: contact.email,
		})),
	];
	const existing_accesses = setup.accesses.length
		? setup.accesses
				.map((access) => `${frappe.utils.escape_html(access.fullName)} — ${frappe.utils.escape_html(access.user)}`)
				.join("<br>")
		: `<span class="text-muted">${__("Aucun accès portail actuellement rattaché.")}</span>`;

	const dialog = new frappe.ui.Dialog({
		title: __("Ajouter un accès portail"),
		fields: [
			{
				fieldname: "existing_accesses",
				fieldtype: "HTML",
				options: `<div class="mb-3"><div class="text-muted small mb-1">${__("Accès existants")}</div>${existing_accesses}</div>`,
			},
			{
				fieldname: "contact",
				fieldtype: "Autocomplete",
				label: __("Contact lié"),
				options,
				reqd: 1,
				ignore_validation: false,
				onchange: () => apply_selected_contact(dialog, contacts),
			},
			{ fieldname: "identity_section", fieldtype: "Section Break", label: __("Identité du client") },
			{ fieldname: "first_name", fieldtype: "Data", label: __("Prénom"), reqd: 1 },
			{ fieldname: "column_break", fieldtype: "Column Break" },
			{ fieldname: "last_name", fieldtype: "Data", label: __("Nom") },
			{ fieldname: "email", fieldtype: "Data", label: __("Adresse e-mail"), options: "Email", reqd: 1 },
			{
				fieldname: "password_notice",
				fieldtype: "HTML",
				options: `<div class="alert alert-info mt-3">${__(
					"Un mot de passe temporaire fort sera généré par le serveur uniquement si le compte n’existe pas encore.",
				)}</div>`,
			},
		],
		primary_action_label: __("Créer l’accès"),
		primary_action: async (values) => {
			dialog.disable_primary_action();
			try {
				const creation = await frappe.call({
					method: `${CUSTOMER_PORTAL_API}.create_customer_portal_user`,
					type: "POST",
					args: {
						payload: {
							customer: frm.doc.name,
							contact: values.contact === MANUAL_CONTACT ? null : values.contact,
							firstName: values.first_name,
							lastName: values.last_name,
							email: values.email,
						},
					},
					freeze: true,
					freeze_message: __("Création de l’accès portail…"),
				});
				dialog.hide();
				handle_portal_access_result(creation.message);
				await frm.reload_doc();
			} finally {
				dialog.enable_primary_action();
			}
		},
	});

	dialog.show();
	const default_contact = contacts.has(setup.primaryContact) ? setup.primaryContact : MANUAL_CONTACT;
	dialog.set_value("contact", default_contact);
	apply_selected_contact(dialog, contacts);
}

function apply_selected_contact(dialog, contacts) {
	const selected = contacts.get(dialog.get_value("contact"));
	for (const fieldname of ["first_name", "last_name", "email"]) {
		dialog.set_df_property(fieldname, "read_only", Boolean(selected));
	}
	if (selected) {
		dialog.set_value("first_name", selected.firstName || selected.fullName || "");
		dialog.set_value("last_name", selected.lastName || "");
		dialog.set_value("email", selected.email || "");
	} else if (dialog.get_value("contact") === MANUAL_CONTACT) {
		dialog.set_value("first_name", "");
		dialog.set_value("last_name", "");
		dialog.set_value("email", "");
	}
}

function handle_portal_access_result(result) {
	if (result.status === "already_linked") {
		frappe.show_alert({
			indicator: "blue",
			message: __("L’utilisateur {0} possède déjà un accès à ce client.", [result.email]),
		});
		return;
	}
	if (result.status === "linked_existing") {
		frappe.msgprint({
			title: __("Accès rattaché"),
			indicator: "green",
			message: __("Le compte existant {0} a été rattaché sans modifier son mot de passe.", [
				frappe.utils.escape_html(result.email),
			]),
		});
		return;
	}

	let temporary_password = result.temporaryPassword;
	result.temporaryPassword = null;
	const secret_dialog = new frappe.ui.Dialog({
		title: __("Accès portail créé"),
		fields: [
			{ fieldname: "email", fieldtype: "Data", label: __("Adresse e-mail"), read_only: 1 },
			{
				fieldname: "temporary_password",
				fieldtype: "Data",
				label: __("Mot de passe temporaire"),
				read_only: 1,
				description: __("Ce secret ne sera plus affiché après la fermeture de cette fenêtre."),
			},
			{
				fieldname: "rotation_notice",
				fieldtype: "HTML",
				options: `<div class="alert alert-warning">${__(
					"Le client devra obligatoirement remplacer ce mot de passe lors de sa première connexion.",
				)}</div>`,
			},
		],
		primary_action_label: __("Copier les identifiants"),
		primary_action: () => {
			frappe.utils.copy_to_clipboard(
				`${__("E-mail")}: ${result.email}\n${__("Mot de passe temporaire")}: ${temporary_password}`,
				__("Identifiants copiés."),
			);
		},
	});
	secret_dialog.set_values({ email: result.email, temporary_password });
	secret_dialog.$wrapper.on("hidden.bs.modal", () => {
		temporary_password = null;
		secret_dialog.set_value("temporary_password", "");
		secret_dialog.$wrapper.remove();
	});
	secret_dialog.show();
}
