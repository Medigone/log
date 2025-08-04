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
  Calendar
} from 'lucide-react';
import { useFrappeGetDoc, useFrappeGetDocList, useFrappeDocTypeEventListener } from 'frappe-react-sdk';
import type { Livraison, LivraisonColis, LivraisonBonDeLivraison } from '../../types/Livraison';

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
  total_colis?: number;
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
const LivraisonDetails = ({ livraisonId, onBack, onColisSelect }: LivraisonDetailsProps) => {
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
        "total_colis",
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
    <div className="bg-card rounded-2xl p-5 shadow-2xl border border-border">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white/40 mx-auto mb-3" />
      <span className="text-muted-foreground">Chargement…</span>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="w-full min-h-screen flex items-center justify-center px-4 bg-background">
    <div className="bg-card rounded-2xl p-5 shadow-2xl border border-border max-w-md w-full">
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
    <div className="bg-card rounded-2xl p-5 shadow-2xl border border-border">
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
              {onBack && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onBack}
                  className="border-border text-foreground bg-card/50 hover:bg-accent"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Retour
                </Button>
              )}
              <span>Livraison</span>
              <Dot className="w-4 h-4" />
              <span>Détails</span>
            </div>
            <div className="flex items-center gap-3">
              {livraison.name && (
                <MetaChip
                  icon={<Clipboard className="w-4 h-4" />}
                  label="ID"
                  value={livraison.name}
                />
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
        <div className="bg-card/50 rounded-2xl border border-border shadow-2xl p-4 mb-5">
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
              label="Colis"
              value={livraison.total_colis || 0}
            />
          </div>
        </div>

        {/* Informations générales */}
        <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden mb-5">
        <div className="px-4 py-3">
          <h2 className="text-lg font-semibold text-foreground">Informations générales</h2>
        </div>
        <div className="border-t border-border"></div>
          <div className="px-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
              <div className="grid gap-1.5">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-lg font-bold text-green-400">
                  {formatAmount(livraison.total_montant_a_encaisser)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bons de Livraison et Colis */}
        <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
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

                return (
                  <div 
                    key={bonLivraison.name}
                    className="bg-card/50 rounded-xl border border-border overflow-hidden"
                  >
                    {/* En-tête du bon de livraison */}
                    <div className="p-4">
                      <div className="mb-4">
                        {/* Titre du bon de livraison */}
                        <div className="mb-3">
                          <h3 className="text-base font-bold text-foreground">
                            {bonLivraison.bon_de_livraison}
                          </h3>
                        </div>
                        
                        {/* Informations client et date + Badge et nombre de colis */}
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <div className="mt-1">
                            <span className="text-xs text-muted-foreground">
                              Client : {bonLivraison.customer || 'Non défini'} | 
                              Date : {bonLivraison.custom_date_de_livraison ? formatDate(bonLivraison.custom_date_de_livraison) : 'Non définie'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <StatusBadge
                              text={bonLivraison.status || 'Nouveau'}
                              tone={statusToColor(bonLivraison.status)}
                            />
                            <span className="text-xs text-muted-foreground">
                              {colisDuBon.length} colis
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Détails du bon de livraison */}
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
                    </div>

                    {/* Liste des colis */}
                    {colisDuBon.length > 0 ? (
                      <div>
                        <div className="border-t border-border"></div>
                        
                        {/* Vue desktop - Tableau */}
                        <div className="hidden lg:block overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-background">
                                {[
                                  "Colis",
                                  "N° Séquence",
                                  "Client",
                                  "Statut",
                                ].map((h) => (
                                  <TableHead
                                    key={h}
                                    className="text-white font-semibold p-3 border-b-0"
                                  >
                                    {h}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {colisDuBon.map((colis, colisIndex) => (
                                <TableRow
                                  key={colis.name}
                                  className={`transition-colors duration-200 cursor-pointer hover:bg-accent/50 ${
                              colisIndex % 2 === 0 ? "bg-card/30" : "bg-card/60"
                            }`}
                                  onClick={() => onColisSelect?.(colis.name)}
                                >
                                  <TableCell className="p-3">
                                    <span className="text-foreground font-medium">
                                      {colis.name}
                                    </span>
                                  </TableCell>
                                  <TableCell className="p-3">
                                    <span className="text-muted-foreground">
                                      {colis.custom_numero_sequence || colis.numero_sequence || '-'}
                                    </span>
                                  </TableCell>
                                  <TableCell className="p-3">
                                    <span className="text-muted-foreground">{colis.client || '-'}</span>
                                  </TableCell>
                                  <TableCell className="p-3">
                                    <StatusBadge
                                      text={colis.status}
                                      tone={statusToColor(colis.status)}
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        {/* Vue mobile - Cartes */}
                        <div className="lg:hidden space-y-2 p-4">
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
                              className="bg-card/50 rounded-xl border cursor-pointer transition-all duration-200 p-4 hover:bg-accent/50 hover:-translate-y-0.5"
                              style={{
                                borderColor: borderColor,
                              }}
                              onClick={() => onColisSelect?.(colis.name)}
                            >
                              {/* En-tête de la carte */}
                              <div className="mb-3">
                                {/* Nom du colis */}
                                <div className="mb-2">
                                  <span className="text-sm font-bold text-foreground">
                                    {colis.name}
                                  </span>
                                </div>
                                
                                {/* Numéro de séquence et badge de statut */}
                                <div className="flex justify-between items-center mt-1.5">
                                  <span className="text-xs text-muted-foreground">
                                    N° {colis.custom_numero_sequence || colis.numero_sequence || '—'}
                                  </span>
                                  <StatusBadge
                                    text={colis.status}
                                    tone={statusToColor(colis.status)}
                                  />
                                </div>
                              </div>

                              {/* Informations du colis */}
                              <div className="grid gap-1.5 mb-2">
                                <div className="flex items-center gap-1.5">
                                    <User className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">
                                    {colis.client || '—'}
                                  </span>
                                </div>
                                
                                {colis.total_art && (
                                  <div className="flex items-center gap-1.5">
                                      <Package className="w-3 h-3 text-muted-foreground" />
                                      <span className="text-xs text-muted-foreground">
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
                    ) : (
                      <div className="p-6 text-center">
                        <Package className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Aucun colis pour ce bon de livraison</span>
                      </div>
                    )}
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