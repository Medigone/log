import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Package as PackageIcon,
  Search as SearchIcon,
  AlertTriangle as AlertTriangleIcon,
  User as UserIcon,
  Truck as TruckIcon,
  Dot as DotIcon
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
  custom_commune?: string;
  custom_nom_livreur?: string;
  custom_vehicule?: string;
  custom_nombre_colis?: number;
  grand_total?: number;
  total_qty?: number;
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
      return "green";
    case "Partiellement Livré":
      return "yellow";
    case "Enlevé":
      return "orange";
    case "Partiellement Enlevé":
      return "yellow";
    case "Préparé":
      return "cyan";
    case "Partiellement Préparé":
      return "blue";
    case "Annulé":
      return "red";
    case "Nouveau":
    default:
      return "gray";
  }
}

/* Badge dark mode contrasté */
function StatusBadge({ text, tone }: { text?: string; tone: BadgeColor }) {
  const colorClasses: Record<BadgeColor, string> = {
    gray: "bg-muted/20 border-border text-foreground",
    blue: "bg-blue-500/20 border-blue-500 text-blue-200",
    cyan: "bg-cyan-500/20 border-cyan-400 text-cyan-200",
    orange: "bg-orange-500/20 border-orange-400 text-orange-200",
    yellow: "bg-yellow-500/20 border-yellow-400 text-yellow-200",
    green: "bg-green-500/20 border-green-500 text-green-200",
    red: "bg-red-500/20 border-red-500 text-red-200",
  };
  
  const dotClasses: Record<BadgeColor, string> = {
    gray: "bg-muted",
    blue: "bg-blue-500",
    cyan: "bg-cyan-400",
    orange: "bg-orange-400",
    yellow: "bg-yellow-400",
    green: "bg-green-500",
    red: "bg-red-500",
  };
  
  return text ? (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-semibold tracking-wide ${colorClasses[tone] || colorClasses.gray}`}>
      <span className={`w-1 h-1 rounded-full ${dotClasses[tone] || dotClasses.gray}`} />
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
      className="inline-flex items-center gap-2 px-3 py-2.5 bg-card/60 border border-border rounded-xl leading-none"
    >
      <span
        aria-hidden
        className="grid place-items-center w-4.5 h-4.5 text-foreground"
      >
        {icon}
      </span>
      <span className="inline-flex items-baseline gap-1.5 text-foreground text-sm">
        {label && (
          <span className="text-muted-foreground font-medium">
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
const LivraisonsList = ({ onLivraisonSelect }: LivraisonsListProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pageLimitStart, setPageLimitStart] = useState(0);
  const [livraisonsWithDetails, setLivraisonsWithDetails] = useState<Livraison[]>([]);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);

  // Filtres pour les livraisons
  const filters = useMemo(() => {
    const f: any[] = [];
    if (statusFilter && statusFilter !== 'all') {
      f.push(['status', '=', statusFilter]);
    }
    // Supprimer la recherche côté serveur pour éviter les rechargements
    // if (debouncedSearchTerm) {
    //   f.push(['name', 'like', `%${debouncedSearchTerm}%`]);
    // }
    return f;
  }, [statusFilter]);

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

  // Récupération des colis pour toutes les livraisons
  const { data: colisData, mutate: mutateAllColis } = useFrappeGetDocList<any>('Colis', {
    fields: [
      'name',
      'custom_numero_sequence',
      'status',
      'client',
      'date_creation',
      'bl',
      'articles'
    ],
    filters: livraisonsData ? [['bl', 'in', livraisonsData.map(l => l.name)]] : [],
    limit: 1000
  });

  // Récupération des véhicules pour mapper les IDs aux noms
  const { data: vehiculesData } = useFrappeGetDocList<any>('Vehicule', {
    fields: ['name', 'nom'],
    limit: 1000
  });

  // Récupération des livreurs pour mapper les IDs aux noms
  const { data: livreursData } = useFrappeGetDocList<any>('Livreur', {
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

  useFrappeDocTypeEventListener('Colis', () => {
    mutateAllColis();
  });

  // Combiner les livraisons avec leurs données enfants
  useEffect(() => {
    if (livraisonsData && colisData) {
      const enriched = livraisonsData.map(livraison => {
        const livraisonColis = colisData.filter(colis => colis.bl === livraison.name);
        
        return {
          ...livraison,
          colis: livraisonColis,
          bons_de_livraison: []
        };
      });
      
      setLivraisonsWithDetails(enriched);
    }
  }, [livraisonsData, colisData]);

  const filteredLivraisons = livraisonsWithDetails.filter(livraison => 
    livraison.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const finalFilteredLivraisons = filteredLivraisons;

  if (isLoading)
    return (
      <div className="w-full min-h-screen flex items-center justify-center px-4 bg-background">
    <div className="bg-card rounded-2xl p-5 shadow-lg border border-border">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white/40 mx-auto mb-3" />
      <span className="text-muted-foreground">Chargement…</span>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="w-full min-h-screen flex items-center justify-center px-4 bg-background">
    <div className="bg-card rounded-2xl p-5 shadow-lg border border-border max-w-md w-full">
          <Alert className="border-red-500/50 bg-red-500/10">
            <AlertTriangleIcon className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-300">
              Erreur lors du chargement: {String((error as any)?.message || error)}
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
              <MetaChip
                icon={<PackageIcon width={16} height={16} />}
                label="Total"
                value={finalFilteredLivraisons.length}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-8">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <h1 className="text-2xl font-semibold text-foreground">
            Livraisons
          </h1>
        </div>

        {/* Filtres */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-sm text-muted-foreground mb-2">
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
              <label className="block text-sm text-muted-foreground mb-2">
                Statut
              </label>
              <div className="relative" data-select-container>
                <button
                  onClick={() => setStatusFilterOpen(!statusFilterOpen)}
                  className="w-full px-3 py-2 rounded-xl bg-card border border-border text-foreground text-sm cursor-pointer flex justify-between items-center h-8 min-h-8 box-border hover:bg-accent transition-colors"
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
                  <div className="absolute top-full left-0 right-0 bg-card border border-border rounded-xl shadow-lg z-50 mt-1 max-h-48 overflow-y-auto">
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
        </div>

        {/* Titre de la section */}
        <div className="px-4 py-3">
          <h2 className="text-lg font-medium text-foreground">Liste des livraisons</h2>
        </div>

        {/* Tableau des livraisons */}
        <div className="bg-card/50 rounded-2xl overflow-hidden">
          {finalFilteredLivraisons.length > 0 ? (
            <>
              {/* Vue desktop - Tableau */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-card/60 border-none hover:bg-card/60">
                      {[
                        "Livraison",
                        "Date",
                        "Livreur",
                        "Véhicule",
                        "Colis",
                        "Montant",
                        "Statut",
                      ].map((h) => (
                        <TableHead
                          key={h}
                          className="text-muted-foreground font-semibold p-3 border-none"
                        >
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                     {finalFilteredLivraisons.map((livraison, index) => (
                       <TableRow
                         key={livraison.name}
                         className={`cursor-pointer border-none transition-colors hover:bg-card/30 ${
                           index % 2 === 0 ? 'bg-card/60' : 'bg-card/40'
                         }`}
                         onClick={() => onLivraisonSelect?.(livraison.name)}
                       >
                        <TableCell className="p-3 border-none">
                           <span className="text-foreground font-medium">
                             {livraison.name}
                           </span>
                         </TableCell>
                         <TableCell className="p-3 border-none">
                           <span className="text-muted-foreground">
                             {formatDate(livraison.date_liv)}
                           </span>
                         </TableCell>
                         <TableCell className="p-3 border-none">
                           <span className="text-muted-foreground">
                             {livraison.livreur ? livreursMapping[livraison.livreur] || livraison.livreur : "—"}
                           </span>
                         </TableCell>
                         <TableCell className="p-3 border-none">
                           <span className="text-muted-foreground">
                             {livraison.vehicule ? vehiculesMapping[livraison.vehicule] || livraison.vehicule : "—"}
                           </span>
                         </TableCell>
                         <TableCell className="p-3 border-none">
                           <span className="text-muted-foreground">
                             {livraison.total_colis || 0}
                           </span>
                         </TableCell>
                         <TableCell className="p-3 border-none">
                           <span className="text-foreground">
                             {formatAmount(livraison.total_montant_a_encaisser)}
                           </span>
                         </TableCell>
                         <TableCell className="p-3 border-none">
                           <StatusBadge
                             text={livraison.status}
                             tone={statusToColor(livraison.status)}
                           />
                         </TableCell>
                      </TableRow>
                     ))}
                   </TableBody>
                 </Table>
               </div>

              {/* Vue mobile - Cartes */}
               <div className="lg:hidden space-y-3">
                 {finalFilteredLivraisons.map((livraison) => (
                   <div
                     key={livraison.name}
                     onClick={() => onLivraisonSelect?.(livraison.name)}
                     className="bg-card rounded-xl border border-border p-4 cursor-pointer transition-all duration-200 hover:bg-accent hover:-translate-y-0.5"
                   >
                    {/* En-tête de la carte */}
                     <div className="flex justify-between items-start mb-3">
                       <div>
                         <h3 className="text-lg font-bold text-foreground mb-1">
                           {livraison.name}
                         </h3>
                         <span className="text-xs text-muted-foreground">
                           {formatDate(livraison.date_liv)}
                         </span>
                       </div>
                       <StatusBadge
                         text={livraison.status}
                         tone={statusToColor(livraison.status)}
                       />
                     </div>

                    {/* Informations principales */}
                     <div className="grid gap-2 mb-3">
                       <div className="flex items-center gap-2">
                         <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                           {livraison.livreur ? livreursMapping[livraison.livreur] || livraison.livreur : "—"}
                         </span>
                       </div>
                       
                       <div className="flex items-center gap-2">
                         <TruckIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                           {livraison.vehicule ? vehiculesMapping[livraison.vehicule] || livraison.vehicule : "—"}
                         </span>
                       </div>
                       
                       <div className="flex items-center gap-2">
                         <PackageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                           {livraison.total_colis || 0} colis
                         </span>
                       </div>
                     </div>

                    {/* Montant */}
                     <div className="flex justify-between items-center pt-2 border-t border-border">
                       <span className="text-xs text-muted-foreground">
                         Montant total
                       </span>
                       <span className="text-lg font-bold text-green-400">
                         {formatAmount(livraison.total_montant_a_encaisser)}
                       </span>
                     </div>
                   </div>
                 ))}
               </div>
             </>
           ) : (
             <div className="p-8 text-center">
               <PackageIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
               <span className="text-muted-foreground">Aucune livraison trouvée</span>
             </div>
           )}
        </div>

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