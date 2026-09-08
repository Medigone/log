"""Home page after login and apps-screen visibility for IntraPro."""

from __future__ import annotations

import frappe
from frappe.utils.user import is_website_user

DISTRIBUTION_HOME_ROLES = frozenset(
	{"Livreur", "Préparateur", "Caissier", "Planificateur", "Responsable"}
)


def get_home_page(user: str | None = None) -> str:
	"""Return the post-login route name expected by Frappe (no leading slash)."""
	user = user or getattr(frappe.session, "user", None)
	if not user or user == "Guest":
		return "client"
	# Administrator inherits every Role, including Customer — never treat as a portal user.
	if user == "Administrator":
		return "desk"

	user_type = frappe.db.get_value("User", user, "user_type")
	if user_type == "Website User":
		return "client"
	roles = set(frappe.get_roles(user))
	if roles & DISTRIBUTION_HOME_ROLES:
		return "distribution"
	return "desk"


def can_show_distribution_app() -> bool:
	if frappe.session.user in (None, "Guest"):
		return False
	if is_website_user():
		return False
	return True


def redirect_if_wrong_app(allowed_home: str) -> None:
	"""Send an already-authenticated user away from the other SPA."""
	user = getattr(frappe.session, "user", None)
	if not user or user == "Guest":
		return

	home = get_home_page(user)
	if allowed_home == "client" and home != "client":
		frappe.local.flags.redirect_location = f"/{home}"
		raise frappe.Redirect
	if allowed_home == "distribution" and home == "client":
		frappe.local.flags.redirect_location = "/client"
		raise frappe.Redirect
