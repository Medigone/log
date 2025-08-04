import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Rows3,
  IdCard,
  Clock,
  Circle,
  AlertTriangle,
  Clipboard,
  Check,
  XCircle,
  Pencil,
  Camera,
  FileText,
  ArrowLeft,
  Settings,
} from "lucide-react";
import { useFrappeGetDoc, useFrappeUpdateDoc, useFrappeAuth, useFrappeGetDocList } from "frappe-react-sdk";

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
  raison_non_livraison?: string;
  commentaire_article?: string;
}

interface ColisData {
  name?: string;
  id?: string;
  custom_numero_sequence?: string;
  status?: string;
  client?: string;
  date_creation?: string;
  date?: string;
  bl?: string;
  total_art?: number;
  articles: Article[];
  photo_livraison?: string;
  signature_client?: string;
  commentaire_livreur?: string;
  date_derniere_livraison?: string;
}

interface ColisDetailsProps {
  colisId?: string;
  livraisonId?: string;
  onBackToLivraison?: () => void;
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

function resolveColisId(data?: ColisData | null) {
  if (!data) return "";
  return data.name || data.id || "";
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

/* Badge avec Tailwind CSS */
function StatusBadge({ text, tone }: { text?: string; tone: BadgeColor }) {
  const toneClasses = {
    gray: "bg-muted/20 border-border text-foreground",
    blue: "bg-blue-500/10 border-blue-500 text-blue-200",
    cyan: "bg-cyan-500/10 border-cyan-500 text-cyan-200",
    orange: "bg-orange-500/10 border-orange-500 text-orange-200",
    yellow: "bg-yellow-500/10 border-yellow-500 text-yellow-200",
    green: "bg-green-500/10 border-green-500 text-green-200",
    red: "bg-red-500/10 border-red-500 text-red-200",
  };
  
  const dotClasses = {
    gray: "bg-muted",
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

/* =========================
   Component
   ========================= */
const ColisDetails = ({ colisId, livraisonId, onBackToLivraison }: ColisDetailsProps) => {
  const { data, mutate, error, isLoading } = useFrappeGetDoc<ColisData>(
    "Colis",
    colisId,
    {
      fields: [
        "name",
        "custom_numero_sequence",
        "status",
        "client",
        "date_creation",
        "date",
        "bl",
        "total_art",
        "articles",
        "photo_livraison",
        "signature_client",
        "commentaire_livreur",
        "date_derniere_livraison",
      ],
    }
  );

  const { updateDoc: updateColis } = useFrappeUpdateDoc();
  useFrappeAuth();

  const [localColisData, setLocalColisData] = useState<ColisData | null>(null);
  const [editingArticle, setEditingArticle] = useState<string | null>(null);
  const [tempQuantities, setTempQuantities] = useState<Record<string, number>>(
    {}
  );
  const [isSaving, setIsSaving] = useState(false);

  // Camera
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Commentaire
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [commentText, setCommentText] = useState("");

  // Changement de statut
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>("");

  const statusOptions = [
    "Nouveau",
    "Préparé",
    "Enlevé",
    "Partiellement Livré",
    "Livré",
    "Non Livré",
    "Annulé"
  ];

  useEffect(() => {
    if (data) {
      setLocalColisData({
        ...data,
        id: data.name || data.id,
      });
      setEditingArticle(null);
      setTempQuantities({});
      setCapturedPhoto(data.photo_livraison || null);
      setCommentText(data.commentaire_livreur || "");
    }
  }, [data]);

  const saveToBackend = async (updatedData: Partial<ColisData>) => {
    if (!colisId) return;
    setIsSaving(true);
    try {
      await updateColis("Colis", colisId, updatedData);
      await mutate();
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la sauvegarde");
    } finally {
      setIsSaving(false);
    }
  };

  const canDeliver = () =>
    localColisData?.status === "Enlevé" ||
    localColisData?.status === "Partiellement Livré";

  // Camera handlers
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCapturing(true);
      }
    } catch (e) {
      console.error(e);
      alert("Impossible d'accéder à la caméra.");
    }
  };
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCapturing(false);
  };
  const uploadPhoto = async (
    colisIdArg: string,
    fileData: string,
    filename: string
  ) => {
    const csrfToken = (window as any).csrf_token;
    const r = await fetch(
      "/api/method/log.log.doctype.colis.colis.upload_photo_livraison",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Frappe-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ colis_id: colisIdArg, file_data: fileData, filename }),
      }
    );
    if (!r.ok) throw new Error(await r.text());
    const json = await r.json();
    return json?.message?.file_url as string | undefined;
  };
  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || !colisId) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    try {
      const fileUrl = await uploadPhoto(
        colisId,
        dataUrl,
        `photo_livraison_${colisId}_${Date.now()}.jpg`
      );
      if (fileUrl) {
        setCapturedPhoto(fileUrl);
        await saveToBackend({ photo_livraison: fileUrl });
      }
    } catch (e) {
      console.error(e);
      alert("Erreur lors de l'upload.");
    } finally {
      stopCamera();
    }
  };
  const deletePhoto = async () => {
    if (!colisId) return;
    try {
      const csrfToken = (window as any).csrf_token;
      const r = await fetch(
        "/api/method/log.log.doctype.colis.colis.delete_photo_livraison",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-Frappe-CSRF-Token": csrfToken,
          },
          body: JSON.stringify({ colis_id: colisId }),
        }
      );
      const json = await r.json();
      if (json?.message?.success) {
        setCapturedPhoto(null);
        await saveToBackend({ photo_livraison: undefined });
      } else {
        throw new Error(json?.message?.message || "Suppression impossible");
      }
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la suppression.");
    }
  };

  // Quantités
  const startEditing = (articleKey: string, current: number) => {
    setEditingArticle(articleKey);
    setTempQuantities({ [articleKey]: current });
  };
  const cancelEditing = () => {
    setEditingArticle(null);
    setTempQuantities({});
  };
  const saveQuantity = async (articleKey: string) => {
    if (!localColisData || editingArticle !== articleKey) return;
    setLocalColisData((prev) => {
      if (!prev) return prev;
      const updated = prev.articles.map((a, idx) => {
        const key = a.id || `article-${idx}`;
        if (key !== articleKey) return a;
        const liv = Math.min(tempQuantities[articleKey] || 0, a.quantite_totale);
        const rest = a.quantite_totale - liv;
        let st = "En attente";
        if (liv === 0) st = "Non livré";
        else if (liv === a.quantite_totale) st = "Livré";
        else st = "Partiellement livré";
        return {
          ...a,
          quantite_livree: liv,
          quantite_restante: rest,
          statut_article: st,
          date_derniere_livraison: new Date().toISOString().slice(0, 19).replace("T", " "),
        };
      });
      const total = updated.length;
      const nbLiv = updated.filter((x) => x.statut_article === "Livré").length;
      const nbPart = updated.filter((x) => x.statut_article === "Partiellement livré").length;
      let global = "Nouveau";
      if (nbLiv === total) global = "Livré";
      else if (nbLiv > 0 || nbPart > 0) global = "Partiellement Livré";
      const next = { ...prev, articles: updated, status: global };
      // async save
      saveToBackend({ articles: updated, status: global });
      return next;
    });
    cancelEditing();
  };
  const markAllAsDelivered = async (articleKey: string) => {
    setLocalColisData((prev) => {
      if (!prev) return prev;
      const updated = prev.articles.map((a, idx) => {
        const key = a.id || `article-${idx}`;
        if (key !== articleKey) return a;
        return {
          ...a,
          quantite_livree: a.quantite_totale,
          quantite_restante: 0,
          statut_article: "Livré",
          date_derniere_livraison: new Date().toISOString().slice(0, 19).replace("T", " "),
        };
      });
      const total = updated.length;
      const nbLiv = updated.filter((x) => x.statut_article === "Livré").length;
      const nbPart = updated.filter((x) => x.statut_article === "Partiellement livré").length;
      let global = "Nouveau";
      if (nbLiv === total) global = "Livré";
      else if (nbLiv > 0 || nbPart > 0) global = "Partiellement Livré";
      const next = {
        ...prev,
        articles: updated,
        status: global,
        date_derniere_livraison: new Date().toISOString().slice(0, 19).replace("T", " "),
      } as ColisData;
      saveToBackend({
        articles: updated,
        status: global,
        date_derniere_livraison: next.date_derniere_livraison,
      });
      return next;
    });
  };
  const markAllArticlesAsDelivered = async () => {
    setLocalColisData((prev) => {
      if (!prev) return prev;
      const updated = prev.articles.map((a) => ({
        ...a,
        quantite_livree: a.quantite_totale,
        quantite_restante: 0,
        statut_article: "Livré",
        date_derniere_livraison: new Date().toISOString().slice(0, 19).replace("T", " "),
      }));
      const next = {
        ...prev,
        articles: updated,
        status: "Livré",
        date_derniere_livraison: new Date().toISOString().slice(0, 19).replace("T", " "),
      } as ColisData;
      saveToBackend({
        articles: updated,
        status: "Livré",
        date_derniere_livraison: next.date_derniere_livraison,
      });
      return next;
    });
  };

  const handleStatusChange = async () => {
    if (!selectedStatus || !colisId) return;
    
    try {
      await saveToBackend({ status: selectedStatus });
      setLocalColisData((prev) => prev ? { ...prev, status: selectedStatus } : prev);
      setIsStatusDialogOpen(false);
      setSelectedStatus("");
    } catch (e) {
      console.error(e);
      alert("Erreur lors du changement de statut");
    }
  };

  const openStatusDialog = () => {
    setSelectedStatus(localColisData?.status || "");
    setIsStatusDialogOpen(true);
  };

  if (isLoading)
    return (
      <div className="w-full min-h-screen flex items-center justify-center px-4 bg-background">
        <div className="bg-card rounded-2xl p-5 shadow-lg">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white/40 mx-auto mb-3" />
          <p className="text-muted-foreground">Chargement…</p>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="w-full min-h-screen flex items-center justify-center px-4 bg-background">
        <div className="bg-card rounded-2xl p-5 shadow-lg max-w-md w-full">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Erreur lors du chargement: {String((error as any)?.message || error)}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );

  if (!localColisData)
    return (
      <div className="w-full min-h-screen flex items-center justify-center px-4 bg-background">
        <div className="bg-card rounded-2xl p-5 shadow-lg">
          <p className="text-muted-foreground">
            Aucune donnée disponible pour ce colis.
          </p>
        </div>
      </div>
    );

  const colisDocId = resolveColisId(localColisData);
  const totalArticlesQty = localColisData.articles.reduce(
    (s, a) => s + a.quantite_totale,
    0
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap justify-between">
            <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
              {livraisonId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onBackToLivraison}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Retour à la livraison
                </Button>
              )}
              <span>Colis</span>
              <Circle className="w-1 h-1 fill-current" />
              <span>Détails</span>
            </div>
            <div className="flex items-center gap-3">
              {colisDocId && (
                <MetaChip
                  icon={<Clipboard className="w-4 h-4" />}
                  label="ID"
                  value={colisDocId}
                />
              )}
              <div className="flex items-center gap-2">
                <StatusBadge
                  text={localColisData.status}
                  tone={statusToColor(localColisData.status)}
                />
                <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openStatusDialog}
                      className="h-8 px-2"
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Changer le statut du colis</DialogTitle>
                      <DialogDescription>
                        Sélectionnez le nouveau statut pour ce colis.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner un statut" />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((status) => (
                            <SelectItem key={status} value={status}>
                              <div className="flex items-center gap-2">
                                <StatusBadge
                                  text={status}
                                  tone={statusToColor(status)}
                                />
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setIsStatusDialogOpen(false)}
                      >
                        Annuler
                      </Button>
                      <Button
                        onClick={handleStatusChange}
                        disabled={!selectedStatus || selectedStatus === localColisData.status || isSaving}
                      >
                        {isSaving ? "Mise à jour..." : "Confirmer"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-8">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-foreground">
            Colis {localColisData.custom_numero_sequence || "—"}
          </h1>
        </div>

        {/* Meta chips */}
        <div className="bg-card rounded-2xl border border-border shadow-lg p-4 mb-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <MetaChip
              icon={<Rows3 className="w-4 h-4" />}
              label="Séquence"
              value={localColisData.custom_numero_sequence || "—"}
            />
            <MetaChip
              icon={<IdCard className="w-4 h-4" />}
              label="Client"
              value={localColisData.client || "—"}
            />
            <MetaChip
              icon={<FileText className="w-4 h-4" />}
              label="BL"
              value={localColisData.bl || "—"}
            />
            <MetaChip
              icon={<Clock className="w-4 h-4" />}
              label="Créé le"
              value={formatDate(localColisData.date_creation)}
            />
          </div>
        </div>

        {/* Articles */}
        <div className="bg-card rounded-2xl border border-border shadow-lg overflow-hidden">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold text-foreground">
                Articles ({localColisData.articles.length})
              </h2>
              {localColisData.articles.some((a) => a.quantite_restante > 0) &&
                canDeliver() && (
                  <Button
                    onClick={markAllArticlesAsDelivered}
                    disabled={isSaving}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Marquer tout livré
                  </Button>
                )}
            </div>
          </div>
          <Separator />

          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted">
                  {[
                    "Article",
                    "Action",
                    "Total",
                    "Livré",
                    "Restant",
                    "Statut",
                    "Mise à jour",
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
                {localColisData.articles.map((a, index) => {
                  const key = a.id || `article-${index}`;
                  return (
                    <TableRow
                      key={key}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <TableCell className="p-3">
                        <span className="text-foreground font-medium">
                          {a.article}
                        </span>
                      </TableCell>
                      <TableCell className="p-3">
                        {a.quantite_restante > 0 && canDeliver() ? (
                          <Button
                            size="sm"
                            onClick={() => markAllAsDelivered(key)}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1"
                          >
                            ✓
                          </Button>
                        ) : a.quantite_restante > 0 ? (
                          <span className="text-yellow-500 text-sm">
                            ⚠️
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="p-3">
                        <span className="text-foreground">
                          {a.quantite_totale}
                        </span>
                      </TableCell>
                      <TableCell className="p-3">
                        <div className="flex items-center gap-2">
                          {editingArticle === key ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min="0"
                                max={a.quantite_totale}
                                value={(tempQuantities[key] || 0).toString()}
                                onChange={(e) =>
                                  setTempQuantities((prev) => ({
                                    ...prev,
                                    [key]: parseInt(e.target.value || "0"),
                                  }))
                                }
                                className="w-20"
                              />
                              <Button size="sm" onClick={() => saveQuantity(key)}>
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={cancelEditing}>
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-foreground">
                                {a.quantite_livree}
                              </span>
                              {a.quantite_livree > 0 && <Check className="w-4 h-4 text-green-600" />}
                              {canDeliver() && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEditing(key, a.quantite_livree)}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="p-3">
                        <span
                          className={`${
                            a.quantite_restante !== 0
                              ? "text-red-500"
                              : "text-foreground"
                          }`}
                        >
                          {a.quantite_restante}
                        </span>
                      </TableCell>
                      <TableCell className="p-3">
                        <StatusBadge
                          text={a.statut_article}
                          tone={articleStatusToColor(a.statut_article)}
                        />
                      </TableCell>
                      <TableCell className="p-3">
                        <span className="text-muted-foreground text-sm">
                          {a.date_derniere_livraison
                            ? new Date(a.date_derniere_livraison).toLocaleString(
                                "fr-FR",
                                {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )
                            : "—"}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden p-3">
            <div className="grid gap-3">
              {localColisData.articles.map((a, index) => {
                const key = a.id || `article-${index}`;
                return (
                  <div
                    key={key}
                    className="bg-card border border-border rounded-lg p-4"
                  >
                    <h3 className="text-lg font-bold text-foreground">
                      {a.article}
                    </h3>
                    <div className="mt-2 flex gap-2 flex-wrap">
                      <QtyPill qty={a.quantite_totale} />
                      <StatusBadge
                        text={a.statut_article}
                        tone={articleStatusToColor(a.statut_article)}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3 mt-3">
                      <div className="text-center bg-muted border border-border rounded-lg p-2">
                        <div className="text-xs text-muted-foreground">
                          Total
                        </div>
                        <div className="text-foreground">
                          {a.quantite_totale}
                        </div>
                      </div>
                      <div className="text-center bg-green-900/20 border border-border rounded-lg p-2">
                        <div className="text-xs text-muted-foreground">
                          Livré
                        </div>
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-green-500">
                            {a.quantite_livree}
                          </span>
                          {a.quantite_livree > 0 && <Check className="w-3 h-3 text-green-500" />}
                        </div>
                      </div>
                      <div className="text-center bg-red-900/20 border border-border rounded-lg p-2">
                        <div className="text-xs text-muted-foreground">
                          Restant
                        </div>
                        <div
                          className={`${
                            a.quantite_restante !== 0
                              ? "text-red-500"
                              : "text-foreground"
                          }`}
                        >
                          {a.quantite_restante}
                        </div>
                      </div>
                    </div>

                    {editingArticle === key ? (
                      <div className="mt-3 flex items-center gap-2 bg-blue-900/20 border border-border rounded-lg p-2">
                        <span className="text-sm text-muted-foreground">
                          Modifier qté livrée:
                        </span>
                        <Input
                          type="number"
                          min="0"
                          max={a.quantite_totale}
                          value={(tempQuantities[key] || 0).toString()}
                          onChange={(e) =>
                            setTempQuantities((prev) => ({
                              ...prev,
                              [key]: parseInt(e.target.value || "0"),
                            }))
                          }
                          className="w-20"
                        />
                        <Button size="sm" onClick={() => saveQuantity(key)}>
                          <Check className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEditing}>
                          <XCircle className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      canDeliver() && (
                        <div className="mt-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEditing(key, a.quantite_livree)}
                          >
                            <Pencil className="w-3 h-3" />
                            <span className="text-xs ml-1">
                              Modifier quantité
                            </span>
                          </Button>
                        </div>
                      )
                    )}

                    {a.date_derniere_livraison && (
                      <div className="mt-2 bg-muted border border-border rounded-lg p-2 text-center">
                        <span className="text-xs text-muted-foreground">
                          Mise à jour:{" "}
                        </span>
                        <span className="text-sm text-foreground">
                          {new Date(a.date_derniere_livraison).toLocaleString(
                            "fr-FR",
                            {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Résumé + Actions */}
        <div className="mt-6 bg-card border border-border rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-2">
            <h2 className="text-lg font-semibold text-foreground">
              Résumé
            </h2>
          </div>
          <Separator />
          <div className="px-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="grid gap-1">
                <div className="text-sm text-muted-foreground">Articles</div>
                <div className="text-lg font-bold text-foreground">
                  {localColisData.articles.length} ({totalArticlesQty} unités)
                </div>
              </div>
              <div className="grid gap-1">
                <div className="text-sm text-muted-foreground">Total livré</div>
                <div className="text-lg font-bold text-foreground">
                  {localColisData.articles.reduce((s, x) => s + (x.quantite_livree || 0), 0)}
                </div>
              </div>
              <div className="grid gap-1">
                <div className="text-sm text-muted-foreground">Total restant</div>
                <div className="text-lg font-bold text-foreground">
                  {localColisData.articles.reduce((s, x) => s + (x.quantite_restante || 0), 0)}
                </div>
              </div>
            </div>

            {/* Actions globales */}
            {localColisData.articles.some((a) => a.quantite_restante > 0) && canDeliver() && (
              <div className="mt-4">
                <Button
                  onClick={markAllArticlesAsDelivered}
                  disabled={isSaving}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Marquer comme livré
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Informations de livraison */}
        <div className="mt-6 bg-card border border-border rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-2">
            <h2 className="text-lg font-semibold text-foreground">
              Informations de livraison
            </h2>
          </div>
          <Separator />
          <div className="px-4 py-4">
            {/* Photo */}
            <div className="flex justify-center">
              <div className="w-full max-w-md">
                <h3 className="text-base font-medium mb-2 text-foreground">
                  Photo de livraison
                </h3>

                {isCapturing ? (
                  <div className="w-full">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full h-48 bg-black rounded-lg object-cover"
                    />
                    <canvas ref={canvasRef} style={{ display: "none" }} />
                    <div className="flex gap-2 mt-2 justify-center">
                      <Button
                        size="sm"
                        onClick={capturePhoto}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        Capturer
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={stopCamera}
                        className="border-primary text-primary hover:bg-primary/10"
                      >
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : capturedPhoto ? (
                  <div className="w-full">
                    <img
                      src={capturedPhoto}
                      alt="Photo de livraison"
                      className="w-full h-48 object-cover rounded-lg border"
                    />
                    <div className="flex gap-2 mt-2 justify-center">
                      <Button
                        size="sm"
                        onClick={startCamera}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        Nouvelle photo
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={deletePhoto}
                        className="border-red-500 text-red-500 hover:bg-red-50"
                      >
                        Supprimer
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full">
                    <div className="w-full h-48 rounded-lg flex items-center justify-center border-2 border-dashed bg-muted border-border">
                      <div className="text-center">
                        <Camera className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
                        <div className="text-sm text-muted-foreground">Aucune photo</div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2 justify-center">
                      <Button
                        size="sm"
                        onClick={startCamera}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        Photo
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Commentaire */}
            <div className="mt-6">
              <h3 className="text-base font-medium mb-2 text-foreground">
                Commentaire
              </h3>

              {isEditingComment ? (
                <div>
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="w-full p-4 rounded-lg resize-none focus:outline-none bg-muted text-foreground border border-border text-sm leading-relaxed"
                    rows={4}
                    placeholder="Ajoutez un commentaire…"
                  />
                  <div className="flex gap-2 mt-3 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCommentText(localColisData?.commentaire_livreur || "");
                        setIsEditingComment(false);
                      }}
                      className="border-gray-500 text-gray-500 hover:bg-gray-100"
                    >
                      Annuler
                    </Button>
                    <Button
                      size="sm"
                      onClick={async () => {
                        await saveToBackend({ commentaire_livreur: commentText });
                        setIsEditingComment(false);
                      }}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Enregistrer
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="p-4 rounded-lg min-h-[100px] flex items-start bg-muted border border-border">
                    {commentText ? (
                      <div className="text-base text-foreground leading-relaxed">
                        {commentText}
                      </div>
                    ) : (
                      <div className="text-base text-muted-foreground italic">
                        Aucun commentaire
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsEditingComment(true)}
                      className="border-primary text-primary hover:bg-primary/10"
                    >
                      <Pencil className="w-4 h-4 mr-2" />
                      Modifier
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ColisDetails;