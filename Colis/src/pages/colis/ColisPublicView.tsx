import React, { useEffect, useMemo, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Rows3,
  IdCard,
  Clock,
  Circle,
  AlertTriangle,
  Clipboard,
  LogIn,
} from "lucide-react";
import logoSvg from "../../assets/IntraPro_fleetmaster.svg";

/* =========================
   Types
   ========================= */
interface Article {
  id: string;
  article: string;
  statut_article: string;
  quantite_totale: number;
  quantite_livree: number;
  quantite_restante: number;
  date_derniere_livraison?: string;
  variante_1?: string;
  variante_2?: string;
}

// On garde les champs connus, mais on tolère des extras
interface ColisPublicData {
  name?: string; // doc.name (ID du colis)
  id?: string;
  docname?: string;
  doc_name?: string;
  colis_id?: string;

  custom_numero_sequence?: string;
  status?: string;
  client?: string;
  date_creation?: string;
  bl?: string;
  articles?: Article[];
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

function statusToColor(status?: string): BadgeColor {
  switch (status) {
    case "Nouveau":
      return "blue";
    case "Préparé":
      return "cyan";
    case "Enlevé":
      return "orange";
    case "Partiellement Livré":
      return "yellow";
    case "Livré":
      return "green";
    case "Non Livré":
      return "red";
    case "Annulé":
      return "gray";
    default:
      return "gray";
  }
}

function articleStatusToColor(status: string): BadgeColor {
  switch (status) {
    case "En attente":
      return "blue";
    case "Partiellement livré":
      return "yellow";
    case "Livré":
      return "green";
    case "Non livré":
      return "red";
    default:
      return "gray";
  }
}

/* Résolution robuste de l'ID du colis (doc.name etc.) */
function resolveColisId(data?: ColisPublicData | null): string {
  if (!data) return "";
  return (
    data.name ||
    data.id ||
    data.docname ||
    data.doc_name ||
    data.colis_id ||
    ""
  );
}

/* Badge avec Tailwind CSS */
function StatusBadge({
  text,
  tone,
}: {
  text?: string;
  tone: BadgeColor;
}) {
  const toneClasses = {
    gray: "bg-muted/10 border-muted-foreground text-muted-foreground",
    blue: "bg-blue-500/10 border-blue-500 text-blue-200",
    cyan: "bg-cyan-500/10 border-cyan-500 text-cyan-200",
    orange: "bg-orange-500/10 border-orange-500 text-orange-200",
    yellow: "bg-yellow-500/10 border-yellow-500 text-yellow-200",
    green: "bg-green-500/10 border-green-500 text-green-200",
    red: "bg-red-500/10 border-red-500 text-red-200",
  };
  
  const dotClasses = {
    gray: "bg-muted-foreground",
    blue: "bg-blue-500",
    cyan: "bg-cyan-500",
    orange: "bg-orange-500",
    yellow: "bg-yellow-500",
    green: "bg-green-500",
    red: "bg-red-500",
  };
  
  return text ? (
    <span className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full border text-xs font-bold tracking-wide ${toneClasses[tone]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotClasses[tone]}`} />
      {text}
    </span>
  ) : null;
}

/* Chips avec Tailwind CSS */
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
      className="inline-flex items-center gap-2 px-3 py-2.5 bg-muted border border-border rounded-xl leading-none"
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

function QtyPill({ qty }: { qty: number | string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-muted border border-border text-foreground text-xs leading-none font-semibold">
      Qté {qty}
    </span>
  );
}

/* States */
const LoadingState = () => (
  <div className="w-full min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="bg-card rounded-2xl p-5 shadow-lg border border-border">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-3" />
        <p className="text-muted-foreground text-center">Chargement…</p>
      </div>
    </div>
);

const ErrorState = ({ message }: { message: string }) => (
  <div className="w-full min-h-screen flex items-center justify-center px-4 bg-background">
    <div className="bg-card rounded-2xl p-5 shadow-lg border border-border max-w-md w-full">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    </div>
  </div>
);

const EmptyState = () => (
  <div className="w-full min-h-screen flex items-center justify-center px-4 bg-background">
    <div className="bg-card rounded-2xl p-5 shadow-lg border border-border text-center max-w-md w-full">
      <div className="text-5xl mb-2 text-muted-foreground">
        📦
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-1">
        Aucun colis trouvé
      </h2>
      <p className="text-muted-foreground">Vérifiez le QR code scanné</p>
    </div>
  </div>
);

/* Item card */
function ItemCard({ a, index }: { a: Article; index: number }) {
  return (
    <div className="bg-card rounded-lg shadow-lg border border-border overflow-hidden">
      <div className="grid grid-cols-[72px_1fr_auto] gap-4 p-4 items-center">
        <div 
          className="w-[72px] h-[72px] rounded-xl border border-border"
          style={{
            background:
              index % 2 === 0
                ? "linear-gradient(135deg, hsl(var(--card)), hsl(var(--muted)))"
                : "linear-gradient(135deg, hsl(var(--muted)), hsl(var(--card)))",
          }}
        />
        <div className="min-w-0">
          <div className="text-base font-bold text-foreground">
            {a.article}
          </div>
          <div className="mt-2 flex gap-2 flex-wrap">
            {a.variante_1 && (
              <MetaChip icon={<Circle className="w-3 h-3" />} value={a.variante_1} />
            )}
            {a.variante_2 && (
              <MetaChip icon={<Circle className="w-3 h-3" />} value={a.variante_2} />
            )}
            <QtyPill qty={a.quantite_totale} />
          </div>
        </div>
        <div className="text-right">
          <StatusBadge
            text={a.statut_article}
            tone={articleStatusToColor(a.statut_article)}
          />
          <div className="mt-2">
            <p className="text-xs text-muted-foreground">
              Livré {a.quantite_livree} · Restant {a.quantite_restante}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Delivery history section */
function DeliveryHistorySection() {
  return (
    <div className="bg-card/50 rounded-2xl p-6 border border-border">
      <h2 className="text-lg font-semibold text-foreground mb-4">Historique de livraison</h2>
      <div className="bg-card/30 rounded-xl p-6 text-center border border-border">
        <p className="text-muted-foreground">Aucun historique disponible</p>
      </div>
    </div>
  );
}

/* Navigation Bar for Public View */
function PublicNavigationBar() {
  const handleLogin = () => {
    window.location.href = window.location.origin + window.location.pathname;
  };

  return (
    <div className="border-b border-border">
      <div className="max-w-6xl mx-auto px-4 py-2.5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <img
              src={logoSvg}
              alt="IntraPro FleetMaster"
              style={{ height: 28, width: "auto" }}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogin}
              className="cursor-pointer flex items-center gap-2"
            >
              <LogIn className="h-4 w-4" />
              Connexion
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================
   Main component
   ========================= */
const ColisPublicView: React.FC<{ colisId?: string }> = ({ colisId }) => {
  const [colisData, setColisData] = useState<ColisPublicData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchPublicColisData(id: string) {
    try {
      setIsLoading(true);
      setError(null);
      const url =
        "/api/method/log.delivery_note_ops.get_public_bl_data?bl_id=" +
        encodeURIComponent(id) +
        "&colis_id=" +
        encodeURIComponent(id);
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Colis non trouvé ou inaccessible");
      const result = await response.json();
      if (result?.message) setColisData(result.message as ColisPublicData);
      else throw new Error("Données invalides");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (colisId) fetchPublicColisData(colisId);
  }, [colisId]);

  const articles = useMemo(() => colisData?.articles ?? [], [colisData]);
  const colisDocId = resolveColisId(colisData);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!colisData) return <EmptyState />;

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Bar */}
      <PublicNavigationBar />
      
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/75 backdrop-blur-sm border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div
            className="flex items-center gap-2 flex-wrap justify-between"
          >
            <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
              <span>Suivi colis</span>
              <Circle className="w-1 h-1 fill-current" />
              <span>Contenu</span>
            </div>
            <div className="flex items-center gap-3">
              {/* ID du colis dans le header */}
              {colisDocId && (
                <MetaChip
                  icon={<Clipboard className="w-4 h-4" />}
                  label="ID"
                  value={colisDocId}
                  title="Identifiant du colis"
                />
              )}
              <StatusBadge
                text={colisData.status}
                tone={statusToColor(colisData.status)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 pt-6 pb-8">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-foreground">
            Contenu du colis
          </h1>
          {/* ID visible aussi près du titre (optionnel, doublon assumé pour lisibilité) */}
          {colisDocId && (
            <MetaChip
              icon={<Clipboard className="w-4 h-4" />}
              label="ID"
              value={colisDocId}
              title="Identifiant du colis"
            />
          )}
        </div>

        {/* Meta chips */}
        <div className="bg-card/50 rounded-2xl border border-border shadow-lg p-6 mb-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">Informations du colis</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <MetaChip
              icon={<Rows3 className="w-4 h-4" />}
              label="Séquence"
              value={colisData.custom_numero_sequence || "—"}
            />
            <MetaChip
              icon={<IdCard className="w-4 h-4" />}
              label="Client"
              value={colisData.client || "—"}
            />
            <MetaChip
              icon={<Clock className="w-4 h-4" />}
              label="Créé le"
              value={formatDate(colisData.date_creation)}
            />
          </div>
        </div>

        {/* Items */}
        <div className="grid gap-3">
          {articles.map((a, i) => (
            <ItemCard key={a.id || `item-${i}`} a={a} index={i} />
          ))}
        </div>

        {/* Résumé */}
        <div className="bg-card/50 rounded-2xl border border-border shadow-lg overflow-hidden mt-6">
          <div className="px-4 py-3">
            <h3 className="text-lg font-semibold text-foreground">
              Résumé
            </h3>
          </div>

          <Separator className="my-5" />

          <div className="px-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="grid gap-1.5">
                <p className="text-sm text-muted-foreground tracking-wide">
                  Articles
                </p>
                <p className="text-lg font-bold text-foreground">
                  {articles.length}
                </p>
              </div>

              <div className="grid gap-1.5">
                <p className="text-sm text-muted-foreground tracking-wide">
                  Total livré
                </p>
                <p className="text-lg font-bold text-foreground">
                  {articles.reduce((s, x) => s + (x.quantite_livree || 0), 0)}
                </p>
              </div>

              <div className="grid gap-1.5">
                <p className="text-sm text-muted-foreground tracking-wide">
                  Total restant
                </p>
                <p className="text-lg font-bold text-foreground">
                  {articles.reduce((s, x) => s + (x.quantite_restante || 0), 0)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ColisPublicView;