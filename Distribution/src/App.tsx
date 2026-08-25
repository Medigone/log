import { FrappeProvider, useFrappeAuth } from "frappe-react-sdk";
import { lazy, Suspense, type ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { LoaderCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PreparationPage } from "@/features/preparation/PreparationPage";
import { TodayPage } from "@/features/today/TodayPage";
import { useDistributionRole } from "@/features/auth/useDistributionRole";
import { LoginPage } from "@/features/auth/LoginPage";
import { PlanningPage } from "@/features/planning/PlanningPage";
import { DeliveriesPage } from "@/features/deliveries/DeliveriesPage";
import { DriverApp } from "@/features/driver/DriverApp";
import { PublicTrackingPage } from "@/features/tracking/PublicTrackingPage";
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
    <div className="grid min-h-screen place-items-center bg-slate-50">
      <div className="text-center text-slate-500">
        <LoaderCircle className="mx-auto mb-3 h-7 w-7 animate-spin text-blue-700" />
        <p className="text-sm font-medium">Chargement de Distribution…</p>
      </div>
    </div>
  );
}

function AccessDenied() {
  const { logout } = useFrappeAuth();
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-amber-600" />
        <h1 className="text-xl font-bold text-slate-950">Accès non configuré</h1>
        <p className="mt-2 text-sm text-slate-500">
          Votre compte doit recevoir un rôle Préparateur, Planificateur, Livreur ou Responsable.
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
  if (role === "preparateur") return "/preparation";
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
        <Route path="/today" element={<RoleGuard role={user.role} allowed={["planificateur", "responsable"]}><TodayPage /></RoleGuard>} />
        <Route path="/preparation" element={<RoleGuard role={user.role} allowed={["preparateur", "responsable"]}><PreparationPage /></RoleGuard>} />
        <Route path="/planning" element={<RoleGuard role={user.role} allowed={["planificateur", "responsable"]}><PlanningPage /></RoleGuard>} />
        <Route path="/planning/routes/:routeId" element={<RoleGuard role={user.role} allowed={["planificateur", "responsable"]}><Suspense fallback={<div className="grid min-h-80 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-blue-700" /></div>}><RouteDetailsPage /></Suspense></RoleGuard>} />
        <Route path="/deliveries" element={<RoleGuard role={user.role} allowed={["planificateur", "responsable"]}><DeliveriesPage /></RoleGuard>} />
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
      <HashRouter><DistributionContent /></HashRouter>
    </FrappeProvider>
  );
}
