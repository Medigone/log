import "./App.css";
import React, { useEffect, useState } from "react";
import {
  FrappeProvider,
  useFrappeAuth,
  useFrappeGetDoc,
} from "frappe-react-sdk";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";
import Login from "./pages/auth/Login";
import ColisDetails from "./pages/colis/ColisDetails";
import ColisPublicView from "./pages/colis/ColisPublicView";

import { LivraisonsList, LivraisonDetails } from "./pages/livraisons";
import logoSvg from "./assets/IntraPro_fleetmaster.svg";

/* =========================
   Design tokens (dark)
   ========================= */
const brand = {
  pageBg: "#0b0b0c",
  surface: "#131416",
  surfaceSoft: "#0f1012",
  divider: "#1c1e22",
  cardBorder: "#222427",
  glow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 0 0 1px rgba(27,29,32,1)",
  textPrimary: "#e6e7ea",
  textMuted: "#9aa0a6",
  textSubtle: "#7a8087",
  brand: "#1e293b",
};

const tokens = {
  radius: 14,
  radiusLg: 16,
  padSm: 10,
  padMd: 14,
  padLg: 18,
  gapSm: 8,
  gapMd: 12,
  gapLg: 16,
};

/* =========================
   NavigationBar
   ========================= */
function NavigationBar({
  selectedColisId,
  selectedLivraisonId,
  onLogoClick,
}: {
  selectedColisId: string | null;
  selectedLivraisonId: string | null;
  onLogoClick: () => void;
}) {
  const { logout, currentUser } = useFrappeAuth();
  const { data: userData } = useFrappeGetDoc("User", currentUser || undefined);

  if (!currentUser) return null;

  const displayName =
    (userData as any)?.full_name ||
    (userData as any)?.email ||
    (currentUser as string);

  const handleLogout = async () => {
    try {
      await logout();
      window.location.reload();
    } catch (e) {
      console.error("Erreur de déconnexion:", e);
    }
  };

  return (
    <div className="border-b border-border">
      {/* Header line */}
      <div className="max-w-6xl mx-auto px-4 py-2.5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <img
              src={logoSvg}
              alt="IntraPro FleetMaster"
              style={{ height: 28, width: "auto", cursor: "pointer" }}
              onClick={onLogoClick}
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" />
              <span className="text-sm text-muted-foreground">
                Bonjour,{" "}
                <span className="text-foreground font-semibold">
                  {displayName}
                </span>
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs or back button */}
      <div className="max-w-6xl mx-auto px-4 pb-2.5">
        {/* Navigation supprimée - le logo gère le retour à la page principale */}
      </div>
    </div>
  );
}

/* =========================
   AppContent
   ========================= */
function AppContent() {
  const { currentUser, isLoading } = useFrappeAuth();
  const [selectedColisId, setSelectedColisId] = useState<string | null>(null);
  const [selectedLivraisonId, setSelectedLivraisonId] =
    useState<string | null>(null);
  const [activeView, setActiveView] =
    useState<"livraisons">("livraisons");
  const [currentLivraisonId, setCurrentLivraisonId] = useState<string | null>(null);

  const [isPublicAccess, setIsPublicAccess] = useState<boolean>(false);

  const returnToMainPage = () => {
    setSelectedColisId(null);
    setSelectedLivraisonId(null);
    setCurrentLivraisonId(null);
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const colisParam = urlParams.get("colis");
    const publicParam = urlParams.get("public");

    if (colisParam) {
      setSelectedColisId(colisParam);
      if (publicParam === "1" || !currentUser) {
        setIsPublicAccess(true);
      }
    }
  }, [currentUser]);

  // Loader dark
  if (isLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-background">
        <div className="bg-card rounded-lg p-6 shadow-lg text-center border">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white/40 mx-auto mb-3" />
          <span className="text-muted-foreground">Chargement…</span>
        </div>
      </div>
    );
  }

  // Public view direct
  if (isPublicAccess && selectedColisId) {
    return <ColisPublicView colisId={selectedColisId} />;
  }

  // Authenticated app
  if (currentUser) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationBar
          selectedColisId={selectedColisId}
          selectedLivraisonId={selectedLivraisonId}
          onLogoClick={returnToMainPage}
        />

        <div className="max-w-6xl mx-auto px-4 pt-4 pb-6">
          {selectedColisId ? (
            <ColisDetails 
              colisId={selectedColisId} 
              livraisonId={currentLivraisonId || undefined}
              onBackToLivraison={() => {
                setSelectedColisId(null);
                if (currentLivraisonId) {
                  setSelectedLivraisonId(currentLivraisonId);
                }
              }}
            />
          ) : selectedLivraisonId ? (
            <LivraisonDetails
              livraisonId={selectedLivraisonId}
              onBack={() => setSelectedLivraisonId(null)}
              onColisSelect={(colisId) => {
                setSelectedColisId(colisId);
                setCurrentLivraisonId(selectedLivraisonId);
              }}
            />
          ) : (
            <LivraisonsList onLivraisonSelect={setSelectedLivraisonId} />
          )}
        </div>
      </div>
    );
  }

  // If a colis is requested but user not logged-in => public view
  if (selectedColisId && !currentUser) {
    return <ColisPublicView colisId={selectedColisId} />;
  }

  // Login
  return <Login />;
}

/* =========================
   App Root
   ========================= */
function App() {
  const getSiteName = () => {
    // @ts-ignore
    if (
      (window as any).frappe?.boot?.versions?.frappe &&
      // @ts-ignore
      ((window as any).frappe.boot.versions.frappe.startsWith("15") ||
        // @ts-ignore
        (window as any).frappe.boot.versions.frappe.startsWith("16"))
    ) {
      // @ts-ignore
      return (window as any).frappe?.boot?.sitename ?? import.meta.env.VITE_SITE_NAME;
    }
    return import.meta.env.VITE_SITE_NAME;
  };

  return (
    <div className="dark">
      <FrappeProvider
        socketPort={import.meta.env.VITE_SOCKET_PORT}
        siteName={getSiteName()}
      >
        <AppContent />
      </FrappeProvider>
    </div>
  );
}

export default App;