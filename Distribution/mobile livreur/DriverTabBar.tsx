import { Map, MapPin, ScanLine, Wallet } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type DriverTab = "route" | "map" | "scan" | "cash";

const DRIVER_TABS: Array<{ value: DriverTab; label: string; Icon: typeof MapPin }> = [
  { value: "route", label: "Tournée", Icon: MapPin },
  { value: "map", label: "Carte", Icon: Map },
  { value: "scan", label: "Scanner", Icon: ScanLine },
  { value: "cash", label: "Bilan", Icon: Wallet },
];

/**
 * Barre d'onglets basse — 4 onglets, cibles ≥ 56 px de haut, safe-area iOS incluse.
 * Remplace la TabsList à 3 onglets de DriverApp.
 */
export function DriverTabBar({ className }: { className?: string }) {
  return (
    <TabsList
      variant="bar"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 grid h-auto grid-cols-4 gap-0 rounded-none border-t bg-background px-2 pt-2",
        "pb-[max(0.875rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {DRIVER_TABS.map(({ value, label, Icon }) => (
        <TabsTrigger
          key={value}
          value={value}
          variant="bar"
          className="flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-muted-foreground data-[state=active]:text-foreground"
        >
          <span className="flex h-6.5 w-11 items-center justify-center rounded-full transition-colors data-[state=active]:bg-brand-100 group-data-[state=active]:bg-brand-100">
            <Icon className="size-5" />
          </span>
          <span className="text-[11px] font-medium">{label}</span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
