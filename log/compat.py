"""Frappe v15 / v16 compatibility helpers.

Desk was served at ``/app`` in Frappe 15 and moved to ``/desk`` in Frappe 16.
Always go through these helpers instead of hardcoding either prefix.
"""

from __future__ import annotations

from typing import Any


def frappe_major_version(version: str | None = None) -> int:
	raw = version
	if raw is None:
		try:
			from frappe import __version__ as installed

			raw = installed
		except Exception:
			raw = "15"
	try:
		return int(str(raw).split(".", 1)[0])
	except (TypeError, ValueError):
		return 15


def desk_root(version: str | None = None) -> str:
	"""Return the Desk URL prefix for the running Frappe version."""
	return "/desk" if frappe_major_version(version) >= 16 else "/app"


def desk_home_route(version: str | None = None) -> str:
	"""Website route name expected by ``get_home_page`` (no leading slash)."""
	return desk_root(version).lstrip("/")


def desk_path(*parts: str, version: str | None = None) -> str:
	rest = "/".join(str(part).strip("/") for part in parts if part)
	root = desk_root(version)
	return f"{root}/{rest}" if rest else root


def home_path(route: str, version: str | None = None) -> str:
	"""Turn a ``get_home_page`` route into an absolute site path."""
	name = (route or "").strip("/")
	if name in {"app", "desk"}:
		return desk_root(version)
	return f"/{name}"


def desk_form_path(doctype: str, name: str, version: str | None = None) -> str:
	from frappe.desk.utils import slug
	from frappe.utils.data import quoted

	return desk_path(quoted(slug(doctype)), quoted(name), version=version)


def extend_bootinfo(bootinfo: Any = None, **_kwargs) -> None:
	if bootinfo is None:
		return
	bootinfo["desk_path"] = desk_root()
