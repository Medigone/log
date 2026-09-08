// Copyright (c) 2026, IntraPro and contributors
// After Desk logout, send the user to the public landing page instead of /login.

(function () {
	const landingPath = "/";

	function redirectToLanding() {
		window.location.replace(landingPath);
	}

	function patchDeskLogout() {
		if (!window.frappe || !frappe.app || typeof frappe.app.logout !== "function") {
			return false;
		}
		if (frappe.app.__modernPharmaLandingLogout) {
			return true;
		}
		frappe.app.__modernPharmaLandingLogout = true;
		frappe.app.logout = function logoutToLanding() {
			this.logged_out = true;
			return frappe.call({
				method: "logout",
				callback: function (r) {
					if (r.exc) {
						return;
					}
					redirectToLanding();
				},
			});
		};
		return true;
	}

	$(function () {
		if (!patchDeskLogout()) {
			$(document).on("app_ready", patchDeskLogout);
		}
	});
})();
