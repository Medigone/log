type Crumb = { label: string; to?: string }

const SECTION_LABELS: Record<string, string> = {
  today: "Tableau de bord",
  preparation: "Préparation",
  planning: "Planification",
  deliveries: "Livraisons",
  livreurs: "Livreurs",
  vehicules: "Véhicules",
  stock: "Stock véhicules",
  cashier: "Caisse",
  caisses: "Caisses livreurs",
}

export function crumbsFromPath(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean)
  const section = parts[0]
  if (!section) return [{ label: "Tableau de bord" }]
  const label = SECTION_LABELS[section] || section
  if (section === "planning" && parts[1] === "routes" && parts[2]) {
    return [{ label, to: "/planning" }, { label: decodeURIComponent(parts[2]) }]
  }
  if (section === "preparation" && parts[1] === "commandes" && parts[2]) {
    return [{ label, to: "/preparation" }, { label: decodeURIComponent(parts[2]) }]
  }
  if ((section === "livreurs" || section === "vehicules") && parts[1]) {
    return [{ label, to: `/${section}` }, { label: decodeURIComponent(parts[1]) }]
  }
  return [{ label }]
}
