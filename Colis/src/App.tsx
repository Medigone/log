import "./App.css";
import React, { useEffect, useState } from "react";
import {
  FrappeProvider,
  useFrappeAuth,
  useFrappeGetDoc,
} from "frappe-react-sdk";
import { HashRouter as Router, Routes, Route, useNavigate, useLocation, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, User, Truck, Home, RefreshCw } from "lucide-react";
import Login from "./pages/auth/Login";
import ColisDetails from "./pages/colis/ColisDetails";
import ColisPublicView from "./pages/colis/ColisPublicView";
import { Dashboard } from "./pages/dashboard";
import { SmartColisRouter } from "./components/SmartColisRouter";
import { useUserRole } from "./hooks/useUserRole";

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
   Sidebar Navigation
   ========================= */
function SidebarNavigation() {
  const { logout, currentUser } = useFrappeAuth();
  const { data: userData } = useFrappeGetDoc("User", currentUser || undefined);
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/' && location.hash === '';
    }
    if (path === '/livraisons') {
      return location.hash === '#/livraisons' || location.pathname === '/livraisons';
    }
    return location.hash === `#${path}` || location.pathname === path;
  };

  const handleNavClick = (path: string) => {
    navigate(path);
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-background border border-border rounded-lg shadow-lg"
      >
        <svg className="w-5 h-5 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isMobileMenuOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`w-52 h-screen bg-background border-r border-border flex flex-col fixed left-0 top-0 z-50 transition-transform duration-300 ${
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <img
            src={logoSvg}
            alt="IntraPro FleetMaster"
            style={{ height: 32, width: "auto" }}
          />
          
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        <button
          onClick={() => handleNavClick('/')}
          className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
            isActive('/')
              ? 'text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Home className="w-4 h-4" />
          Accueil
        </button>

        <button
          onClick={() => handleNavClick('/livraisons')}
          className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
            isActive('/livraisons')
              ? 'text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Truck className="w-4 h-4" />
          Livraisons
        </button>

        <button
          onClick={() => handleNavClick('/generation')}
          className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
            isActive('/generation')
              ? 'text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          Génération
        </button>
      </nav>

      {/* User Profile & Logout */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{(userData as any)?.email || currentUser}</p>
          </div>
        </div>
        
        <Button
          onClick={handleLogout}
          variant="outline"
          size="sm"
          className="w-full"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Déconnexion
        </Button>
      </div>
      </div>
    </>
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
      <div className="min-h-screen bg-background flex">
        <SidebarNavigation />
        <div className="flex-1 md:ml-52">
          <div className="max-w-6xl mx-auto px-4 pt-16 md:pt-4 pb-6">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/livraisons" element={<LivraisonsPage />} />
              <Route path="/generation" element={<GenerationLivraisons />} />
              <Route path="/livraison/:id" element={<LivraisonDetailsRoute />} />
              <Route path="/colis/:id" element={<ColisDetailsRoute />} />
              {/* Fallback route */}
              <Route path="*" element={<HomePage />} />
            </Routes>
          </div>
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
  return <Dashboard />;
}

function LivraisonsPage() {
  const navigate = useNavigate();
  
  return (
    <LivraisonsList 
      onLivraisonSelect={(id) => navigate(`/livraison/${id}`)} 
      onGenerateClick={() => navigate('/generation')}
    />
  );
}

function LivraisonDetailsRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  if (!id) {
    navigate('/livraisons');
    return null;
  }
  
  return (
    <LivraisonDetails
      livraisonId={id}
      onBack={() => navigate('/livraisons')}
      onColisSelect={(colisId) => navigate(`/colis/${colisId}?from=livraison&livraisonId=${id}`)}
    />
  );
}

function ColisDetailsRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useFrappeAuth();
  const userRole = useUserRole(currentUser);
  const { data: colisData, isLoading } = useFrappeGetDoc("Colis", id || undefined);
  
  if (!id) {
    navigate('/');
    return null;
  }
  
  const urlParams = new URLSearchParams(location.search);
  const fromLivraison = urlParams.get('from') === 'livraison';
  const livraisonId = urlParams.get('livraisonId');
  
  return (
    <SmartColisRouter
      colisId={id}
      livraisonId={livraisonId || undefined}
      colisData={colisData}
      currentUser={currentUser}
      userRole={userRole}
      isLoading={isLoading}
      onBackToLivraison={() => {
        if (fromLivraison && livraisonId) {
          navigate(`/livraison/${livraisonId}`);
        } else {
          navigate('/livraisons');
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