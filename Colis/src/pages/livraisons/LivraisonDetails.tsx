import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Package,
  Dot,
  AlertTriangle,
  Clipboard,
  ArrowLeft,
  User,
  Truck,
  Calendar,
  ChevronDown,
  ChevronRight,
  CreditCard,
  DollarSign,
  PackageCheck,
  AlertCircle
} from 'lucide-react';
import { useFrappeGetDoc, useFrappeGetDocList, useFrappeDocTypeEventListener, useFrappePostCall } from 'frappe-react-sdk';
import type { Livraison, LivraisonColis, LivraisonBonDeLivraison } from '../../types/Livraison';
import PaiementClientDialog from '../../components/PaiementClientDialog';
import PaiementActionsDialog from '../../components/PaiementActionsDialog';

interface LivraisonDetailsProps {
  livraisonId: string;
  onBack?: () => void;
  onColisSelect?: (colisId: string) => void;
}

/* =========================
   Types
   ========================= */
interface LivraisonData {
  name: string;
  date_liv: string;
  status: string;
  livreur?: string;
  nom_livreur?: string;
  vehicule?: string;
  total_articles?: number;
  total_montant_a_encaisser?: number;
  total_paiements?: number;
  solde_restant?: number;
  creation?: string;
  modified?: string;
  owner?: string;
  colis?: LivraisonColis[];
  bons_de_livraison?: LivraisonBonDeLivraison[];
}



/* =========================
   Helpers
   ========================= */
type BadgeColor = "gray" | "blue" | "cyan" | "orange" | "yellow" | "green" | "red";

function formatDate(dateStr?: string) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatAmount(amount: number | undefined) {
  if (!amount) return "0,00 DZD";
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount) + ' DZD';
}

function statusToColor(status?: string): BadgeColor {
  switch (status) {
    case "Livré":
    case "Delivered":
      return "green";
    case "Partiellement Livré":
    case "Partially Delivered":
      return "yellow";
    case "Enlevé":
    case "To Deliver":
      return "orange";
    case "Partiellement Enlevé":
      return "yellow";
    case "Préparé":
      return "cyan";
    case "Partiellement Préparé":
      return "blue";
    case "Annulé":
    case "Cancelled":
      return "red";
    case "Nouveau":
    case "Brouillon":
    case "Draft":
    case "New":
      return "blue";  // Draft/Nouveau/Brouillon status in blue
    case "À facturer":
    case "To Bill":
      return "orange";  // To Bill status in Frappe
    case "Terminé":
    case "Completed":
      return "green";   // Completed status in Frappe
    case "Retour émis":
    case "Return Issued":
      return "gray";   // Return Issued status in Frappe
    case "Fermé":
    case "Closed":
      return "green";  // Closed status in Frappe
    default:
      return "gray";
  }
}

// Fonction pour traduire les statuts en français
function translateStatus(status?: string): string {
  if (!status) return "Nouveau";
  
  const translations: Record<string, string> = {
    "Draft": "Brouillon",
    "To Deliver": "À Livrer",
    "Delivered": "Livré",
    "Partially Delivered": "Partiellement Livré",
    "Cancelled": "Annulé",
    "Closed": "Fermé",
    "Submitted": "Soumis",
    "New": "Nouveau",
    "Nouveau": "Nouveau",
    "Livré": "Livré",
    "Partiellement Livré": "Partiellement Livré",
    "Enlevé": "Enlevé",
    "Partiellement Enlevé": "Partiellement Enlevé",
    "Préparé": "Préparé",
    "Partiellement Préparé": "Partiellement Préparé",
    "Annulé": "Annulé"
  };
  
  return translations[status] || status;
}

/* Badge dark mode contrasté */
function StatusBadge({ text, tone }: { text?: string; tone: BadgeColor }) {
  const toneClasses = {
    gray: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-800",
    blue: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800",
    cyan: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-800",
    orange: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800",
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800",
    green: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800",
    red: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800",
  };
  
  return text ? (
    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${toneClasses[tone]}`}>
      {text}
    </span>
  ) : null;
}

/* Chips */
function MetaChip({
  icon,
  label,
  value,
  title,
}: {
  icon: React.ReactNode;
  label?: string;
  value: React.ReactNode;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-gray-50 text-gray-500 border border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-600"
    >
      <span
        aria-hidden
        className="flex items-center justify-center w-4 h-4 text-current"
      >
        {icon}
      </span>
      <span className="inline-flex items-center gap-1.5 text-current text-sm">
        {label && (
          <span className="font-medium opacity-80">
            {label}
          </span>
        )}
        <span className="font-semibold">{value}</span>
      </span>
    </div>
    );
  }

/* =========================
   Component
   ========================= */
const LivraisonDetails = ({ livraisonId, onBack, onColisSelect }: LivraisonDetailsProps) => {
  // État pour gérer l'ouverture/fermeture des bons de livraison (accordéon)
  const [expandedBons, setExpandedBons] = useState<Set<string>>(new Set());
  // État pour gérer l'affichage de la liste des paiements
  const [showPaiements, setShowPaiements] = useState(false);
  // État pour gérer l'affichage des articles non emballés
  const [showUnpackedItems, setShowUnpackedItems] = useState<Record<string, boolean>>({});
  // État pour stocker les articles non emballés par bon de livraison
  const [unpackedItemsData, setUnpackedItemsData] = useState<Record<string, any[]>>({});

  // Fonction pour basculer l'état d'un bon de livraison
  const toggleBonExpansion = (bonId: string) => {
    setExpandedBons(prev => {
      const newSet = new Set(prev);
      if (newSet.has(bonId)) {
        newSet.delete(bonId);
      } else {
        newSet.add(bonId);
      }
      return newSet;
    });
  };

  // Fonction pour basculer l'affichage des articles non emballés
  const toggleUnpackedItems = async (bonId: string) => {
    const isCurrentlyShown = showUnpackedItems[bonId];
    
    if (!isCurrentlyShown && !unpackedItemsData[bonId]) {
      // Récupérer les articles non emballés si pas encore chargés
      try {
        const response = await fetch('/api/method/log.delivery_note_hooks.get_unpacked_items', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Frappe-CSRF-Token': (window as any).csrf_token
          },
          body: JSON.stringify({
            delivery_note_name: bonId
          })
        });
        const data = await response.json();
        if (data.message) {
          setUnpackedItemsData(prev => ({
            ...prev,
            [bonId]: data.message
          }));
        }
      } catch (error) {
        console.error('Erreur lors de la récupération des articles non emballés:', error);
      }
    }
    
    setShowUnpackedItems(prev => ({
      ...prev,
      [bonId]: !isCurrentlyShown
    }));
  };

  // Récupération des détails de la livraison
  const { data: livraison, mutate: mutateLivraison, error, isLoading } = useFrappeGetDoc<LivraisonData>(
    "Livraison",
    livraisonId,
    {
      fields: [
        "name",
        "status",
        "date_liv",
        "livreur",
        "nom_livreur",
        "vehicule",
        "total_articles",
        "total_montant_a_encaisser",
        "colis",
        "bons_de_livraison"
      ],
    }
  );

  // Récupération du nom du véhicule si un véhicule est assigné
  const { data: vehiculeData } = useFrappeGetDoc<any>('Vehicule', livraison?.vehicule || '', {
    fields: ['name', 'nom'],
    enabled: !!livraison?.vehicule
  });

  // Récupération des paiements liés à cette livraison
  const { data: paiements, mutate: mutatePaiements } = useFrappeGetDocList<any>('Paiement Client', {
    fields: ['name', 'client', 'nom_client', 'montant', 'moyen_paiement', 'date', 'recu', 'photo_cheque', 'bon_livraison'],
    filters: [['livraison', '=', livraisonId]],
    limit: 1000
  });

  // Calcul du montant total des paiements
  const totalPaiements = useMemo(() => {
    if (!paiements) return 0;
    return paiements.reduce((total, paiement) => total + (paiement.montant || 0), 0);
  }, [paiements]);

  // Calcul du solde restant
  const soldeRestant = useMemo(() => {
    const montantAEncaisser = livraison?.total_montant_a_encaisser || 0;
    return montantAEncaisser - totalPaiements;
  }, [livraison?.total_montant_a_encaisser, totalPaiements]);

  // Récupération des communes pour mapper les IDs aux noms
  const { data: communesData } = useFrappeGetDocList<any>('Commune', {
    fields: ['name', 'nom'],
    limit: 5000
  });

  // Récupération spécifique des communes manquantes
  const { data: communesManquantes } = useFrappeGetDocList<any>('Commune', {
    fields: ['name', 'nom'],
    filters: [['name', 'in', ['COM-00979', 'COM-01131']]],
    limit: 10
  });

  // Création d'un mapping des communes
  const communesMapping = React.useMemo(() => {
    if (!communesData) return {};
    const mapping = communesData.reduce((acc, commune) => {
      acc[commune.name] = commune.nom;
      return acc;
    }, {} as Record<string, string>);
    
    if (communesManquantes) {
      communesManquantes.forEach(commune => {
        mapping[commune.name] = commune.nom;
      });
    }
    
    return mapping;
  }, [communesData, communesManquantes]);

  // Extraction des données des tables enfants
  const livraisonBonsLivraison = livraison?.bons_de_livraison || [];

  // Récupération des colis liés à cette livraison
  const { data: colisData, mutate: mutateColis } = useFrappeGetDocList<any>('Colis', {
    fields: [
      'name',
      'custom_numero_sequence',
      'status',
      'client',
      'date_creation',
      'bl',
      'articles',
      'total_art'
    ],
    filters: livraisonBonsLivraison.length > 0 ? [['bl', 'in', livraisonBonsLivraison.map(bon => bon.bon_de_livraison)]] : [],
    limit: 1000
  });

  // Écouter les changements en temps réel
  useFrappeDocTypeEventListener('Livraison', (d) => {
    if (d.name === livraisonId) {
      mutateLivraison();
    }
  });

  useFrappeDocTypeEventListener('Colis', () => {
    mutateColis();
  });

  // Calcul des statistiques
  const stats = React.useMemo(() => {
    const colisToUse = colisData || [];
    
    if (colisToUse.length === 0) return null;
    
    const statusCounts = colisToUse.reduce((acc, colis) => {
      acc[colis.status] = (acc[colis.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const uniqueClients = new Set(colisToUse.map(c => c.client).filter(Boolean));

    const totalArticles = colisToUse.reduce((total, colis) => {
      return total + (colis.total_art || 0);
    }, 0);

    // Calcul des communes uniques à partir des bons de livraison
    const uniqueCommunes = new Set(
      livraisonBonsLivraison
        .map(bon => bon.custom_commune)
        .filter(Boolean)
    );

    return {
      totalColis: colisToUse.length,
      totalArticles,
      statusCounts,
      uniqueClients: uniqueClients.size,
      uniqueCommunes: uniqueCommunes.size
    };
  }, [colisData, livraisonBonsLivraison]);

  if (isLoading)
    return (
      <div className="w-full min-h-screen flex items-center justify-center px-4 bg-background">
    <div className="bg-card rounded-md p-5 shadow-2xl border border-border">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white/40 mx-auto mb-3" />
      <span className="text-muted-foreground">Chargement…</span>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="w-full min-h-screen flex items-center justify-center px-4 bg-background">
    <div className="bg-card rounded-md p-5 shadow-2xl border border-border max-w-md w-full">
          <Alert className="border-red-500/50 bg-red-500/10">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-200">
              Erreur lors du chargement: {String((error as any)?.message || error)}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );

  if (!livraison)
    return (
      <div className="w-full min-h-screen flex items-center justify-center px-4 bg-background">
        <div className="bg-card rounded-md p-5 shadow-2xl border border-border">
          <span className="text-muted-foreground">
            Aucune donnée disponible pour cette livraison.
          </span>
        </div>
      </div>
    );

  return (
    <div className="bg-background min-h-screen">
    {/* Header */}
    <div className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap justify-between">
            <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
              <span>Livraison</span>
              <Dot className="w-4 h-4" />
              <span>Détails</span>
            </div>
            <div className="flex items-center gap-3">
              {livraison.name && (
                <button className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/30">
                  <Clipboard className="w-3 h-3" />
                  <span className="text-xs font-medium">Livraison {livraison.name}</span>
                </button>
              )}
              <StatusBadge
                text={livraison.status}
                tone={statusToColor(livraison.status)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-8">
        {/* Meta chips */}
        <div className="bg-card/50 rounded-md border border-border shadow-2xl p-4 mb-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <MetaChip
              icon={<Calendar className="w-4 h-4" />}
              label="Date"
              value={formatDate(livraison.date_liv)}
            />
            <MetaChip
              icon={<User className="w-4 h-4" />}
              label="Livreur"
              value={livraison.nom_livreur || livraison.livreur || "—"}
            />
            <MetaChip
              icon={<Truck className="w-4 h-4" />}
              label="Véhicule"
              value={vehiculeData?.nom || livraison.vehicule || "—"}
            />
            <MetaChip
              icon={<Package className="w-4 h-4" />}
              label="Articles"
              value={livraison.total_articles || 0}
            />
          </div>
        </div>

        {/* Informations générales */}
        <div className="bg-card rounded-md border border-border shadow-2xl overflow-hidden mb-5">
          {/* Vue desktop - En-tête horizontal */}
          <div className="hidden md:flex px-4 py-3 items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Informations générales</h2>
            <div className="flex items-center gap-2">
              {/* Bouton de navigation vers la préparation des colis */}
              <button 
                onClick={() => {
                  // Navigation vers la page de préparation des colis
                  window.location.href = `#/preparation?livraison=${livraisonId}`;
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/30 min-w-[140px] justify-center"
              >
                <PackageCheck className="w-4 h-4" />
                <span className="text-sm font-medium">Préparer colis</span>
              </button>
              {paiements && paiements.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setShowPaiements(!showPaiements)}
                  className="h-9 px-3 text-xs min-w-[140px]"
                >
                  <CreditCard className="w-3 h-3 mr-1" />
                  Voir paiements ({paiements.length})
                </Button>
              )}
              <PaiementClientDialog 
                livraisonId={livraisonId}
                onSuccess={() => {
                  // Refresh payments data after payment creation
                  mutatePaiements();
                }}
                trigger={
                  <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/30 min-w-[140px] justify-center">
                    <CreditCard className="w-4 h-4" />
                    <span className="text-sm font-medium">Saisir paiement</span>
                  </button>
                }
              />
            </div>
          </div>
          
          {/* Vue mobile - En-tête vertical */}
          <div className="md:hidden px-4 py-3">
            <h2 className="text-lg font-semibold text-foreground mb-3">Informations générales</h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
              {/* Bouton de navigation vers la préparation des colis - Mobile */}
              <button 
                onClick={() => {
                  // Navigation vers la page de préparation des colis
                  window.location.href = `#/preparation?livraison=${livraisonId}`;
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/30 w-full sm:flex-1 justify-center"
              >
                <PackageCheck className="w-4 h-4" />
                <span className="text-sm font-medium">Préparer colis</span>
              </button>
              {paiements && paiements.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setShowPaiements(!showPaiements)}
                  className="h-9 px-3 text-xs w-full sm:flex-1"
                >
                  <CreditCard className="w-3 h-3 mr-1" />
                  Voir paiements ({paiements.length})
                </Button>
              )}
              <PaiementClientDialog 
                livraisonId={livraisonId}
                onSuccess={() => {
                  // Refresh payments data after payment creation
                  mutatePaiements();
                }}
                trigger={
                  <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/30 w-full sm:flex-1 justify-center">
                    <CreditCard className="w-4 h-4" />
                    <span className="text-sm font-medium">Saisir paiement</span>
                  </button>
                }
              />
            </div>
          </div>
          <div className="border-t border-border"></div>
          <div className="p-4">
            {/* Vue desktop - Grid */}
            <div className="hidden md:block">
              {/* Première ligne - Informations générales */}
              <div className="grid grid-cols-3 gap-6 mb-6">
                <div className="grid gap-1.5">
                  <span className="text-sm text-muted-foreground">Articles</span>
                  <span className="text-lg font-bold text-foreground">
                    {stats?.totalArticles || 0}
                  </span>
                </div>
                <div className="grid gap-1.5">
                  <span className="text-sm text-muted-foreground">Clients</span>
                  <span className="text-lg font-bold text-foreground">
                    {stats?.uniqueClients || 0}
                  </span>
                </div>
                <div className="grid gap-1.5">
                  <span className="text-sm text-muted-foreground">Communes</span>
                  <span className="text-lg font-bold text-foreground">
                    {stats?.uniqueCommunes || 0}
                  </span>
                </div>
              </div>
              
              {/* Séparateur */}
              <div className="border-t border-border mb-6"></div>
              
              {/* Deuxième ligne - Informations financières */}
              <div className="grid grid-cols-3 gap-6">
                <div className="grid gap-1.5">
                  <span className="text-sm text-muted-foreground">Total à encaisser</span>
                  <span className="text-lg font-bold text-green-400">
                    {formatAmount(livraison.total_montant_a_encaisser)}
                  </span>
                </div>
                <div className="grid gap-1.5">
                  <span className="text-sm text-muted-foreground">Paiements reçus</span>
                  <span className="text-lg font-bold text-blue-400">
                    {formatAmount(totalPaiements)}
                  </span>
                </div>
                <div className="grid gap-1.5">
                  <span className="text-sm text-muted-foreground">Solde restant</span>
                  <span className={`text-lg font-bold ${
                    soldeRestant > 0 ? 'text-orange-400' : 'text-green-400'
                  }`}>
                    {formatAmount(soldeRestant)}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Vue mobile - Cartes */}
            <div className="md:hidden">
              {/* Informations générales */}
              <div className="space-y-3 mb-6">
                <div className="bg-card/50 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Articles</span>
                    <span className="text-lg font-bold text-foreground">
                      {stats?.totalArticles || 0}
                    </span>
                  </div>
                </div>
                <div className="bg-card/50 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Clients</span>
                    <span className="text-lg font-bold text-foreground">
                      {stats?.uniqueClients || 0}
                    </span>
                  </div>
                </div>
                <div className="bg-card/50 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Communes</span>
                    <span className="text-lg font-bold text-foreground">
                      {stats?.uniqueCommunes || 0}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Séparateur */}
              <div className="border-t border-border mb-6"></div>
              
              {/* Informations financières */}
              <div className="space-y-3">
                <div className="bg-card/50 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total à encaisser</span>
                    <span className="text-lg font-bold text-green-400">
                      {formatAmount(livraison.total_montant_a_encaisser)}
                    </span>
                  </div>
                </div>
                <div className="bg-card/50 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Paiements reçus</span>
                    <span className="text-lg font-bold text-blue-400">
                      {formatAmount(totalPaiements)}
                    </span>
                  </div>
                </div>
                <div className="bg-card/50 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Solde restant</span>
                    <span className={`text-lg font-bold ${
                      soldeRestant > 0 ? 'text-orange-400' : 'text-green-400'
                    }`}>
                      {formatAmount(soldeRestant)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Liste des Paiements */}
        {showPaiements && paiements && paiements.length > 0 && (
          <div className="bg-card rounded-md border border-border shadow-2xl overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-border bg-muted/50">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2 text-foreground">
                  <CreditCard className="w-5 h-5 text-blue-500" />
                  Paiements reçus ({paiements.length})
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPaiements(false)}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            {/* Vue en cartes pour toutes les tailles d'écran */}
            <div className="p-3">
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-3">
                {paiements.map((paiement) => (
                  <div key={paiement.name} className="bg-card/50 rounded-md border border-border p-3 hover:border-blue-400 transition-all duration-200">
                    {/* En-tête avec client, montant et actions */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-foreground text-sm truncate">{paiement.nom_client || paiement.client}</div>
                        <div className="text-xs text-muted-foreground truncate">{paiement.client}</div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <span className="font-semibold text-green-500 text-sm">
                          {formatAmount(paiement.montant)}
                        </span>
                        <PaiementActionsDialog
                          paiement={paiement}
                          onSuccess={() => {
                            mutatePaiements();
                            mutateLivraison();
                          }}
                        />
                      </div>
                    </div>
                    
                    {/* Détails du paiement */}
                    <div className="grid grid-cols-1 gap-2 pt-2 border-t border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Moyen</span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                          paiement.moyen_paiement === 'Espèce' 
                            ? 'bg-green-500/20 text-green-400' 
                            : 'bg-blue-500/20 text-blue-400'
                        }`}>
                          {paiement.moyen_paiement}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Date</span>
                        <span className="text-xs text-foreground">
                          {formatDate(paiement.date)}
                        </span>
                      </div>
                    </div>
                    
                    {/* Fichiers */}
                    {(paiement.recu || paiement.photo_cheque) && (
                      <div className="mt-2 pt-2 border-t border-border">
                        <div className="flex gap-1 flex-wrap">
                          {paiement.recu && (
                            <a
                              href={paiement.recu}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs hover:bg-blue-500/30 transition-colors"
                            >
                              Reçu
                            </a>
                          )}
                          {paiement.photo_cheque && (
                            <a
                              href={paiement.photo_cheque}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs hover:bg-blue-500/30 transition-colors"
                            >
                              Photo
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Bons de Livraison et Colis */}
        <div className="bg-card rounded-md border border-border shadow-2xl overflow-hidden">
          <div className="px-4 py-3">
            <h2 className="text-lg font-semibold text-foreground">Bons de Livraison et Colis</h2>
          </div>
          <div className="border-t border-border"></div>

          {livraisonBonsLivraison.length > 0 ? (
            <div className="space-y-4 p-4">
              {livraisonBonsLivraison.map((bonLivraison) => {
                const colisDuBon = (colisData || []).filter(
                  colis => colis.bl === bonLivraison.bon_de_livraison
                );
                const isExpanded = expandedBons.has(bonLivraison.bon_de_livraison);

                return (
                  <div 
                    key={bonLivraison.name}
                    className="bg-card/50 rounded-md border border-border overflow-hidden hover:border-blue-400 transition-all duration-200"
                  >
                    {/* En-tête du bon de livraison - Cliquable */}
                    <div 
                      className="p-4 cursor-pointer hover:bg-accent/30 transition-colors duration-200"
                      onClick={() => toggleBonExpansion(bonLivraison.bon_de_livraison)}
                    >
                      <div className="mb-4">
                        {/* Titre du bon de livraison avec icône chevron */}
                        <div className="mb-3 flex items-center justify-between">
                          <button className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/30">
                            <Clipboard className="w-3 h-3" />
                            <span className="text-xs font-medium">{bonLivraison.bon_de_livraison}</span>
                          </button>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {colisDuBon.length} colis
                            </span>
                            {isExpanded ? (
                              <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform duration-200" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform duration-200" />
                            )}
                          </div>
                        </div>
                        
                        {/* Informations client et date + Badge */}
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <div className="mt-1">
                            <span className="text-xs text-muted-foreground">
                              Client : {bonLivraison.customer || 'Non défini'} | 
                              Date : {bonLivraison.custom_date_de_livraison ? formatDate(bonLivraison.custom_date_de_livraison) : 'Non définie'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <StatusBadge
                              text={translateStatus(bonLivraison.status || 'Nouveau')}
                              tone={statusToColor(bonLivraison.status)}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Détails du bon de livraison - Toujours visible */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-4 pb-2 border-t border-border mb-2">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">Commune</span>
                            <span className="text-sm text-foreground">
                            {(() => {
                              const communeId = bonLivraison.custom_commune;
                              const communeName = communeId ? communesMapping[communeId] : null;
                              return communeId && communeName ? communeName : communeId || '-';
                            })()}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">Wilaya</span>
                            <span className="text-sm text-foreground">{bonLivraison.custom_wilaya || '-'}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">Quantité</span>
                            <span className="text-sm text-foreground">{bonLivraison.total_qty || 0}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">Montant</span>
                            <span className="text-sm text-foreground">{formatAmount(bonLivraison.grand_total)}</span>
                        </div>
                      </div>
                      
                      {/* Bouton pour afficher les articles non emballés */}
                      <div className="pt-2 border-t border-border">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleUnpackedItems(bonLivraison.name)}
                          className="flex items-center gap-2 text-xs"
                        >
                          <AlertCircle className="w-4 h-4" />
                          {showUnpackedItems[bonLivraison.name] ? 'Masquer' : 'Voir'} les articles non emballés
                          {showUnpackedItems[bonLivraison.name] ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      
                      {/* Affichage des articles non emballés */}
                      {showUnpackedItems[bonLivraison.name] && unpackedItemsData[bonLivraison.name] && (
                        <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                          <h4 className="text-sm font-medium text-orange-800 mb-3 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            Articles non emballés
                          </h4>
                          {unpackedItemsData[bonLivraison.name].length > 0 ? (
                            <div className="space-y-2">
                              {unpackedItemsData[bonLivraison.name].map((item: any, index: number) => (
                                <div key={index} className="flex justify-between items-center p-2 bg-white rounded border">
                                  <div className="flex-1">
                                    <div className="text-sm font-medium text-gray-900">{item.item_code}</div>
                                    <div className="text-xs text-gray-600">{item.description}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm font-medium text-orange-600">
                                      {item.remaining_qty} / {item.total_qty}
                                    </div>
                                    <div className="text-xs text-gray-500">non emballé / total</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-green-600 flex items-center gap-2">
                              <PackageCheck className="w-4 h-4" />
                              Tous les articles sont emballés
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Liste des colis - Affichage conditionnel avec animation */}
                    {isExpanded && colisDuBon.length > 0 ? (
                      <div className="animate-in slide-in-from-top-4 duration-500">
                        <div className="border-t border-border"></div>
                        
                        {/* Vue en cartes pour toutes les tailles d'écran */}
                        <div className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {colisDuBon.map((colis) => {
                              const statusColor = statusToColor(colis.status);
                              const statusColorMap: Record<BadgeColor, string> = {
                                gray: "#334155",
                                blue: "#3b82f6",
                                cyan: "#06b6d4",
                                orange: "#f59e0b",
                                yellow: "#eab308",
                                green: "#22c55e",
                                red: "#ef4444",
                              };
                              const borderColor = statusColorMap[statusColor];
                              
                              return (
                                <div
                                  key={colis.name}
                                  className="bg-card/50 rounded-md border cursor-pointer transition-all duration-200 p-4 hover:bg-accent/50 hover:-translate-y-0.5 hover:border-blue-400"
                                  style={{
                                    borderColor: borderColor,
                                  }}
                                  onClick={() => onColisSelect?.(colis.name)}
                                >
                                  {/* En-tête de la carte */}
                                  <div className="mb-3">
                                    {/* Nom du colis et statut */}
                                    <div className="mb-2">
                                      <button className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/30 mb-2">
                                        <Package className="w-3 h-3" />
                                        <span className="text-xs font-medium">{colis.name}</span>
                                      </button>
                                      {/* Statut sous l'ID en badge */}
                                       <div>
                                         <StatusBadge
                                           text={translateStatus(colis.status)}
                                           tone={statusToColor(colis.status)}
                                         />
                                       </div>
                                    </div>
                                    
                                    {/* Numéro de séquence */}
                                    <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-gray-50 text-gray-500 border border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-600">
                                      <span className="text-xs font-medium">N° {colis.custom_numero_sequence || colis.numero_sequence || '—'}</span>
                                    </div>
                                  </div>

                                  {/* Informations du colis */}
                                  <div className="space-y-2">
                                    <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-gray-50 text-gray-500 border border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-600">
                                      <User className="w-3 h-3 text-current flex-shrink-0" />
                                      <span className="text-xs font-medium truncate">
                                        {colis.client || '—'}
                                      </span>
                                    </div>
                                    
                                    {colis.total_art && (
                                      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-gray-50 text-gray-500 border border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-600">
                                        <Package className="w-3 h-3 text-current flex-shrink-0" />
                                        <span className="text-xs font-medium">
                                          {colis.total_art} articles
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : isExpanded && colisDuBon.length === 0 ? (
                      <div className="p-6 text-center animate-in fade-in duration-300">
                        <Package className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Aucun colis pour ce bon de livraison</span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center">
              <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <span className="text-muted-foreground">Aucun bon de livraison dans cette livraison</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LivraisonDetails;