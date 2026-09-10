export const ACCENT = "#09090b"

export const heroPoints = [
	"Parapharmacie et nutrition infantile",
	"Store B2B et espace client",
	"Vente aux professionnels",
] as const

export const storePoints = [
	{
		tag: "Catalogue",
		title: "Parcourez les gammes à votre rythme",
		desc: "Retrouvez les produits par rayons, ouvrez chaque fiche et préparez votre sélection avant de commander.",
	},
	{
		tag: "Commande",
		title: "Passez commande en ligne",
		desc: "Ajoutez les quantités au panier et transmettez votre commande, depuis un ordinateur ou un téléphone.",
	},
	{
		tag: "Hors catalogue",
		title: "Un article absent du catalogue ?",
		desc: "Demandez un article hors catalogue en indiquant la désignation, la quantité et, si besoin, une photo. L’équipe reprend ensuite la demande.",
	},
	{
		tag: "Suivi",
		title: "Suivez votre commande",
		desc: "Retrouvez le statut de vos commandes, de la validation jusqu’à la livraison.",
	},
] as const

export const universeExtension =
	"La gamme peut être étendue selon les besoins des clients."

export const storePreviewItems = [
	{ group: "Nutrition infantile", name: "Lait 1er âge", image: "/assets/log/images/store-preview-lait.jpg" },
	{ group: "Nutrition infantile", name: "Compote fruits", image: "/assets/log/images/store-preview-compote.jpg" },
	{ group: "Parapharmacie", name: "Soin quotidien", image: "/assets/log/images/store-preview-soin.jpg" },
	{ group: "Parapharmacie", name: "Hygiène", image: "/assets/log/images/store-preview-hygiene.jpg" },
] as const

export const portalPoints = [
	{
		tag: "Commandes",
		title: "Suivez vos commandes",
		desc: "Retrouvez l’historique et le statut de vos commandes passées auprès de Modern Pharma.",
	},
	{
		tag: "Livraisons",
		title: "Vos bons de livraison",
		desc: "Consultez les documents de livraison associés à votre activité.",
	},
	{
		tag: "Compte",
		title: "Solde et informations",
		desc: "Accédez au solde, à l’historique des règlements et aux informations de votre magasin.",
	},
	{
		tag: "Alertes",
		title: "Notifications utiles",
		desc: "Choisissez les alertes commandes, livraisons, paiements et offres à recevoir.",
	},
] as const

export const universes = [
	{
		tag: "Nutrition infantile",
		title: "Nutrition infantile",
		desc: "Laits infantiles, compotes et solutions nutritionnelles destinées aux différentes étapes de la petite enfance.",
	},
	{
		tag: "Parapharmacie",
		title: "Parapharmacie",
		desc: "Une sélection de produits de parapharmacie destinée aux pharmacies, parapharmacies et professionnels partenaires.",
	},
] as const

export const storePreviewSteps = [
	{ label: "Consulter les produits", time: "Catalogue", glyph: "✓", done: true, active: false },
	{ label: "Préparer le panier", time: "Quantités", glyph: "✓", done: true, active: false },
	{ label: "Passer commande", time: "en cours", glyph: "3", done: false, active: true },
	{ label: "Suivre la livraison", time: "—", glyph: "4", done: false, active: false },
] as const

export const trackSteps = [
	{ label: "En attente de validation", time: "statut", glyph: "✓", done: true, active: false },
	{ label: "À livrer", time: "préparation", glyph: "✓", done: true, active: false },
	{ label: "Livraison en cours", time: "terrain", glyph: "3", done: false, active: true },
	{ label: "Livré", time: "—", glyph: "4", done: false, active: false },
] as const

export const coverageNetwork = [
	{ name: "Oran", role: "Base logistique", hub: true },
	{ name: "Mostaganem", role: "Desservie", hub: false },
	{ name: "Aïn Témouchent", role: "Desservie", hub: false },
	{ name: "Mascara", role: "Desservie", hub: false },
	{ name: "Tlemcen", role: "Desservie", hub: false },
	{ name: "Sidi Bel Abbès", role: "Desservie", hub: false },
] as const
