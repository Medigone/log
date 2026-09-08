// Copyright (c) 2026, IntraPro and contributors
// Send Frappe's stock /login#forgot screen to the custom Modern Pharma page.

(function () {
	function pathName() {
		return window.location.pathname.replace(/\/+$/, "") || "/";
	}

	function redirectForgotPassword() {
		if (pathName() !== "/login") {
			return;
		}
		var hash = (window.location.hash || "").replace(/^#\/?/, "");
		if (hash === "forgot") {
			window.location.replace("/client#/forgot");
		}
	}

	redirectForgotPassword();
	window.addEventListener("hashchange", redirectForgotPassword);
})();
