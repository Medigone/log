app_name = "log"
app_title = "IntraPro Distribution"
app_publisher = "IntraPro"
app_description = "Préparation, planification et livraison"
app_email = "admin@medigo.one"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
app_logo_url = "/assets/log/images/intrapro-mark.png"

add_to_apps_screen = [
    {
        "name": "log",
        "logo": "/assets/log/images/intrapro-mark.png",
        "title": "IntraPro Distribution",
        "route": "/distribution",
    }
]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/log/css/log.css"
# app_include_js = "/assets/log/js/log.js"

# include js, css files in header of web template
# web_include_css = "/assets/log/css/log.css"
# web_include_js = "/assets/log/js/log.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "log/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {
    "Delivery Note": "public/js/delivery_note.js",
    "Sales Order": "public/js/sales_order.js",
}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "log/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "log.utils.jinja_methods",
# 	"filters": "log.utils.jinja_filters"
# }

# Installation
# ------------

before_install = "log.install.before_install"
after_install = "log.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "log.uninstall.before_uninstall"
# after_uninstall = "log.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "log.utils.before_app_install"
# after_app_install = "log.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "log.utils.before_app_uninstall"
# after_app_uninstall = "log.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "log.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

permission_query_conditions = {
    "Livraison": "log.distribution_permissions.livraison_query_conditions",
    "Paiement Client": "log.distribution_permissions.paiement_query_conditions",
}

has_permission = {
    "Livraison": "log.distribution_permissions.livraison_has_permission",
    "Paiement Client": "log.distribution_permissions.paiement_has_permission",
}

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
    "Customer": {
        "before_save": [
            "log.log.customer_hooks.uppercase_customer_name",
        ]
    },
    "Transferts Marchandise": {
        "validate": "log.transferts_marchandise_hooks.validate_transferts_marchandise",
        "on_submit": "log.transferts_marchandise_hooks.on_submit_transferts_marchandise",
        "on_cancel": "log.transferts_marchandise_hooks.on_cancel_transferts_marchandise"
    },
    "Delivery Note": {
        "validate": [
            "log.log.delivery_note_hooks.validate_delivery_note",
            "log.pick_list_ops.validate_delivery_note_requires_pick_list",
        ],
        "after_insert": [
            "log.pick_list_ops.after_insert_delivery_note",
            "log.delivery_note_ops.ensure_qr_code",
        ],
        "on_update": [
            "log.livraison_hooks.update_livraisons_on_delivery_note_change",
            "log.order_change_ops.invalidate_delivery_note_distribution",
            "log.delivery_note_ops.ensure_qr_code",
        ],
        "on_trash": "log.livraison_hooks.remove_deleted_delivery_note",
    },
    "Pick List": {
        "on_cancel": "log.pick_list_ops.on_cancel_pick_list",
    },
    "Livraison": {
        "validate": "log.livraison_hooks.validate_livraison",
    },
    "Sales Order": {
        "on_update_after_submit": "log.order_change_ops.invalidate_order_distribution",
        "on_cancel": "log.order_change_ops.invalidate_order_distribution",
    },
    "Paiement Client": {
        "validate": "log.paiement_hooks.validate_paiement_client",
        "after_insert": "log.paiement_hooks.update_livraison_totals_on_paiement_change",
        "on_update": "log.paiement_hooks.update_livraison_totals_on_paiement_change",
        "on_trash": "log.paiement_hooks.update_livraison_totals_on_paiement_change",
        "after_delete": "log.paiement_hooks.update_livraison_totals_on_paiement_change",
    },
}

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"daily": []
# }

# Testing
# -------

# before_tests = "log.install.before_tests"

# Overriding Methods
# ------------------------------
#
override_whitelisted_methods = {
    "erpnext.selling.doctype.sales_order.sales_order.make_delivery_note": "log.pick_list_ops.block_make_delivery_note",
}
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "log.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["log.utils.before_request"]
# after_request = ["log.utils.after_request"]

# Job Events
# ----------
# before_job = ["log.utils.before_job"]
# after_job = ["log.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"log.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

website_redirects = [
    {"source": r"/favicon\.ico", "target": "/assets/log/images/intrapro-mark.png"},
]

website_route_rules = [
    {"from_route": "/distribution/<path:app_path>", "to_route": "distribution"},
]

fixtures = [
    "Workflow State",
    "Workflow",
    {
        "dt": "Role",
        "filters": [["name", "in", ["Préparateur", "Planificateur", "Livreur", "Responsable", "Caissier"]]],
    },
]

after_migrate = [
    "log.patches.v1_0.migrate_colis_to_delivery_note.run_after_migrate",
]
