import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useFrappeAuth } from "frappe-react-sdk";
import {
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  LogOut,
  Menu,
  Route,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DistributionRole, DistributionUser } from "@/shared/types/distribution";

interface DesktopShellProps {
  children: ReactNode;
  user: DistributionUser;
}

interface NavItem {
  to: string;
  label: string;
  description: string;
  icon: typeof CalendarDays;
  roles: DistributionRole[];
}

const navItems: NavItem[] = [
  { to: "/today", label: "Aujourd’hui", description: "Priorités opérationnelles", icon: CalendarDays, roles: ["planificateur", "responsable"] },
  { to: "/preparation", label: "Préparation", description: "Commandes et picking", icon: ClipboardCheck, roles: ["preparateur", "responsable"] },
  { to: "/planning", label: "Planification", description: "Tournées et ressources", icon: Route, roles: ["planificateur", "responsable"] },
  { to: "/deliveries", label: "Livraisons", description: "Suivi et historique", icon: Truck, roles: ["planificateur", "responsable"] },
];

const roleLabels: Record<DistributionRole, string> = {
  preparateur: "Préparateur",
  planificateur: "Planificateur",
  livreur: "Livreur",
  responsable: "Responsable",
  none: "Accès limité",
};

export function DesktopShell({ children, user }: DesktopShellProps) {
  const [open, setOpen] = useState(false);
  const { logout } = useFrappeAuth();
  const navigate = useNavigate();
  const visibleItems = navItems.filter((item) => item.roles.includes(user.role));

  const handleLogout = async () => {
    await logout();
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <button type="button" aria-label={open ? "Fermer le menu" : "Ouvrir le menu"} onClick={() => setOpen((value) => !value)} className="fixed left-4 top-4 z-[60] inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 md:hidden">
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {open && <button type="button" aria-label="Fermer le menu" className="fixed inset-0 z-40 bg-slate-950/30 md:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <button type="button" className="flex items-center gap-3 border-b border-slate-100 px-6 py-5 text-left" onClick={() => navigate("/today")}>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-700 text-white"><Route className="h-5 w-5" /></span>
          <span><span className="block text-sm font-bold tracking-tight text-slate-950">IntraPro</span><span className="block text-xs font-semibold text-blue-700">Distribution</span></span>
        </button>
        <nav aria-label="Navigation principale" className="flex-1 space-y-2 px-4 py-5">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)} className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors ${isActive ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}>
                <Icon className="h-5 w-5 shrink-0" />
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{item.label}</span><span className="block truncate text-xs text-slate-500">{item.description}</span></span>
                <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t border-slate-100 p-4">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-slate-600"><UserRound className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{user.fullName}</span><span className="block text-xs text-slate-500">{roleLabels[user.role]}</span></span>
          </div>
          <Button variant="outline" className="w-full justify-start" onClick={handleLogout}><LogOut className="mr-2 h-4 w-4" />Déconnexion</Button>
        </div>
      </aside>
      <main className="min-h-screen md:pl-72"><div className="mx-auto w-full max-w-[1500px] px-4 pb-10 pt-20 sm:px-6 md:px-8 md:pt-8">{children}</div></main>
    </div>
  );
}
