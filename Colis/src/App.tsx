import "./App.css";
import React, { useEffect, useState } from "react";
import {
  FrappeProvider,
  useFrappeAuth,
  useFrappeGetDoc,
} from "frappe-react-sdk";
import { HashRouter as Router, Routes, Route, useNavigate, useLocation, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, User, Truck } from "lucide-react";
import Login from "./pages/auth/Login";
import ColisDetails from "./pages/colis/ColisDetails";
import ColisPublicView from "./pages/colis/ColisPublicView";

import { LivraisonsList, LivraisonDetails, GenerationLivraisons } from "./pages/livraisons";
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
function NavigationBar() {
  const { logout, currentUser } = useFrappeAuth();
  const { data: userData } = useFrappeGetDoc("User", currentUser || undefined);
  const navigate = useNavigate();
  const location = useLocation();

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
          <div className="flex items-center gap-6">
            <img
              src={logoSvg}
              alt="IntraPro FleetMaster"
              style={{ height: 28, width: "auto", cursor: "pointer" }}
              onClick={() => navigate('/')}
            />
            
            {/* Navigation tabs on the same line */}
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => navigate('/')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  location.hash === '#/' || location.hash === '' || location.pathname === '/'
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Accueil
              </button>
              
              <span className="text-muted-foreground">•</span>
              
              <button
                onClick={() => navigate('/generation')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  location.hash === '#/generation'
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Génération Livraisons
              </button>
            </div>
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
    </div>
  );
}

/* =========================
   AppContent with Router
   ========================= */
function AppContent() {
  const { currentUser, isLoading } = useFrappeAuth();
  const [isPublicAccess, setIsPublicAccess] = useState<boolean>(false);
  const location = useLocation();

  // Apply dark theme
  useEffect(() => {
    document.body.classList.add('dark');
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const colisParam = urlParams.get("colis");
    const publicParam = urlParams.get("public");

    if (colisParam && (publicParam === "1" || !currentUser)) {
      setIsPublicAccess(true);
    }
  }, [currentUser, location.search]);

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

  // Public view for colis
  if (isPublicAccess) {
    const urlParams = new URLSearchParams(location.search);
    const colisParam = urlParams.get("colis");
    if (colisParam) {
      return <ColisPublicView colisId={colisParam} />;
    }
  }

  // Authenticated app with router
  if (currentUser) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationBar />
        <div className="max-w-6xl mx-auto px-4 pt-4 pb-6">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/generation" element={<GenerationLivraisons />} />
            <Route path="/livraison/:id" element={<LivraisonDetailsRoute />} />
            <Route path="/colis/:id" element={<ColisDetailsRoute />} />
            {/* Fallback route */}
            <Route path="*" element={<HomePage />} />
          </Routes>
        </div>
      </div>
    );
  }

  // If a colis is requested but user not logged-in => public view
  const urlParams = new URLSearchParams(location.search);
  const colisParam = urlParams.get("colis");
  if (colisParam && !currentUser) {
    return <ColisPublicView colisId={colisParam} />;
  }

  // Login
  return <Login />;
}

/* =========================
   Route Components
   ========================= */
function HomePage() {
  const navigate = useNavigate();
  
  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Livraisons</h1>
      </div>
      <LivraisonsList 
        onLivraisonSelect={(id) => navigate(`/livraison/${id}`)} 
        onGenerateClick={() => navigate('/generation')}
      />
    </>
  );
}

function LivraisonDetailsRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  if (!id) {
    navigate('/');
    return null;
  }
  
  return (
    <LivraisonDetails
      livraisonId={id}
      onBack={() => navigate('/')}
      onColisSelect={(colisId) => navigate(`/colis/${colisId}?from=livraison&livraisonId=${id}`)}
    />
  );
}

function ColisDetailsRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  
  if (!id) {
    navigate('/');
    return null;
  }
  
  const urlParams = new URLSearchParams(location.search);
  const fromLivraison = urlParams.get('from') === 'livraison';
  const livraisonId = urlParams.get('livraisonId');
  
  return (
    <ColisDetails 
      colisId={id} 
      livraisonId={livraisonId || undefined}
      onBackToLivraison={() => {
        if (fromLivraison && livraisonId) {
          navigate(`/livraison/${livraisonId}`);
        } else {
          navigate('/');
        }
      }}
    />
  );
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
        <Router>
          <AppContent />
        </Router>
      </FrappeProvider>
    </div>
  );
}

export default App;