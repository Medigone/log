import { FrappeProvider, useFrappeAuth } from "frappe-react-sdk";
import { lazy, Suspense, type ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { LoaderCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toast";
import { PreparationPage } from "@/features/preparation/PreparationPage";
import { TodayPage } from "@/features/today/TodayPage";
import { useDistributionRole } from "@/features/auth/useDistributionRole";
import { LoginPage } from "@/features/auth/LoginPage";
import { PlanningPage } from "@/features/planning/PlanningPage";
import { DeliveriesPage } from "@/features/deliveries/DeliveriesPage";
import { DriverApp } from "@/features/driver/DriverApp";
import { CashierPage } from "@/features/cashier/CashierPage";
import { DriverCashPage } from "@/features/cashier/DriverCashPage";
import { VehicleStockPage } from "@/features/stock/VehicleStockPage";
import { DriversPage } from "@/features/fleet/DriversPage";
import { DriverDetailsPage } from "@/features/fleet/DriverDetailsPage";
import { VehiclesPage } from "@/features/fleet/VehiclesPage";
import { VehicleDetailsPage } from "@/features/fleet/VehicleDetailsPage";
import { PublicTrackingPage } from "@/features/tracking/PublicTrackingPage";
import { TooltipProvider } from "@/components/ui/tooltip"
import { DesktopShell } from "@/layouts/DesktopShell";
import type { DistributionRole } from "@/shared/types/distribution";

const RouteDetailsPage = lazy(() => import("@/features/planning/RouteDetailsPage").then((module) => ({ default: module.RouteDetailsPage })));

function getSiteName() {
  const frappeWindow = window as typeof window & {
    frappe?: { boot?: { sitename?: string } };
  };
  return frappeWindow.frappe?.boot?.sitename ?? import.meta.env.VITE_SITE_NAME;
}

function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <div className="text-center text-muted-foreground">
        <LoaderCircle className="mx-auto mb-3 size-7 animate-spin text-brand-600" />
        <p className="t-body font-medium">Chargement de Distribution…</p>
      </div>
    </div>
  );
}

function AccessDenied() {
  const { logout } = useFrappeAuth();
  return (
    <div className="grid min-h-screen place-items-center bg-surface-subtle p-6">
      <div className="max-w-md rounded-xl border border-hairline bg-card p-8 text-center shadow-card">
        <ShieldAlert className="mx-auto mb-4 size-10 text-amber-600" />
        <h1 className="t-display text-foreground">Accès non configuré</h1>
        <p className="mt-2 t-body text-muted-foreground">
          Votre compte doit recevoir un rôle Préparateur, Planificateur, Livreur, Caissier ou Responsable.
        </p>
        <Button className="mt-6" variant="outline" onClick={() => logout().then(() => window.location.reload())}>
          Se déconnecter
        </Button>
      </div>
    </div>
  );
}

function defaultRoute(role: string) {
  if (role === "livreur") return "/driver";
  if (role === "caissier") return "/cashier";
  return "/today";
}

function RoleGuard({ role, allowed, children }: { role: DistributionRole; allowed: DistributionRole[]; children: ReactNode }) {
  return allowed.includes(role) ? children : <Navigate to={defaultRoute(role)} replace />;
}

function AuthenticatedApp({ currentUser }: { currentUser: string }) {
  const { user, isLoading } = useDistributionRole(currentUser);
  if (isLoading || !user) return <LoadingScreen />;
  if (user.role === "none") return <AccessDenied />;

  if (user.role === "livreur") {
    return <Routes><Route path="/driver" element={<DriverApp />} /><Route path="*" element={<Navigate to="/driver" replace />} /></Routes>;
  }

  return (
    <DesktopShell user={user}>
      <Routes>
        <Route path="/today" element={<RoleGuard role={user.role} allowed={["preparateur", "planificateur", "responsable"]}><TodayPage role={user.role} /></RoleGuard>} />
        <Route path="/preparation" element={<RoleGuard role={user.role} allowed={["preparateur", "responsable"]}><PreparationPage /></RoleGuard>} />
        <Route path="/planning" element={<RoleGuard role={user.role} allowed={["planificateur", "responsable"]}><PlanningPage /></RoleGuard>} />
        <Route path="/planning/routes/:routeId" element={<RoleGuard role={user.role} allowed={["planificateur", "responsable"]}><Suspense fallback={<div className="grid min-h-80 place-items-center"><LoaderCircle className="size-7 animate-spin text-brand-600" /></div>}><RouteDetailsPage canResolveAccounting={user.role === "responsable"} /></Suspense></RoleGuard>} />
        <Route path="/deliveries" element={<RoleGuard role={user.role} allowed={["planificateur", "responsable"]}><DeliveriesPage /></RoleGuard>} />
        <Route path="/livreurs" element={<RoleGuard role={user.role} allowed={["planificateur", "responsable"]}><DriversPage canWrite={user.role === "responsable"} /></RoleGuard>} />
        <Route path="/livreurs/:driverId" element={<RoleGuard role={user.role} allowed={["planificateur", "responsable"]}><DriverDetailsPage canWrite={user.role === "responsable"} /></RoleGuard>} />
        <Route path="/vehicules" element={<RoleGuard role={user.role} allowed={["planificateur", "responsable"]}><VehiclesPage canWrite={user.role === "responsable"} /></RoleGuard>} />
        <Route path="/vehicules/:vehicleId" element={<RoleGuard role={user.role} allowed={["planificateur", "responsable"]}><VehicleDetailsPage canWrite={user.role === "responsable"} /></RoleGuard>} />
        <Route path="/stock" element={<RoleGuard role={user.role} allowed={["preparateur", "planificateur", "responsable"]}><VehicleStockPage canLinkRoutes={user.role !== "preparateur"} /></RoleGuard>} />
        <Route path="/cashier" element={<RoleGuard role={user.role} allowed={["caissier", "responsable"]}><CashierPage canResolveDiscrepancy={user.role === "responsable"} /></RoleGuard>} />
        <Route path="/caisses" element={<RoleGuard role={user.role} allowed={["caissier", "responsable"]}><DriverCashPage canAdjust={user.role === "responsable"} /></RoleGuard>} />
        <Route path="/" element={<Navigate to={defaultRoute(user.role)} replace />} />
        <Route path="*" element={<Navigate to={defaultRoute(user.role)} replace />} />
      </Routes>
    </DesktopShell>
  );
}

function DistributionContent() {
  const { currentUser, isLoading } = useFrappeAuth();
  const publicDeliveryNote = new URLSearchParams(window.location.search).get("bl");
  if (publicDeliveryNote) return <PublicTrackingPage deliveryNote={publicDeliveryNote} />;
  if (isLoading) return <LoadingScreen />;
  if (!currentUser) return <LoginPage />;
  return <AuthenticatedApp currentUser={currentUser} />;
}

export default function App() {
  return (
    <FrappeProvider socketPort={import.meta.env.VITE_SOCKET_PORT} siteName={getSiteName()}>
      <TooltipProvider>
        <HashRouter>
          <DistributionContent />
          <Toaster />
        </HashRouter>
      </TooltipProvider>
    </FrappeProvider>
  );
}
