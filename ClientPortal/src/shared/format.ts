export function formatMoney(amount: number, currency = "DZD") {
  return new Intl.NumberFormat("fr-DZ", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount || 0)
}

export function formatDate(value?: string | null) {
  if (!value) return "—"
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("fr-FR").format(date)
}

const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  draft: "En attente de validation",
  brouillon: "En attente de validation",
  "on hold": "En pause",
  "to pay": "À payer",
  "to deliver and bill": "À livrer",
  "to bill": "Livré",
  "to deliver": "À livrer",
  completed: "Livré",
  cancelled: "Annulé",
  closed: "Clôturé",
  "partially billed": "Livré",
  "partially delivered": "Partiellement livré",
  return: "Retour",
  "return issued": "Retour émis",
  "not delivered": "Non livré",
  "fully delivered": "Livré",
  "partly delivered": "Partiellement livré",
  "not applicable": "Sans objet",
}

export function formatDocumentStatus(status?: string | null) {
  const value = (status || "").trim()
  if (!value) return "—"
  return DOCUMENT_STATUS_LABELS[value.toLowerCase()] || value
}

export type DocumentStatusTone = "success" | "warning" | "destructive" | "info" | "secondary"

function statusKey(status?: string | null) {
  return (status || "").trim().toLowerCase()
}

const DOCUMENT_STATUS_TONES: Record<string, DocumentStatusTone> = {
  completed: "success",
  terminé: "success",
  livré: "success",
  "fully delivered": "success",
  validé: "success",
  validée: "success",
  configurée: "success",
  "on hold": "warning",
  "en pause": "warning",
  "to pay": "warning",
  "à payer": "warning",
  "partly delivered": "warning",
  "partially delivered": "warning",
  "partiellement livré": "warning",
  "à contrôler": "warning",
  "à enregistrer": "warning",
  "à confirmer": "warning",
  cancelled: "destructive",
  annulé: "destructive",
  annulée: "destructive",
  "not delivered": "destructive",
  "non livré": "destructive",
  écart: "destructive",
  return: "destructive",
  "return issued": "destructive",
  retour: "destructive",
  "retour émis": "destructive",
  "to deliver and bill": "info",
  "to bill": "success",
  "partially billed": "success",
  "to deliver": "info",
  "à livrer": "info",
  préparé: "info",
  enlevé: "info",
  nouveau: "info",
  déclaré: "info",
  "en cours": "info",
  "livraison en cours": "info",
  draft: "warning",
  brouillon: "warning",
  "en attente de validation": "warning",
  "en attente": "warning",
  closed: "secondary",
  clôturé: "secondary",
  clôturée: "secondary",
  "not applicable": "secondary",
  "sans objet": "secondary",
  "sans encaissement": "secondary",
}

export function documentStatusTone(status?: string | null): DocumentStatusTone {
  const raw = statusKey(status)
  const label = statusKey(formatDocumentStatus(status))
  const mapped = DOCUMENT_STATUS_TONES[raw] || DOCUMENT_STATUS_TONES[label]
  if (mapped) return mapped
  if (/annul|écart|non livr/.test(raw) || /annul|écart|non livr/.test(label)) return "destructive"
  if (/partiel|contrôl|control|pause/.test(raw) || /partiel|contrôl|control|pause/.test(label)) return "warning"
  if (/attente/.test(raw) || /attente/.test(label)) return "warning"
  if (/livraison en cours/.test(raw) || /livraison en cours/.test(label)) return "info"
  if (/valid|livr|termin/.test(raw) || /valid|livr|termin/.test(label)) return "success"
  if (/prépar|prepar|enlev|livrer|cours/.test(raw) || /prépar|prepar|enlev|livrer|cours/.test(label)) return "info"
  return "secondary"
}

export function todayIso() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}
