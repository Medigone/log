import React from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Grid3X3,
  List,
  Circle,
} from "lucide-react";

interface LivraisonNavigationProps {
  selectedLivraisonId?: string;
  livraisonView: "dashboard" | "list";
  onLivraisonViewChange: (view: "dashboard" | "list") => void;
  onBackToList?: () => void;
}

function BadgeSoft({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800">
      {children}
    </span>
  );
}



const LivraisonNavigation = ({
  selectedLivraisonId,
  livraisonView,
  onLivraisonViewChange,
  onBackToList,
}: LivraisonNavigationProps) => {
  return (
    <div className="sticky top-0 z-10 bg-background/75 border-b border-border backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 py-2.5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            {selectedLivraisonId && onBackToList && (
              <Button
                variant="outline"
                size="sm"
                onClick={onBackToList}
                className="text-muted-foreground"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </Button>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-foreground">
                {selectedLivraisonId
                  ? `Livraison ${selectedLivraisonId}`
                  : "Livraisons"}
              </h2>
              {selectedLivraisonId && <BadgeSoft tone="#3b82f6">Détails</BadgeSoft>}
            </div>

            {!selectedLivraisonId && (
              <div className="flex bg-muted rounded-lg p-1 ml-1">
                <Button
                  variant={livraisonView === "dashboard" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => onLivraisonViewChange("dashboard")}
                  className="flex items-center gap-2"
                >
                  <Grid3X3 className="w-4 h-4" />
                  Tableau
                </Button>
                <Button
                  variant={livraisonView === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => onLivraisonViewChange("list")}
                  className="flex items-center gap-2"
                >
                  <List className="w-4 h-4" />
                  Liste
                </Button>
              </div>
            )}
          </div>

          {/* Breadcrumb discret côté droit si besoin */}
          {!selectedLivraisonId && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <span>Livraisons</span>
              <Circle className="w-1 h-1 fill-current" />
              <span className="text-foreground">
                {livraisonView === "dashboard" ? "Tableau de bord" : "Liste"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LivraisonNavigation;