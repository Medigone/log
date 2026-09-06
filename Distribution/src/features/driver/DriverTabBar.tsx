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
 * Barre d’onglets basse — 4 onglets, cibles ≥ 56 px, safe-area iOS.
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
        "fixed inset-x-0 bottom-0 z-40 mx-auto grid h-20 max-w-xl grid-cols-4 border-t border-hairline bg-white px-1 pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      {DRIVER_TABS.map((item) => {
        const Icon = item.icon;
        const active = tab === item.value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onSelect(item.value)}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition-colors ${
              active ? "text-brand-700" : "text-subtle"
            }`}
          >
            <span className={`grid h-7 w-12 place-items-center rounded-full ${active ? "bg-brand-50" : ""}`}>
              <Icon className="size-5" />
            </span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
