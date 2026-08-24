import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Search,
  X,
  Settings2,
} from "lucide-react";
import type { LivraisonFilters as ILivraisonFilters } from "../types/Livraison";



type BadgeTone =
  | "gray"
  | "blue"
  | "cyan"
  | "orange"
  | "yellow"
  | "green"
  | "red"
  | "purple"
  | "violet";

function statusToTone(status: string): BadgeTone {
  switch (status) {
    case "Livré":
      return "green";
    case "Partiellement Livré":
      return "blue";
    case "Enlevé":
      return "orange";
    case "Partiellement Enlevé":
      return "yellow";
    case "Préparé":
      return "purple";
    case "Partiellement Préparé":
      return "violet";
    case "Annulé":
      return "red";
    case "Nouveau":
    default:
      return "gray";
  }
}

/* Chip/Badge dark lisible */
function StatusBadge({
  children,
  tone,
  onClear,
}: {
  children: React.ReactNode;
  tone: BadgeTone;
  onClear?: () => void;
}) {
  const toneClasses = {
    gray: "bg-muted/20 border-border text-foreground",
    blue: "bg-blue-500/10 border-blue-500 text-blue-200",
    cyan: "bg-cyan-500/10 border-cyan-500 text-cyan-200",
    orange: "bg-orange-500/10 border-orange-500 text-orange-200",
    yellow: "bg-yellow-500/10 border-yellow-500 text-yellow-200",
    green: "bg-green-500/10 border-green-500 text-green-200",
    red: "bg-red-500/10 border-red-500 text-red-200",
    purple: "bg-purple-500/10 border-purple-500 text-purple-200",
    violet: "bg-violet-500/10 border-violet-500 text-violet-200",
  };
  
  const dotClasses = {
    gray: "bg-muted",
    blue: "bg-blue-500",
    cyan: "bg-cyan-500",
    orange: "bg-orange-500",
    yellow: "bg-yellow-500",
    green: "bg-green-500",
    red: "bg-red-500",
    purple: "bg-purple-500",
    violet: "bg-violet-500",
  };
  
  return (
    <span
      className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full border text-xs font-bold tracking-wide ${toneClasses[tone]}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${dotClasses[tone]}`}
      />
      {children}
      {onClear && (
        <button
          onClick={onClear}
          className="ml-1.5 grid place-items-center w-4 h-4 rounded-md bg-transparent border border-white/10 cursor-pointer hover:bg-white/5"
          aria-label="Retirer ce filtre"
          title="Retirer ce filtre"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
}

interface LivraisonFiltersProps {
  filters: ILivraisonFilters;
  onFiltersChange: (filters: ILivraisonFilters) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  livreurs?: string[];
  vehicules?: string[];
  communes?: string[];
}

const LivraisonFiltersComponent = ({
  filters,
  onFiltersChange,
  searchTerm,
  onSearchChange,
  livreurs = [],
  vehicules = [],
  communes = [],
}: LivraisonFiltersProps) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const statusOptions = [
    { value: "", label: "Tous les statuts" },
    { value: "Nouveau", label: "Nouveau" },
    { value: "Préparé", label: "Préparé" },
    { value: "Partiellement Préparé", label: "Partiellement Préparé" },
    { value: "Enlevé", label: "Enlevé" },
    { value: "Partiellement Enlevé", label: "Partiellement Enlevé" },
    { value: "Livré", label: "Livré" },
    { value: "Partiellement Livré", label: "Partiellement Livré" },
    { value: "Annulé", label: "Annulé" },
  ];

  const handleFilterChange = (key: keyof ILivraisonFilters, value: string) => {
    onFiltersChange({
      ...filters,
      [key]: value || undefined,
    });
  };

  const clearFilters = () => {
    onFiltersChange({});
    onSearchChange("");
  };

  const activeCount = Object.values(filters).filter(
    (v) => v !== undefined && v !== ""
  ).length;

  return (
    <div className="bg-card border rounded-lg shadow-sm p-4 mb-4">
      <div className="flex flex-col gap-3">
        {/* Barre de recherche */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px] relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Rechercher par nom, livreur, véhicule…"
              className="pl-10"
            />
          </div>

          <Button
            variant={showAdvanced ? "default" : "outline"}
            onClick={() => setShowAdvanced((v) => !v)}
            className="gap-2"
          >
            <Settings2 className="w-4 h-4" />
            Filtres
            {activeCount > 0 && (
              <span className="ml-1 inline-grid place-items-center px-1.5 h-4 rounded-full bg-muted border text-xs">
                {activeCount}
              </span>
            )}
          </Button>

          {(activeCount > 0 || searchTerm) && (
            <Button
              variant="outline"
              onClick={clearFilters}
              className="gap-2"
            >
              <X className="w-4 h-4" />
              Effacer
            </Button>
          )}
        </div>

        {/* Filtres avancés */}
        {showAdvanced && (
          <>
            <Separator />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
              {/* Statut */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Statut
                </label>
                <Select
                  value={filters.status || ""}
                  onValueChange={(value) => handleFilterChange("status", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Tous les statuts" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Livreur */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Livreur
                </label>
                <Select
                  value={filters.livreur || ""}
                  onValueChange={(value) => handleFilterChange("livreur", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Tous les livreurs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Tous les livreurs</SelectItem>
                    {livreurs.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Véhicule */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Véhicule
                </label>
                <Select
                  value={filters.vehicule || ""}
                  onValueChange={(value) => handleFilterChange("vehicule", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Tous les véhicules" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Tous les véhicules</SelectItem>
                    {vehicules.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Commune */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Commune
                </label>
                <Select
                  value={filters.commune || ""}
                  onValueChange={(value) => handleFilterChange("commune", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Toutes les communes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Toutes les communes</SelectItem>
                    {communes.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date de début */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Date de début
                </label>
                <Input
                  type="date"
                  value={filters.date_from || ""}
                  onChange={(e) => handleFilterChange("date_from", e.target.value)}
                />
              </div>

              {/* Date de fin */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Date de fin
                </label>
                <Input
                  type="date"
                  value={filters.date_to || ""}
                  onChange={(e) => handleFilterChange("date_to", e.target.value)}
                />
              </div>
            </div>
          </>
        )}

        {/* Filtres actifs */}
        {activeCount > 0 && (
          <>
            <Separator className="my-4" />
            <div className="flex items-center gap-2 flex-wrap pt-1.5">
              <span className="text-sm text-muted-foreground">
                Filtres actifs:
              </span>
              {filters.status && (
                <StatusBadge
                  tone={statusToTone(filters.status)}
                  onClear={() => handleFilterChange("status", "")}
                >
                  {filters.status}
                </StatusBadge>
              )}
              {filters.livreur && (
                <StatusBadge tone="blue" onClear={() => handleFilterChange("livreur", "")}>
                  {filters.livreur}
                </StatusBadge>
              )}
              {filters.vehicule && (
                <StatusBadge
                  tone="orange"
                  onClear={() => handleFilterChange("vehicule", "")}
                >
                  {filters.vehicule}
                </StatusBadge>
              )}
              {filters.commune && (
                <StatusBadge
                  tone="green"
                  onClear={() => handleFilterChange("commune", "")}
                >
                  {filters.commune}
                </StatusBadge>
              )}
              {(filters.date_from || filters.date_to) && (
                <StatusBadge
                  tone="purple"
                  onClear={() => {
                    handleFilterChange("date_from", "");
                    handleFilterChange("date_to", "");
                  }}
                >
                  {filters.date_from && filters.date_to
                    ? `${filters.date_from} — ${filters.date_to}`
                    : filters.date_from
                    ? `Depuis ${filters.date_from}`
                    : `Jusqu'au ${filters.date_to}`}
                </StatusBadge>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LivraisonFiltersComponent;