import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Search as SearchIcon,
  AlertTriangle as AlertTriangleIcon,
  Dot as DotIcon,
  Truck,
  Grid3X3,
  List
} from 'lucide-react';
import { useFrappeGetDocList, useFrappeDocTypeEventListener } from 'frappe-react-sdk';

/* =========================
   Types
   ========================= */
interface LivraisonColis {
  name: string;
  colis: string;
  numero_sequence?: string;
  client?: string;
  bon_de_livraison?: string;
  status: string;
}

interface LivraisonBonDeLivraison {
  name: string;
  bon_de_livraison: string;
  customer?: string;
  custom_date_de_livraison?: string;
  custom_commune?: string;
  custom_wilaya?: string;
  custom_nom_livreur?: string;
  custom_vehicule?: string;
  custom_nombre_colis?: number;
  grand_total?: number;
  total_qty?: number;
  status?: string;
  type?: string;
}

interface Livraison {
  name: string;
  date_liv: string;
  status: string;
  livreur?: string;
  vehicule?: string;
  total_colis?: number;
  total_montant_a_encaisser?: number;
  total_paiements?: number;
  solde_restant?: number;
  creation?: string;
  modified?: string;
  colis?: LivraisonColis[];
  bons_de_livraison?: LivraisonBonDeLivraison[];
}

interface LivraisonsListProps {
  onLivraisonSelect?: (livraisonId: string) => void;
  onGenerateClick?: () => void;
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
    case "Fermé":
    case "Closed":
      return "green";
    case "Nouveau":
    case "Brouillon":
    case "Draft":
    case "New":
      return "blue";  // Draft/Nouveau/Brouillon status in blue
    default:
      return "gray";
  }
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
const LivraisonsList = ({ onLivraisonSelect, onGenerateClick }: LivraisonsListProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [livreurFilter, setLivreurFilter] = useState('');
  const [vehiculeFilter, setVehiculeFilter] = useState('');
  const [pageLimitStart, setPageLimitStart] = useState(0);
  const [livraisonsWithDetails, setLivraisonsWithDetails] = useState<Livraison[]>([]);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const [livreurFilterOpen, setLivreurFilterOpen] = useState(false);
  const [vehiculeFilterOpen, setVehiculeFilterOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() => {
    // Default to cards on mobile, table on desktop
    return window.innerWidth < 768 ? 'cards' : 'table';
  });

  // Handle window resize to switch view mode automatically
  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 768;
      setViewMode(isMobile ? 'cards' : 'table');
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Filtres pour les livraisons (sans le filtre bon de livraison côté serveur)
  const filters = useMemo(() => {
    const f: any[] = [];
    if (statusFilter && statusFilter !== 'all') {
      f.push(['status', '=', statusFilter]);
    }
    if (dateFilter) {
      f.push(['date_liv', '=', dateFilter]);
    }
    if (livreurFilter && livreurFilter !== 'all') {
      f.push(['livreur', '=', livreurFilter]);
    }
    if (vehiculeFilter && vehiculeFilter !== 'all') {
      f.push(['vehicule', '=', vehiculeFilter]);
    }
    // Le filtre bon de livraison sera appliqué côté client
    return f;
  }, [statusFilter, dateFilter, livreurFilter, vehiculeFilter]);

  // Récupération des livraisons
  const { data: livraisonsData, mutate: mutateLivraisons, error, isLoading } = useFrappeGetDocList<Livraison>('Livraison', {
    fields: [
      'name',
      'date_liv',
      'status',
      'livreur',
      'vehicule',
      'total_colis',
      'total_montant_a_encaisser',
      'total_paiements',
      'solde_restant',
      'creation',
      'modified'
    ],
    filters: filters,
    limit: 20,
    limit_start: pageLimitStart,
    orderBy: {
      field: 'creation',
      order: 'desc'
    }
  });

  // Effet pour recharger les données quand les filtres côté serveur changent
  useEffect(() => {
    mutateLivraisons();
  }, [pageLimitStart, statusFilter, dateFilter, livreurFilter, vehiculeFilter, mutateLivraisons]);

  // Récupération des colis pour toutes les livraisons (temporairement désactivée)
  const colisData: any[] = [];
  const mutateAllColis = () => {};
  
  // const { data: colisData, mutate: mutateAllColis } = useFrappeGetDocList<{
  //   name: string;
  //   custom_numero_sequence?: string;
  //   status: string;
  //   client?: string;
  //   date_creation?: string;
  //   bl?: string;
  //   articles?: string;
  // }>('Colis', {
  //   fields: [
  //     'name',
  //     'custom_numero_sequence',
  //     'status',
  //     'client',
  //     'date_creation',
  //     'bl',
  //     'articles'
  //   ],
  //   filters: livraisonsData && livraisonsData.length > 0 ? [['bl', 'in', livraisonsData.map(l => l.name)]] : [['bl', '=', 'dummy_value_to_prevent_error']],
  //   limit: 1000
  // });

  // Récupération des bons de livraison pour toutes les livraisons (temporairement désactivée)
  const bonsLivraisonData: any[] = [];
  const mutateBonsLivraison = () => {};
  
  // const { data: bonsLivraisonData, mutate: mutateBonsLivraison } = useFrappeGetDocList<{
  //   name: string;
  //   parent: string;
  //   bon_de_livraison: string;
  //   customer?: string;
  //   custom_date_de_livraison?: string;
  //   total_qty?: number;
  //   grand_total?: number;
  //   status?: string;
  // }>('Livraison Bon de Livraison', {
  //   fields: [
  //     'name',
  //     'parent',
  //     'bon_de_livraison',
  //     'customer',
  //     'custom_date_de_livraison',
  //     'total_qty',
  //     'grand_total',
  //     'status'
  //   ],
  //   filters: livraisonsData && livraisonsData.length > 0 ? [['parent', 'in', livraisonsData.map(l => l.name)]] : [['parent', '=', 'dummy_value_to_prevent_error']],
  //   limit: 1000
  // });

  // Récupération des véhicules pour mapper les IDs aux noms
  const { data: vehiculesData } = useFrappeGetDocList<{
    name: string;
    nom: string;
  }>('Vehicule', {
    fields: ['name', 'nom'],
    limit: 1000
  });

  // Récupération des livreurs pour mapper les IDs aux noms
  const { data: livreursData } = useFrappeGetDocList<{
    name: string;
    nom: string;
  }>('Livreur', {
    fields: ['name', 'nom'],
    limit: 1000
  });

  // Création des mappings
  const vehiculesMapping = React.useMemo(() => {
    if (!vehiculesData) return {};
    return vehiculesData.reduce((acc, vehicule) => {
      acc[vehicule.name] = vehicule.nom;
      return acc;
    }, {} as Record<string, string>);
  }, [vehiculesData]);

  const livreursMapping = React.useMemo(() => {
    if (!livreursData) return {};
    return livreursData.reduce((acc, livreur) => {
      acc[livreur.name] = livreur.nom;
      return acc;
    }, {} as Record<string, string>);
  }, [livreursData]);

  // Écouter les changements sur les doctypes
  useFrappeDocTypeEventListener('Livraison', () => {
    mutateLivraisons();
  });

  // Temporairement désactivé
  // useFrappeDocTypeEventListener('Colis', () => {
  //   mutateAllColis();
  // });

  // useFrappeDocTypeEventListener('Livraison Bon de Livraison', () => {
  //   mutateBonsLivraison();
  // });

  // Combiner les livraisons avec leurs données enfants
  useEffect(() => {
    if (livraisonsData) {
      const enriched = livraisonsData.map(livraison => {
        const livraisonColis = colisData ? colisData.filter(colis => colis.bl === livraison.name) : [];
        const livraisonBons = bonsLivraisonData ? bonsLivraisonData.filter(bon => bon.parent === livraison.name) : [];
        
        return {
          ...livraison,
          colis: livraisonColis,
          bons_de_livraison: livraisonBons
        };
      });
      
      setLivraisonsWithDetails(enriched.map(livraison => ({
        ...livraison,
        colis: livraison.colis.map(colis => ({
          name: colis.name,
          colis: colis.name,
          numero_sequence: colis.custom_numero_sequence,
          client: colis.client,
          status: colis.status
        })),
        bons_de_livraison: livraison.bons_de_livraison.map(bon => ({
          name: bon.name,
          bon_de_livraison: bon.bon_de_livraison,
          customer: bon.customer,
          custom_date_de_livraison: bon.custom_date_de_livraison,
          total_qty: bon.total_qty,
          grand_total: bon.grand_total,
          status: bon.status
        }))
      })));
    }
  }, [livraisonsData, colisData, bonsLivraisonData]);

  const filteredLivraisons = livraisonsWithDetails.filter(livraison => {
    // Filtre par terme de recherche (recherche dans le nom de la livraison)
    const matchesSearch = !searchTerm || livraison.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  // Fonction pour regrouper les livraisons par date
  const groupLivraisonsByDate = (livraisons: any[]) => {
    const groups: { [key: string]: any[] } = {};
    
    livraisons.forEach(livraison => {
      const dateKey = livraison.date_liv || 'Sans date';
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(livraison);
    });
    
    // Trier les dates (plus récentes en haut)
    const sortedDates = Object.keys(groups).sort((a, b) => {
      if (a === 'Sans date') return 1;
      if (b === 'Sans date') return -1;
      return new Date(b).getTime() - new Date(a).getTime();
    });
    
    return sortedDates.map(date => ({
      date,
      livraisons: groups[date]
    }));
  };

  const groupedLivraisons = groupLivraisonsByDate(filteredLivraisons);
  const finalFilteredLivraisons = filteredLivraisons;

  if (isLoading)
    return (
      <div className="w-full min-h-screen flex items-center justify-center px-4 bg-background">
    <div className="bg-card rounded-md p-5 shadow-lg border border-border">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white/40 mx-auto mb-3" />
      <span className="text-muted-foreground">Chargement…</span>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="w-full min-h-screen flex items-center justify-center px-4 bg-background">
    <div className="bg-card rounded-md p-5 shadow-lg border border-border max-w-md w-full">
          <Alert className="border-red-500/50 bg-red-500/10">
            <AlertTriangleIcon className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-300">
              Erreur lors du chargement: {String((error as unknown as Error)?.message || error)}
            </AlertDescription>
          </Alert>
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
              <span>Livraisons</span>
              <DotIcon className="w-3 h-3" />
              <span>Liste</span>
            </div>
            <div className="flex items-center gap-3">
              
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-8">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          
        </div>

        {/* Filtres */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
          <div>
            <label className="block text-sm text-muted-foreground mb-3">
              Statut
            </label>
            <div className="relative" data-select-container>
              <button
                onClick={() => setStatusFilterOpen(!statusFilterOpen)}
                className="w-full px-3 py-2 rounded-md bg-card border border-border text-foreground text-sm cursor-pointer flex justify-between items-center h-8 min-h-8 box-border hover:bg-accent transition-colors"
              >
                <span>
                  {statusFilter === "all" ? "Tous les statuts" : 
                   statusFilter === "Nouveau" ? "Nouveau" :
                   statusFilter === "Préparé" ? "Préparé" :
                   statusFilter === "Partiellement Préparé" ? "Partiellement Préparé" :
                   statusFilter === "Enlevé" ? "Enlevé" :
                   statusFilter === "Partiellement Enlevé" ? "Partiellement Enlevé" :
                   statusFilter === "Partiellement Livré" ? "Partiellement Livré" :
                   statusFilter === "Livré" ? "Livré" :
                   statusFilter === "Annulé" ? "Annulé" : "Tous les statuts"}
                </span>
                <span className="text-xs">▼</span>
              </button>
              
              {statusFilterOpen && (
                <div className="absolute top-full left-0 right-0 bg-card border border-border rounded-md shadow-lg z-50 mt-1 max-h-48 overflow-y-auto">
                  {[
                    { value: "all", label: "Tous les statuts" },
                    { value: "Nouveau", label: "Nouveau" },
                    { value: "Préparé", label: "Préparé" },
                    { value: "Partiellement Préparé", label: "Partiellement Préparé" },
                    { value: "Enlevé", label: "Enlevé" },
                    { value: "Partiellement Enlevé", label: "Partiellement Enlevé" },
                    { value: "Partiellement Livré", label: "Partiellement Livré" },
                    { value: "Livré", label: "Livré" },
                    { value: "Annulé", label: "Annulé" },
                  ].map((option) => (
                    <div
                      key={option.value}
                      onClick={() => {
                        setStatusFilter(option.value);
                        setStatusFilterOpen(false);
                      }}
                      className={`px-3 py-2 cursor-pointer text-foreground border-b border-border transition-colors hover:bg-accent ${
                        statusFilter === option.value ? 'bg-accent' : 'bg-card'
                      }`}
                    >
                      {option.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-3">
              Livreur
            </label>
            <div className="relative" data-select-container>
              <button
                onClick={() => setLivreurFilterOpen(!livreurFilterOpen)}
                className="w-full px-3 py-2 rounded-md bg-card border border-border text-foreground text-sm cursor-pointer flex justify-between items-center h-8 min-h-8 box-border hover:bg-accent transition-colors"
              >
                <span>
                  {livreurFilter === "all" || !livreurFilter ? "Tous les livreurs" : 
                   livreursMapping[livreurFilter] || livreurFilter}
                </span>
                <span className="text-xs">▼</span>
              </button>
              
              {livreurFilterOpen && (
                <div className="absolute top-full left-0 right-0 bg-card border border-border rounded-md shadow-lg z-50 mt-1 max-h-48 overflow-y-auto">
                  <div
                    onClick={() => {
                      setLivreurFilter("all");
                      setLivreurFilterOpen(false);
                    }}
                    className={`px-3 py-2 cursor-pointer text-foreground border-b border-border transition-colors hover:bg-accent ${
                      livreurFilter === "all" || !livreurFilter ? 'bg-accent' : 'bg-card'
                    }`}
                  >
                    Tous les livreurs
                  </div>
                  {livreursData?.map((livreur) => (
                    <div
                      key={livreur.name}
                      onClick={() => {
                        setLivreurFilter(livreur.name);
                        setLivreurFilterOpen(false);
                      }}
                      className={`px-3 py-2 cursor-pointer text-foreground border-b border-border transition-colors hover:bg-accent ${
                        livreurFilter === livreur.name ? 'bg-accent' : 'bg-card'
                      }`}
                    >
                      {livreur.nom}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-3">
              Véhicule
            </label>
            <div className="relative" data-select-container>
              <button
                onClick={() => setVehiculeFilterOpen(!vehiculeFilterOpen)}
                className="w-full px-3 py-2 rounded-md bg-card border border-border text-foreground text-sm cursor-pointer flex justify-between items-center h-8 min-h-8 box-border hover:bg-accent transition-colors"
              >
                <span>
                  {vehiculeFilter === "all" || !vehiculeFilter ? "Tous les véhicules" : 
                   vehiculesMapping[vehiculeFilter] || vehiculeFilter}
                </span>
                <span className="text-xs">▼</span>
              </button>
              
              {vehiculeFilterOpen && (
                <div className="absolute top-full left-0 right-0 bg-card border border-border rounded-md shadow-lg z-50 mt-1 max-h-48 overflow-y-auto">
                  <div
                    onClick={() => {
                      setVehiculeFilter("all");
                      setVehiculeFilterOpen(false);
                    }}
                    className={`px-3 py-2 cursor-pointer text-foreground border-b border-border transition-colors hover:bg-accent ${
                      vehiculeFilter === "all" || !vehiculeFilter ? 'bg-accent' : 'bg-card'
                    }`}
                  >
                    Tous les véhicules
                  </div>
                  {vehiculesData?.map((vehicule) => (
                    <div
                      key={vehicule.name}
                      onClick={() => {
                        setVehiculeFilter(vehicule.name);
                        setVehiculeFilterOpen(false);
                      }}
                      className={`px-3 py-2 cursor-pointer text-foreground border-b border-border transition-colors hover:bg-accent ${
                        vehiculeFilter === vehicule.name ? 'bg-accent' : 'bg-card'
                      }`}
                    >
                      {vehicule.nom}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-3">
              Date de livraison
            </label>
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="h-8"
            />
          </div>
          
          <div>
            <label className="block text-sm text-muted-foreground mb-3">
              Recherche
            </label>
            <div className="relative">
              <Input
                type="text"
                placeholder="Rechercher par numéro de livraison..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-3">
              &nbsp;
            </label>
            <button
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("all");
                setDateFilter("");
                setLivreurFilter("all");
                setVehiculeFilter("all");
              }}
              className="w-full px-3 py-1 rounded-md bg-card border border-border text-foreground text-sm cursor-pointer flex justify-center items-center h-9 min-h-9 box-border hover:bg-accent transition-colors"
            >
              Réinitialiser les filtres
            </button>
          </div>

        </div>

        {/* Table header with title and controls */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Liste des livraisons</h2>
          
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {finalFilteredLivraisons.length} Livraison{finalFilteredLivraisons.length > 1 ? 's' : ''}
            </span>
            
            {/* View Mode Toggle - Hidden on mobile */}
            <div className="hidden md:flex items-center gap-1 bg-muted rounded-md p-1">
              <button
                onClick={() => setViewMode('cards')}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  viewMode === 'cards'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Grid3X3 className="w-3 h-3" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  viewMode === 'table'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <List className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Content - Table or Cards View */}
        {viewMode === 'table' ? (
          /* Table View */
          <div className="border border-border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Livraison</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Livreur</TableHead>
                  <TableHead>Véhicule</TableHead>
                  <TableHead>Colis</TableHead>
                  <TableHead>Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {finalFilteredLivraisons.length > 0 ? (
                  finalFilteredLivraisons.map((livraison) => {
                    return (
                      <TableRow 
                        key={livraison.name}
                        className="cursor-pointer hover:bg-accent/50"
                        onClick={() => onLivraisonSelect?.(livraison.name)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                              <Truck className="w-3 h-3" />
                              <span className="text-xs font-medium">{livraison.name}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{formatDate(livraison.date_liv)}</span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            text={livraison.status}
                            tone={statusToColor(livraison.status)}
                          />
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {livraison.livreur ? livreursMapping[livraison.livreur] || livraison.livreur : '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {livraison.vehicule ? vehiculesMapping[livraison.vehicule] || livraison.vehicule : '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">{livraison.total_colis || 0}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{formatAmount(livraison.total_montant_a_encaisser)}</span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <DotIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Aucune livraison trouvée</span>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          /* Cards View */
          <div className="space-y-6">
            {groupedLivraisons.length > 0 ? (
              groupedLivraisons.map((group) => (
                <div key={group.date} className="space-y-4">
                  {/* En-tête de date */}
                  <div className="flex items-center gap-3 px-2">
                    <h3 className="text-lg font-semibold text-foreground">
                      {group.date === 'Sans date' ? 'Sans date de livraison' : formatDate(group.date)}
                    </h3>
                    <div className="flex-1 h-px bg-border"></div>
                    <span className="text-sm text-muted-foreground">
                      {group.livraisons.length} livraison{group.livraisons.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  
                  {/* Livraisons du groupe */}
                  <div className="space-y-4">
                    {group.livraisons.map((livraison) => (
                      <div 
                        key={livraison.name}
                        className="bg-card/50 rounded-md border border-border overflow-hidden hover:border-blue-400 transition-all duration-200"
                      >
                        {/* En-tête de la livraison - Cliquable */}
                        <div 
                          className="p-4 cursor-pointer hover:bg-accent/30 transition-colors duration-200"
                          onClick={() => onLivraisonSelect?.(livraison.name)}
                        >
                          <div className="mb-4">
                            {/* Titre de la livraison avec badge statut */}
                            <div className="mb-3 flex items-center justify-between">
                              <button className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/30">
                                <Truck className="w-3 h-3" />
                                <span className="text-xs font-medium">Livraison {livraison.name}</span>
                              </button>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {livraison.total_colis || 0} colis
                                </span>
                                <StatusBadge
                                  text={livraison.status}
                                  tone={statusToColor(livraison.status)}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Détails de la livraison - Toujours visible */}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-4 pb-2 border-t border-border mb-2">
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-muted-foreground">Livreur</span>
                              <span className="text-sm text-foreground">
                                {livraison.livreur ? livreursMapping[livraison.livreur] || livraison.livreur : '—'}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-muted-foreground">Véhicule</span>
                              <span className="text-sm text-foreground">
                                {livraison.vehicule ? vehiculesMapping[livraison.vehicule] || livraison.vehicule : '—'}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-muted-foreground">Nombre de colis</span>
                              <span className="text-sm text-foreground">{livraison.total_colis || 0}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-muted-foreground">Montant total</span>
                              <span className="text-sm text-foreground">{formatAmount(livraison.total_montant_a_encaisser)}</span>
                            </div>
                          </div>

                          {/* Bons de livraison associés */}
                          {livraison.bons_de_livraison && livraison.bons_de_livraison.length > 0 && (
                            <div className="pt-2 border-t border-border">
                              <span className="text-xs text-muted-foreground mb-2 block">Bons de livraison :</span>
                              <div className="flex flex-wrap gap-2">
                                {livraison.bons_de_livraison.map((bon: any, index: number) => (
                                   <span 
                                     key={index}
                                     className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-md"
                                   >
                                     {bon.bon_de_livraison}
                                   </span>
                                 ))}
                              </div>
                            </div>
                          )}

                          {/* Clients associés */}
                          {livraison.bons_de_livraison && livraison.bons_de_livraison.length > 0 && (
                            <div className="pt-2 border-t border-border">
                              <span className="text-xs text-muted-foreground mb-2 block">Clients :</span>
                              <div className="flex flex-wrap gap-2">
                                {[...new Set(livraison.bons_de_livraison.map((bon: any) => bon.customer).filter(Boolean))].map((client: unknown, index: number) => (
                                    <span 
                                      key={index}
                                      className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-md"
                                    >
                                      {String(client)}
                                    </span>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
             ) : (
               <div className="p-8 text-center">
                 <DotIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                 <span className="text-muted-foreground">Aucune livraison trouvée</span>
               </div>
             )}
          </div>
        )}



        {/* Pagination */}
        {finalFilteredLivraisons.length === 20 && (
          <div className="mt-6 flex justify-center gap-3">
            <Button
              variant="outline"
              disabled={pageLimitStart === 0}
              onClick={() => setPageLimitStart(Math.max(0, pageLimitStart - 20))}
              className="border-border text-foreground bg-card/50 hover:bg-accent"
            >
              Précédent
            </Button>
            <Button
              variant="outline"
              onClick={() => setPageLimitStart(pageLimitStart + 20)}
              className="border-border text-foreground bg-card/50 hover:bg-accent"
            >
              Suivant
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LivraisonsList;