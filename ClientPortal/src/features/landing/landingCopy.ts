export const ACCENT = "#09090b"

export const heroPoints = [
	"Détaillants et grossistes",
	"Un délégué dédié",
	"Commande suivie de bout en bout",
] as const

export const trackSteps = [
	{ label: "Commande reçue", time: "05/09 · 14:20", glyph: "✓", done: true, active: false },
	{ label: "Préparée et contrôlée", time: "06/09 · 07:05", glyph: "✓", done: true, active: false },
	{ label: "En cours de livraison", time: "en approche", glyph: "3", done: false, active: true },
	{ label: "Livrée", time: "—", glyph: "4", done: false, active: false },
] as const

export const pillars = [
	{
		tag: "Disponibilité",
		title: "Du stock, pas des promesses",
		desc: "Nos volumes sont dimensionnés sur vos historiques de commande, pour éviter les ruptures sur vos références qui tournent.",
	},
	{
		tag: "Réactivité",
		title: "Commandé, puis livré",
		desc: "Petits réassorts d’officine comme volumes de gros : la commande part dès qu’elle est prête, sans attendre un créneau.",
	},
	{
		tag: "Traçabilité",
		title: "Chaque livraison est documentée",
		desc: "Quantités remises, écarts éventuels, situation de compte : tout est consigné et consultable à tout moment.",
	},
	{
		tag: "Proximité",
		title: "Un interlocuteur qui vous connaît",
		desc: "Un délégué suit votre point de vente : conseil d’assortiment, réclamations, ouverture de nouvelles références.",
	},
] as const

export const steps = [
	{
		n: "1",
		title: "Vous nous contactez",
		desc: "Par téléphone ou via le formulaire. Nous vérifions que votre adresse est dans notre zone de livraison.",
		meta: "Réponse sous 48 h",
	},
	{
		n: "2",
		title: "Nous ouvrons le compte",
		desc: "Registre de commerce, adresse de livraison, conditions convenues avec votre délégué.",
		meta: "Réservé aux professionnels",
	},
	{
		n: "3",
		title: "Vous commandez",
		desc: "Votre première commande est préparée et livrée à votre point de vente ou à votre dépôt.",
		meta: "Détaillants et grossistes",
	},
] as const

export const coverageNetwork = [
	{ name: "Oran", role: "Base logistique", hub: true },
	{ name: "Mostaganem", role: "Desservie", hub: false },
	{ name: "Aïn Témouchent", role: "Desservie", hub: false },
	{ name: "Mascara", role: "Desservie", hub: false },
	{ name: "Tlemcen", role: "Desservie", hub: false },
	{ name: "Sidi Bel Abbès", role: "Desservie", hub: false },
] as const
