import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { X } from "lucide-react"
import { useNavAlertCount } from "@/layouts/navBadges"

export const NAV_ALERT_DISMISS_KEY = "nav_alert_card_dismissed"

/**
 * Encart « N anomalies » au-dessus du profil.
 * Fermeture persistée pour la session (pas de cookie : l’info revient au prochain login).
 */
export function NavAlertCard() {
  const navigate = useNavigate()
  const alerts = useNavAlertCount()
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(NAV_ALERT_DISMISS_KEY) === "1",
  )

  if (dismissed || alerts.length === 0) return null

  const detail = alerts
    .slice(0, 3)
    .map((alert) => alert.title)
    .join(" · ")

  return (
    <div className="mb-1 flex flex-col gap-1.5 rounded-xl border border-destructive/25 bg-destructive/5 p-2.5">
      <div className="flex items-center gap-2">
        <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
        <p className="whitespace-nowrap text-[12.5px] font-semibold text-destructive">
          {alerts.length} anomalie{alerts.length > 1 ? "s" : ""}
        </p>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Masquer les anomalies"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => {
            sessionStorage.setItem(NAV_ALERT_DISMISS_KEY, "1")
            setDismissed(true)
          }}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <p className="text-[11.5px] leading-snug text-muted-foreground">{detail}</p>
      <button
        type="button"
        onClick={() => navigate("/today")}
        className="w-fit text-[11.5px] font-medium text-destructive hover:underline"
      >
        Ouvrir le tableau de bord →
      </button>
    </div>
  )
}
