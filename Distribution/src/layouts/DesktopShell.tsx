import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useFrappeAuth } from "frappe-react-sdk";
import {
  CalendarDays,
  ClipboardCheck,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Route,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import { BrandLogo } from "@/shared/ui/BrandLogo";
import { cn } from "@/lib/utils";
import type { DistributionRole, DistributionUser } from "@/shared/types/distribution";

interface DesktopShellProps {
  children: ReactNode;
  user: DistributionUser;
}

interface NavItem {
  to: string;
  label: string;
  icon: typeof CalendarDays;
  roles: DistributionRole[];
}

const SIDEBAR_STORAGE_KEY = "intrapro-distribution.sidebar-collapsed";
const EXPANDED_WIDTH = "w-60";
const COLLAPSED_WIDTH = "w-[4.5rem]";

const navItems: NavItem[] = [
  { to: "/today", label: "Aujourd’hui", icon: CalendarDays, roles: ["planificateur", "responsable"] },
  { to: "/preparation", label: "Préparation", icon: ClipboardCheck, roles: ["preparateur", "responsable"] },
  { to: "/planning", label: "Planification", icon: Route, roles: ["planificateur", "responsable"] },
  { to: "/deliveries", label: "Livraisons", icon: Truck, roles: ["planificateur", "responsable"] },
];

const roleLabels: Record<DistributionRole, string> = {
  preparateur: "Préparateur",
  planificateur: "Planificateur",
  livreur: "Livreur",
  responsable: "Responsable",
  none: "Accès limité",
};

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function DesktopShell({ children, user }: DesktopShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { logout } = useFrappeAuth();
  const navigate = useNavigate();
  const visibleItems = navItems.filter((item) => item.roles.includes(user.role));
  const homePath = visibleItems[0]?.to || "/today";
  const slim = collapsed && !mobileOpen;

  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore quota / private mode */
      }
      return next;
    });
  };

  const handleLogout = async () => {
    await logout();
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <button
        type="button"
        aria-label={mobileOpen ? "Fermer le menu de navigation" : "Ouvrir le menu de navigation"}
        onClick={() => setMobileOpen((value) => !value)}
        className="fixed left-3 top-3 z-[60] inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm md:hidden"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {mobileOpen && (
        <button type="button" aria-label="Fermer le menu de navigation" className="fixed inset-0 z-40 bg-slate-950/40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200/80 bg-white shadow-[1px_0_0_rgba(15,23,42,0.03)] transition-[width,transform] duration-200 ease-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          slim ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
        )}
      >
        <div className={cn("flex h-16 shrink-0 items-center border-b border-slate-100", slim ? "justify-center px-2" : "justify-between gap-2 px-3")}>
          <button type="button" className="flex min-w-0 items-center" onClick={() => { navigate(homePath); setMobileOpen(false); }} aria-label="IntraPro Distribution">
            <BrandLogo compact={slim} className={slim ? "h-8 w-8" : "h-9 w-auto max-w-[148px]"} alt="IntraPro Distribution" />
          </button>
          {!slim && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-pressed={false}
              aria-label="Réduire le menu"
              title="Réduire le menu"
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 md:inline-flex"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        {slim && (
          <div className="hidden justify-center border-b border-slate-100 py-2 md:flex">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Déplier le menu"
              title="Déplier le menu"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        )}

        <nav aria-label="Navigation principale" className={cn("flex-1 overflow-y-auto py-4", slim ? "px-2" : "px-3")}>
          <p className={cn("mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400", slim && "sr-only")}>
            Menu
          </p>
          <ul className="space-y-1">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    title={item.label}
                    aria-label={item.label}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "group flex h-10 items-center rounded-lg text-sm transition-colors",
                        slim ? "justify-center px-0" : "gap-3 px-2.5",
                        isActive ? "font-bold text-slate-950" : "font-normal text-slate-600 hover:text-slate-950",
                      )
                    }
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
                    <span className={cn("truncate", slim && "sr-only")}>{item.label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={cn("border-t border-slate-100", slim ? "p-2" : "p-3")}>
          <div className={cn("mb-2 flex items-center rounded-lg bg-slate-50", slim ? "justify-center p-2" : "gap-2.5 px-2 py-2")}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200">
              <UserRound className="h-4 w-4" />
            </span>
            <span className={cn("min-w-0 flex-1", slim && "sr-only")}>
              <span className="block truncate text-sm font-medium text-slate-900">{user.fullName}</span>
              <span className="block truncate text-xs text-slate-500">{roleLabels[user.role]}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Se déconnecter"
            aria-label="Se déconnecter"
            className={cn(
              "flex h-9 w-full items-center rounded-lg text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700",
              slim ? "justify-center" : "gap-2.5 px-2.5",
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className={cn(slim && "sr-only")}>Déconnexion</span>
          </button>
        </div>
      </aside>

      <main className={cn("min-h-screen transition-[padding] duration-200 ease-out", slim ? "md:pl-[4.5rem]" : "md:pl-60")}>
        <div className="mx-auto w-full max-w-[1500px] px-4 pb-10 pt-16 sm:px-6 md:px-8 md:pt-7">{children}</div>
      </main>
    </div>
  );
}
