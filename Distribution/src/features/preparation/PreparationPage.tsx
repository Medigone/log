import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  ClipboardList,
  Package,
  Printer,
  QrCode,
  Search,
} from "lucide-react";
import { apiErrorMessage } from "@/shared/api/distribution";
import {
  usePickSession,
  usePreparationMutations,
  usePreparationQueue,
  useRecentPickLists,
  getPickGroupLocations,
  type DeliveryNoteResult,
} from "@/shared/api/preparation";

function priority(date?: string) {
  if (!date) return { label: "Date à confirmer", className: "bg-slate-100 text-slate-600" };
  const target = new Date(`${date}T00:00:00`);
  const current = new Date();
  current.setHours(0, 0, 0, 0);
  if (target < current) return { label: "En retard", className: "bg-red-100 text-red-700" };
  if (target.getTime() === current.getTime()) return { label: "Aujourd’hui", className: "bg-amber-100 text-amber-700" };
  return { label: "Planifiée", className: "bg-blue-50 text-blue-700" };
}

function printQr(note: DeliveryNoteResult) {
  const src = note.custom_qr_image || note.image;
  if (!src) return;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(
    `<html><head><title>QR ${note.name}</title></head><body style="text-align:center;font-family:sans-serif"><h2>${note.name}</h2><p>${note.customer_name || note.customer || ""}</p><img src="${src}" style="max-width:320px"/></body></html>`
  );
  win.document.close();
  win.print();
}

function SalesOrderPicker({ onOpenPickLists }: { onOpenPickLists: (names: string[], created?: boolean) => void }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState("");

  const { data, mutate, error, isLoading } = usePreparationQueue();
  const { data: recentData, isLoading: recentLoading } = useRecentPickLists();
  const { createPickList, creating } = usePreparationMutations();

  const orders = useMemo(() => data?.message || [], [data?.message]);
  const recentPickLists = recentData?.message || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((row) =>
      [row.name, row.customer, row.customer_name, row.custom_commune, row.custom_wilaya]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [orders, search]);

  const allSelected = filtered.length > 0 && filtered.every((row) => selected.has(row.name));

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleCreate = async () => {
    const names = Array.from(selected);
    if (!names.length) return;
    setErrorMessage("");
    try {
      const session = await createPickList(names);
      const pickLists = (session?.pick_lists || [])
        .map((pickList) => pickList?.name)
        .filter((name): name is string => Boolean(name));
      if (!pickLists.length) {
        throw new Error("La création n’a retourné aucune Pick List. Rechargez la page puis réessayez.");
      }
      onOpenPickLists(pickLists, true);
      mutate();
    } catch (mutationError) {
      setErrorMessage(apiErrorMessage(mutationError));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-blue-700">Entrepôt</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Préparation</h1>
        <p className="text-muted-foreground text-sm">
          Commande client → Pick List → Bon de livraison. Sélectionnez les commandes à prélever.
        </p>
      </div>

      {(error || errorMessage) && (
        <Alert>
          <AlertDescription>
            {errorMessage || "Impossible de charger les commandes à préparer."}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0">
          <CardTitle className="text-base">Commandes à prélever ({filtered.length})</CardTitle>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="pl-8 w-52"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setSelected(allSelected ? new Set() : new Set(filtered.map((row) => row.name)))
              }
              disabled={!filtered.length}
            >
              {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={!selected.size || creating}>
              <ClipboardList className="w-4 h-4 mr-2" />
              {creating ? "Création…" : "Créer la Pick List"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune commande à prélever.</p>
          )}
          {filtered.map((row) => (
            <label
              key={row.name}
              className="flex items-center justify-between gap-3 rounded-lg border p-3 cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <input type="checkbox" checked={selected.has(row.name)} onChange={() => toggle(row.name)} />
                <Package className="w-4 h-4 shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium text-sm">{row.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {row.customer_name || row.customer} · {row.custom_commune || "—"} ·{" "}
                    {row.delivery_date || row.transaction_date || "—"} · {row.total_qty || 0} art.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${priority(row.delivery_date).className}`}>{priority(row.delivery_date).label}</span>
                {row.draft_pick_list ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.preventDefault();
                      onOpenPickLists([row.draft_pick_list as string]);
                    }}
                  >
                    Ouvrir {row.draft_pick_list}
                  </Button>
                ) : (
                  <Badge variant="secondary">{Math.round(row.per_picked || 0)}% prélevé</Badge>
                )}
              </div>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Sessions récentes</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {recentLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {recentPickLists.map((pickList) => <div key={pickList.name} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-900">{pickList.name}</strong><Badge variant={pickList.docstatus === 1 ? "default" : "secondary"}>{pickList.docstatus === 1 ? "Soumise" : "Brouillon"}</Badge></div><p className="mt-1 text-xs text-slate-500">{pickList.sales_order_count} commande(s) · {pickList.delivery_notes.length ? `BL produits : ${pickList.delivery_notes.join(", ")}` : "Aucun BL produit"}</p></div><Button type="button" size="sm" variant="outline" onClick={() => onOpenPickLists([pickList.name])}>Ouvrir</Button></div>)}
          {!recentLoading && !recentPickLists.length && <p className="text-sm text-muted-foreground">Aucune session récente.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function PickListWorkspace({ pickListNames, creationConfirmed, onBack }: { pickListNames: string[]; creationConfirmed: boolean; onBack: () => void }) {
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [createdNotes, setCreatedNotes] = useState<DeliveryNoteResult[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const { data, mutate, error, isLoading } = usePickSession(pickListNames);
  const { updateQuantities, submitPickList, saving, submitting } = usePreparationMutations();

  const session = data?.message;
  const pickLists = session?.pick_lists || [];

  useEffect(() => {
    if (!session?.pick_lists) return;
    const next: Record<string, number> = {};
    session.pick_lists.flatMap((pickList) => pickList.locations || []).forEach((loc) => {
      next[loc.name] = loc.picked_qty ?? loc.stock_qty ?? loc.qty ?? 0;
    });
    setPicked(next);
  }, [session]);

  const grouped = session?.grouped || [];

  const persistQty = async () => {
    for (const pickList of pickLists.filter((item) => item.docstatus === 0)) {
      await updateQuantities(
        pickList.name,
        (pickList.locations || []).map((location) => ({ name: location.name, picked_qty: picked[location.name] ?? 0 })),
      );
    }
    mutate();
  };

  const fillRequested = () => {
    if (!session) return;
    const next: Record<string, number> = {};
    pickLists.flatMap((pickList) => pickList.locations || []).forEach((loc) => {
      next[loc.name] = loc.stock_qty || loc.qty || 0;
    });
    setPicked(next);
  };

  const handleSubmit = async () => {
    setErrorMessage("");
    try {
      await persistQty();
      const notes: DeliveryNoteResult[] = [];
      for (const pickList of pickLists) {
        const result = await submitPickList(pickList.name);
        notes.push(...(result.delivery_notes || []));
      }
      setCreatedNotes(notes);
      setReviewing(false);
      mutate();
    } catch (mutationError) {
      setErrorMessage(apiErrorMessage(mutationError));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Commandes
          </Button>
          <h1 className="text-2xl font-semibold">Session de préparation</h1>
          <p className="text-muted-foreground text-sm">
            Confirmez les quantités prélevées, puis créez les bons de livraison.
          </p>
        </div>
        {session && <Badge>{pickLists.every((item) => item.docstatus === 1) ? "Soumise" : `${pickLists.length} Pick List(s)`}</Badge>}
      </div>

      <ol className="grid grid-cols-3 gap-2" aria-label="Étapes de préparation">
        {["Sélection", "Picking", "Contrôle"].map((step, index) => <li key={step} className={`rounded-xl border p-3 text-center text-xs font-bold ${index < 2 || reviewing || pickLists.every((item) => item.docstatus === 1) ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-400"}`}><span className="mr-1">{index + 1}.</span>{step}</li>)}
      </ol>

      {creationConfirmed && (
        <Alert role="status" className="border-emerald-200 bg-emerald-50 text-emerald-900">
          <CheckCircle className="text-emerald-700" />
          <AlertDescription className="text-emerald-800">
            <strong>Pick List créée avec succès.</strong>
            <span>{pickListNames.join(", ")}</span>
          </AlertDescription>
        </Alert>
      )}

      {(error || errorMessage) && (
        <Alert>
          <AlertDescription>{errorMessage || "Impossible de charger la Pick List."}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0">
          <CardTitle className="text-base">
            Lignes groupées à prélever ({session?.sales_orders?.length || 0} commande
            {(session?.sales_orders?.length || 0) > 1 ? "s" : ""})
          </CardTitle>
          {pickLists.some((item) => item.docstatus === 0) && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fillRequested}>
                Tout prélever
              </Button>
              <Button size="sm" onClick={() => setReviewing(true)} disabled={submitting || saving || isLoading}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Contrôle final
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {!isLoading && grouped.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune ligne dans cette Pick List.</p>
          )}
          {!reviewing && grouped.map((group) => (
            <div key={`${group.item_code}-${group.warehouse}`} className="rounded-lg border p-3 space-y-2">
              <div>
                <div className="font-medium text-sm">
                  {group.item_code} · {group.item_name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {group.warehouse || "Entrepôt non défini"} · demandé {group.stock_qty} {group.uom || ""}
                </div>
              </div>
              {getPickGroupLocations(group).map((loc) => (
                <div key={loc.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground truncate">{loc.sales_order}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {loc.stock_qty} {loc.stock_uom || loc.uom}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      max={loc.stock_qty}
                      step="any"
                      className="w-24 h-8"
                      disabled={pickLists.find((item) => item.name === loc.pick_list)?.docstatus !== 0}
                      value={picked[loc.name] ?? loc.picked_qty ?? 0}
                      onChange={(e) =>
                        setPicked((prev) => ({ ...prev, [loc.name]: Number(e.target.value) }))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          ))}
          {reviewing && <div className="space-y-4"><div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" /><div><h3 className="font-bold text-amber-900">Vérifiez les écarts avant création des BL</h3><p className="mt-1 text-sm text-amber-800">Après confirmation, les quantités sont enregistrées sur le serveur, la Pick List est soumise et les bons de livraison sont créés.</p></div></div></div>{grouped.map((group) => { const pickedTotal = getPickGroupLocations(group).reduce((sum, location) => sum + (picked[location.name] ?? location.picked_qty ?? 0), 0); const difference = pickedTotal - group.stock_qty; return <div key={`${group.item_code}-${group.warehouse}-review`} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[1fr_auto_auto_auto]"><div><p className="text-sm font-bold text-slate-900">{group.item_code} · {group.item_name}</p><p className="text-xs text-slate-500">{group.warehouse || "Emplacement non défini"}</p></div><p className="text-sm"><span className="block text-xs text-slate-500">Demandé</span><strong>{group.stock_qty}</strong></p><p className="text-sm"><span className="block text-xs text-slate-500">Prélevé</span><strong>{pickedTotal}</strong></p><p className={`text-sm ${difference === 0 ? "text-emerald-700" : "text-amber-700"}`}><span className="block text-xs">Écart</span><strong>{difference > 0 ? "+" : ""}{difference}</strong></p></div>; })}<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setReviewing(false)}>Retour au picking</Button><Button onClick={handleSubmit} disabled={submitting || saving}><CheckCircle />Confirmer et créer les BL</Button></div></div>}
        </CardContent>
      </Card>

      {createdNotes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bons créés ({createdNotes.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {createdNotes.map((note) => (
              <div key={note.name} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <div className="font-medium text-sm">{note.name}</div>
                  <div className="text-xs text-muted-foreground">{note.customer_name || note.customer}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{note.custom_statut || note.status || "Préparé"}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => printQr(note)}
                    disabled={!(note.custom_qr_image || note.image)}
                  >
                    <QrCode className="w-4 h-4 mr-1" />
                    <Printer className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function PreparationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const pickListNames = (searchParams.get("pick_lists") || searchParams.get("pick_list") || "").split(",").filter(Boolean);

  if (pickListNames.length) {
    return (
      <PickListWorkspace
        pickListNames={pickListNames}
        creationConfirmed={searchParams.get("created") === "1"}
        onBack={() => {
          setSearchParams({});
          navigate("/preparation");
        }}
      />
    );
  }

  return (
    <SalesOrderPicker
      onOpenPickLists={(names, created = false) => {
        setSearchParams({ pick_lists: names.join(","), ...(created ? { created: "1" } : {}) });
      }}
    />
  );
}

export default PreparationPage;
