import type { RouteStop } from "@/shared/types/distribution";
import { routeProgress, stopVisualState, type StopVisualState } from "@/features/driver/driverMobile";
import { cn } from "@/lib/utils";

const SEGMENT_CLASS: Record<StopVisualState, string> = {
  delivered: "bg-emerald-500",
  partial: "bg-amber-500",
  failed: "bg-rose-500",
  current: "bg-white",
  upcoming: "bg-white/20",
};

/**
 * Un segment par arrêt, coloré par résultat : répond à « où j'en suis »
 * sans lire la liste. À poser dans l'en-tête sombre de DriverDashboard.
 */
export function RouteProgressBar({ stops, className }: { stops: RouteStop[]; className?: string }) {
  const progress = routeProgress(stops);
  return (
    <div
      className={cn("flex gap-0.5", className)}
      role="img"
      aria-label={`${progress.done} arrêts traités sur ${progress.total}, ${progress.failed} échecs`}
    >
      {stops.map((stop, index) => (
        <span
          key={stop.deliveryNote}
          className={cn(
            "h-1.5 flex-1 rounded-sm",
            SEGMENT_CLASS[stopVisualState(stop, index === progress.currentIndex)],
          )}
        />
      ))}
    </div>
  );
}
