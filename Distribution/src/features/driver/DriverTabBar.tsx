import { Map, MapPin, ScanLine, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

export type DriverTab = "route" | "map" | "scanner" | "bilan";

const DRIVER_TABS = [
  { value: "route", label: "Tournée", icon: MapPin },
  { value: "map", label: "Carte", icon: Map },
  { value: "scanner", label: "Scanner", icon: ScanLine },
  { value: "bilan", label: "Bilan", icon: Wallet },
] as const satisfies ReadonlyArray<{ value: DriverTab; label: string; icon: typeof MapPin }>;

/**
 * Barre d’onglets basse — même chrome que le store mobile (h-14, typo actif).
 * Conservée en `<nav>` + boutons (pas Tabs) pour `aria-current` et le second tap Tournée.
 */
export function DriverTabBar({
  tab,
  onSelect,
  className,
}: {
  tab: DriverTab;
  onSelect: (tab: DriverTab) => void;
  className?: string;
}) {
  return (
    <nav
      aria-label="Navigation livreur"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 overflow-visible border-t border-border bg-background pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      <ul className="grid h-14 grid-cols-4 overflow-visible">
        {DRIVER_TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.value;
          return (
            <li key={item.value} className="min-w-0 overflow-visible">
              <button
                type="button"
                onClick={() => onSelect(item.value)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 min-h-11 min-w-11 w-full flex-col items-center justify-center gap-0.5 px-1 text-[11px] leading-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active ? "font-semibold text-foreground" : "font-medium text-neutral-600",
                )}
              >
                <span className="relative overflow-visible">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="max-w-full truncate">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
