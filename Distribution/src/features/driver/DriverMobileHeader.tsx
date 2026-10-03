import { ChevronLeft, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/shared/ui/BrandLogo";
import type { DriverTab } from "@/features/driver/DriverTabBar";

export function driverHeaderTitle({
  tab,
  showingList,
  showDetail,
  routeName,
  lifecycle,
}: {
  tab: DriverTab;
  showingList: boolean;
  showDetail: boolean;
  routeName?: string;
  lifecycle?: string;
}) {
  if (tab === "map") return "Carte";
  if (tab === "scanner") return "Scanner";
  if (tab === "bilan") return "Bilan";
  if (showingList) return "Tournées";
  if (showDetail && lifecycle === "Publiée") return "Contrôle départ";
  if (showDetail && routeName) return routeName;
  return "Tournée";
}

export function DriverMobileHeader({
  title,
  showBack,
  onBack,
  onLogout,
}: {
  title: string;
  showBack: boolean;
  onBack: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex min-h-14 shrink-0 items-center gap-2 border-b bg-background px-3 pt-[env(safe-area-inset-top)]">
      {showBack ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="size-11 shrink-0"
          aria-label="Retour aux tournées"
          onClick={onBack}
        >
          <ChevronLeft />
        </Button>
      ) : (
        <span className="flex size-11 shrink-0 items-center justify-center">
          <BrandLogo compact className="size-8" alt="IntraPro Distribution" />
        </span>
      )}
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">{title}</h1>
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        className="size-11 shrink-0"
        aria-label="Se déconnecter"
        onClick={onLogout}
      >
        <LogOut />
      </Button>
    </header>
  );
}
