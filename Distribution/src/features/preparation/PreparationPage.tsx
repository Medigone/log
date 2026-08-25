import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  Filter,
  Package,
  Printer,
  QrCode,
  RotateCcw,
  ScanBarcode,
  Search,
} from "lucide-react";
import { apiErrorMessage } from "@/shared/api/distribution";
import {
  usePickSession,
  usePreparationMutations,
  usePreparationQueue,
  useRecentPickLists,
  applyBarcodeScan,
  getPickGroupLocations,
  type DeliveryNoteResult,
  type SalesOrderRow,
} from "@/shared/api/preparation";
import { ReturnControlPanel } from "@/features/preparation/ReturnControlPanel";

function priority(date?: string) {
  if (!date) return { label: "Date à confirmer", className: "bg-slate-100 text-slate-600" };
  const target = new Date(`${date}T00:00:00`);
  const current = new Date();
  current.setHours(0, 0, 0, 0);
  if (target < current) return { label: "En retard", className: "bg-red-100 text-red-700" };
  if (target.getTime() === current.getTime()) return { label: "Aujourd’hui", className: "bg-amber-100 text-amber-700" };
  return { label: "Planifiée", className: "bg-blue-50 text-blue-700" };
}

type DateScope = "all" | "today" | "tomorrow" | "overdue";

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatQty(value: number) {
  return new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 3 }).format(value);
}

function stockShortages(order: SalesOrderRow) {
  return order.stock_shortages || [];
}

function isoDateWithOffset(days: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
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
  const [confirming, setConfirming] = useState(false);
  const [dateScope, setDateScope] = useState<DateScope>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [wilaya, setWilaya] = useState("");
  const [commune, setCommune] = useState("");
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const { data, mutate, error, isLoading } = usePreparationQueue();
  const { data: recentData, isLoading: recentLoading } = useRecentPickLists();
  const { createPickList, creating } = usePreparationMutations();

  const orders = useMemo(() => data?.message || [], [data?.message]);
  const recentPickLists = recentData?.message || [];
  const selectedOrders = useMemo(
    () => orders.filter((order) => selected.has(order.name)),
    [orders, selected],
  );
  const wilayas = useMemo(
    () => Array.from(new Set(orders.map((order) => order.custom_wilaya).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "fr")),
    [orders],
  );
  const communes = useMemo(
    () => Array.from(orders
      .filter((order) => (!wilaya || order.custom_wilaya === wilaya) && order.custom_commune)
      .reduce((values, order) => {
        const value = order.custom_commune as string;
        values.set(value, order.custom_commune_nom || value);
        return values;
      }, new Map<string, string>()))
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr")),
    [orders, wilaya],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = isoDateWithOffset(0);
    const tomorrow = isoDateWithOffset(1);
    return orders.filter((row) => {
      const matchesSearch = !q || [row.name, row.customer, row.customer_name, row.custom_commune, row.custom_commune_nom, row.custom_wilaya]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
      if (!matchesSearch) return false;
      if (wilaya && row.custom_wilaya !== wilaya) return false;
      if (commune && row.custom_commune !== commune) return false;

      const orderDate = row.delivery_date || row.transaction_date || "";
      if (dateScope === "today" && orderDate !== today) return false;
      if (dateScope === "tomorrow" && orderDate !== tomorrow) return false;
      if (dateScope === "overdue" && (!orderDate || orderDate >= today)) return false;
      if (dateFrom && (!orderDate || orderDate < dateFrom)) return false;
      if (dateTo && (!orderDate || orderDate > dateTo)) return false;
      return true;
    });
  }, [commune, dateFrom, dateScope, dateTo, orders, search, wilaya]);

  const allSelected = filtered.length > 0 && filtered.every((row) => selected.has(row.name));
  const activeFilterCount = [dateScope !== "all", dateFrom, dateTo, wilaya, commune].filter(Boolean).length;
  const insufficientOrders = selectedOrders.filter((order) => stockShortages(order).length > 0);

  useEffect(() => {
    if (!confirming) return;
    confirmButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !creating) setConfirming(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [confirming, creating]);

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((order) => {
        if (allSelected) next.delete(order.name);
        else next.add(order.name);
      });
      return next;
    });
  };

  const setQuickDate = (scope: DateScope) => {
    setDateScope(scope);
    setDateFrom("");
    setDateTo("");
  };

  const resetFilters = () => {
    setSearch("");
    setDateScope("all");
    setDateFrom("");
    setDateTo("");
    setWilaya("");
    setCommune("");
  };

  const handleCreate = async () => {
    const names = selectedOrders.map((order) => order.name);
    if (!names.length || insufficientOrders.length) return;
    setErrorMessage("");
    try {
      const session = await createPickList(names);
      const pickLists = (session?.pick_lists || [])
        .map((pickList) => pickList?.name)
        .filter((name): name is string => Boolean(name));
      if (!pickLists.length) {
        throw new Error("La création n’a retourné aucune liste de prélèvement. Rechargez la page puis réessayez.");
      }
      onOpenPickLists(pickLists, true);
      mutate();
    } catch (mutationError) {
      setConfirming(false);
      setErrorMessage(apiErrorMessage(mutationError));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-blue-700">Entrepôt</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Préparation</h1>
        <p className="text-muted-foreground text-sm">
          Commande client → Liste de prélèvement → Bon de livraison. Sélectionnez les commandes à prélever.
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
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Commandes à prélever ({filtered.length})</CardTitle>
            {selectedOrders.length > 0 && (
              <Badge aria-live="polite" className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                {selectedOrders.length} sélectionnée{selectedOrders.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
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
              onClick={toggleAllFiltered}
              disabled={!filtered.length}
            >
              {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
            </Button>
            <Button size="sm" onClick={() => setConfirming(true)} disabled={!selectedOrders.length || creating}>
              <ClipboardList className="w-4 h-4 mr-2" />
              {creating ? "Création…" : "Créer la liste de prélèvement"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Filter className="h-4 w-4 text-blue-700" />
                Filtres {activeFilterCount > 0 && <Badge variant="secondary">{activeFilterCount}</Badge>}
              </div>
              {(activeFilterCount > 0 || search) && (
                <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                  <RotateCcw className="mr-1 h-4 w-4" />
                  Réinitialiser
                </Button>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="md:col-span-2 xl:col-span-4">
                <span className="mb-1.5 block text-xs font-medium text-slate-600">Échéance</span>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par échéance">
                  {([
                    ["all", "Toutes"],
                    ["today", "Aujourd’hui"],
                    ["tomorrow", "Demain"],
                    ["overdue", "En retard"],
                  ] as Array<[DateScope, string]>).map(([scope, label]) => (
                    <Button
                      key={scope}
                      type="button"
                      size="sm"
                      variant={dateScope === scope ? "default" : "outline"}
                      onClick={() => setQuickDate(scope)}
                      aria-pressed={dateScope === scope}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              <label className="space-y-1.5 text-xs font-medium text-slate-600">
                Date de début
                <Input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setDateScope("all"); }} />
              </label>
              <label className="space-y-1.5 text-xs font-medium text-slate-600">
                Date de fin
                <Input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setDateTo(event.target.value); setDateScope("all"); }} />
              </label>
              <label className="space-y-1.5 text-xs font-medium text-slate-600">
                Wilaya
                <select
                  value={wilaya}
                  onChange={(event) => { setWilaya(event.target.value); setCommune(""); }}
                  className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm text-slate-900 shadow-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="">Toutes les wilayas</option>
                  {wilayas.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-xs font-medium text-slate-600">
                Commune
                <select
                  value={commune}
                  onChange={(event) => setCommune(event.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm text-slate-900 shadow-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="">Toutes les communes</option>
                  {communes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {!isLoading && filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
              <p className="text-sm font-medium text-slate-700">Aucune commande ne correspond aux filtres.</p>
              <Button type="button" variant="link" size="sm" onClick={resetFilters}>Réinitialiser les filtres</Button>
            </div>
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
                    {row.customer_name || row.customer} · {row.custom_commune_nom || row.custom_commune || "—"} ·{" "}
                    {row.delivery_date || row.transaction_date || "—"} · {row.total_qty || 0} art.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {stockShortages(row).length > 0 && (
                  <Badge variant="destructive" className="bg-red-100 text-red-800 hover:bg-red-100">Stock insuffisant</Badge>
                )}
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

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
          onMouseDown={() => !creating && setConfirming(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-pick-list-title"
            aria-describedby="confirm-pick-list-description"
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className={`rounded-xl p-2 ${insufficientOrders.length ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
                {insufficientOrders.length ? <AlertTriangle className="h-5 w-5" /> : <ClipboardList className="h-5 w-5" />}
              </div>
              <div>
                <h2 id="confirm-pick-list-title" className="text-lg font-bold text-slate-950">
                  {insufficientOrders.length ? "Stock insuffisant" : "Confirmer la création"}
                </h2>
                <p id="confirm-pick-list-description" className="mt-1 text-sm text-slate-600">
                  {insufficientOrders.length
                    ? "Réapprovisionnez l’entrepôt avant de créer la liste. ERPNext ne peut pas prélever un article sans stock disponible."
                    : `${selectedOrders.length} ${selectedOrders.length > 1 ? "listes de prélèvement seront créées" : "liste de prélèvement sera créée"}, une par commande sélectionnée.`}
                </p>
              </div>
            </div>

            <div className="mt-5 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
              {selectedOrders.map((order) => {
                const shortages = stockShortages(order);
                return (
                  <div key={order.name} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <strong className="text-slate-900">{order.name}</strong>
                      <span className="truncate text-slate-500">{order.customer_name || order.customer || "Client non renseigné"}</span>
                    </div>
                    {shortages.map((shortage) => (
                      <p key={`${order.name}-${shortage.item_code}`} className="text-xs text-red-700">
                        {shortage.item_name || shortage.item_code} : {formatQty(shortage.required)} demandé, {formatQty(shortage.available)} disponible
                        {shortage.warehouse ? ` · ${shortage.warehouse}` : ""}
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>

            <p className="mt-4 text-xs text-slate-500">
              {insufficientOrders.length
                ? "Désélectionnez les commandes en rupture ou réceptionnez le stock, puis réessayez."
                : "Les listes seront créées en brouillon et pourront être contrôlées avant la génération des bons de livraison."}
            </p>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={creating}>
                Annuler
              </Button>
              <Button ref={confirmButtonRef} type="button" onClick={handleCreate} disabled={creating || insufficientOrders.length > 0}>
                <ClipboardList className="mr-2 h-4 w-4" />
                {creating ? "Création…" : "Confirmer la création"}
              </Button>
            </div>
          </div>
        </div>
      )}

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
  const [confirmingBl, setConfirmingBl] = useState(false);
  const [scanValue, setScanValue] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [scanError, setScanError] = useState("");
  const [lastScannedKey, setLastScannedKey] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);
  const confirmBlButtonRef = useRef<HTMLButtonElement>(null);
  const groupRefs = useRef<Record<string, HTMLElement | null>>({});
  const pickedRef = useRef<Record<string, number>>({});

  const { data, mutate, error, isLoading } = usePickSession(pickListNames);
  const { updateQuantities, submitPickList, scanPickItem, saving, submitting, scanning } = usePreparationMutations();

  const session = data?.message;
  const pickLists = session?.pick_lists || [];
  const draftOpen = pickLists.some((item) => item.docstatus === 0);

  useEffect(() => {
    if (!session?.pick_lists) return;
    const next: Record<string, number> = {};
    session.pick_lists.flatMap((pickList) => pickList.locations || []).forEach((loc) => {
      next[loc.name] = loc.picked_qty ?? 0;
    });
    pickedRef.current = next;
    setPicked(next);
  }, [session]);

  const grouped = session?.grouped || [];
  const blCount = session?.sales_orders?.length || pickLists.length;
  const varianceGroups = grouped.filter((group) => {
    const pickedTotal = getPickGroupLocations(group).reduce(
      (sum, location) => sum + (picked[location.name] ?? location.picked_qty ?? 0),
      0,
    );
    return pickedTotal !== group.stock_qty;
  });

  useEffect(() => {
    if (!confirmingBl) return;
    confirmBlButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting && !saving) setConfirmingBl(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [confirmingBl, saving, submitting]);

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
    pickedRef.current = next;
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
      setConfirmingBl(false);
      mutate();
    } catch (mutationError) {
      setConfirmingBl(false);
      setErrorMessage(apiErrorMessage(mutationError));
    }
  };

  const handleScan = async (event: FormEvent) => {
    event.preventDefault();
    const value = scanValue.trim();
    if (!value || reviewing || scanning || !draftOpen) return;
    setScanMessage("");
    setScanError("");
    try {
      const result = await scanPickItem(value, pickListNames);
      const locations = pickLists.flatMap((pickList) => pickList.locations || []);
      const applied = applyBarcodeScan(locations, pickedRef.current, result.item_code, result.increment || 1);
      if (!applied.ok) {
        setScanError(
          applied.reason === "already_complete"
            ? `Quantité demandée déjà atteinte pour ${result.item_name || result.item_code}.`
            : "Cet article n'est pas dans la session de préparation.",
        );
        return;
      }
      const next = { ...pickedRef.current, [applied.locationName]: applied.nextQty };
      pickedRef.current = next;
      setPicked(next);
      const groupKey = `${applied.itemCode}-${applied.warehouse || ""}`;
      setLastScannedKey(groupKey);
      setScanMessage(`${result.item_name || result.item_code} · +${result.increment || 1}`);
      groupRefs.current[groupKey]?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (scanException) {
      setScanError(apiErrorMessage(scanException));
    } finally {
      setScanValue("");
      scanInputRef.current?.focus();
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
            Scannez les articles pour compter les quantités, puis créez les bons de livraison.
          </p>
        </div>
        {session && <Badge>{pickLists.every((item) => item.docstatus === 1) ? "Soumise" : `${pickLists.length} ${pickLists.length > 1 ? "listes de prélèvement" : "liste de prélèvement"}`}</Badge>}
      </div>

      <ol className="grid grid-cols-3 gap-2" aria-label="Étapes de préparation">
        {["Sélection", "Prélèvement", "Contrôle"].map((step, index) => <li key={step} className={`rounded-xl border p-3 text-center text-xs font-bold ${index < 2 || reviewing || pickLists.every((item) => item.docstatus === 1) ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-400"}`}><span className="mr-1">{index + 1}.</span>{step}</li>)}
      </ol>

      {creationConfirmed && (
        <Alert role="status" className="border-emerald-200 bg-emerald-50 text-emerald-900">
          <CheckCircle className="text-emerald-700" />
          <AlertDescription className="text-emerald-800">
            <strong>Liste de prélèvement créée avec succès.</strong>
            <span>{pickListNames.join(", ")}</span>
          </AlertDescription>
        </Alert>
      )}

      {createdNotes.length > 0 && (
        <Alert role="status" className="border-emerald-200 bg-emerald-50 text-emerald-900">
          <CheckCircle className="text-emerald-700" />
          <AlertDescription className="text-emerald-800">
            <strong>Bons de livraison créés avec succès.</strong>
            <span> {createdNotes.map((note) => note.name).join(", ")}</span>
          </AlertDescription>
        </Alert>
      )}

      {(error || errorMessage) && (
        <Alert>
          <AlertDescription>{errorMessage || "Impossible de charger la liste de prélèvement."}</AlertDescription>
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
          {!reviewing && draftOpen && (
            <form onSubmit={handleScan} className="sticky top-0 z-10 space-y-2 rounded-lg border border-blue-200 bg-blue-50/80 p-3 backdrop-blur">
              <label htmlFor="pick-scan-barcode" className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <ScanBarcode className="h-4 w-4" />
                Code-barres article
              </label>
              <Input
                id="pick-scan-barcode"
                ref={scanInputRef}
                value={scanValue}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                disabled={scanning || submitting || saving}
                placeholder="Scanner puis Entrée"
                onChange={(event) => setScanValue(event.target.value)}
              />
              <p className={`text-xs ${scanError ? "text-red-700" : "text-slate-600"}`} aria-live="polite">
                {scanning ? "Lecture…" : scanError || scanMessage || "Chaque scan ajoute une unité (ou le pack) jusqu’à la quantité demandée."}
              </p>
            </form>
          )}
          {isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {!isLoading && grouped.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune ligne dans cette liste de prélèvement.</p>
          )}
          {!reviewing && grouped.map((group) => (
            <div
              key={`${group.item_code}-${group.warehouse}`}
              ref={(node) => {
                groupRefs.current[`${group.item_code}-${group.warehouse || ""}`] = node;
              }}
              className={`rounded-lg border p-3 space-y-2 ${lastScannedKey === `${group.item_code}-${group.warehouse || ""}` ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-300" : ""}`}
            >
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
                        setPicked((prev) => {
                          const next = { ...prev, [loc.name]: Number(e.target.value) };
                          pickedRef.current = next;
                          return next;
                        })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          ))}
          {reviewing && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
                  <div>
                    <h3 className="font-bold text-amber-900">Vérifiez les écarts avant création des BL</h3>
                    <p className="mt-1 text-sm text-amber-800">
                      Après confirmation, les quantités sont enregistrées sur le serveur, la liste de prélèvement est soumise et les bons de livraison sont créés.
                    </p>
                  </div>
                </div>
              </div>
              {grouped.map((group) => {
                const pickedTotal = getPickGroupLocations(group).reduce(
                  (sum, location) => sum + (picked[location.name] ?? location.picked_qty ?? 0),
                  0,
                );
                const difference = pickedTotal - group.stock_qty;
                return (
                  <div key={`${group.item_code}-${group.warehouse}-review`} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[1fr_auto_auto_auto]">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{group.item_code} · {group.item_name}</p>
                      <p className="text-xs text-slate-500">{group.warehouse || "Emplacement non défini"}</p>
                    </div>
                    <p className="text-sm"><span className="block text-xs text-slate-500">Demandé</span><strong>{group.stock_qty}</strong></p>
                    <p className="text-sm"><span className="block text-xs text-slate-500">Prélevé</span><strong>{pickedTotal}</strong></p>
                    <p className={`text-sm ${difference === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                      <span className="block text-xs">Écart</span>
                      <strong>{difference > 0 ? "+" : ""}{difference}</strong>
                    </p>
                  </div>
                );
              })}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setReviewing(false)}>Retour au prélèvement</Button>
                <Button onClick={() => setConfirmingBl(true)} disabled={submitting || saving}>
                  <CheckCircle />
                  Confirmer et créer les BL
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {confirmingBl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
          onMouseDown={() => !submitting && !saving && setConfirmingBl(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-delivery-notes-title"
            aria-describedby="confirm-delivery-notes-description"
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className={`rounded-xl p-2 ${varianceGroups.length ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
                {varianceGroups.length ? <AlertTriangle className="h-5 w-5" /> : <Package className="h-5 w-5" />}
              </div>
              <div>
                <h2 id="confirm-delivery-notes-title" className="text-lg font-bold text-slate-950">
                  Confirmer la création des BL
                </h2>
                <p id="confirm-delivery-notes-description" className="mt-1 text-sm text-slate-600">
                  {blCount > 1
                    ? `${blCount} bons de livraison seront créés, un par commande de la session.`
                    : "Un bon de livraison sera créé pour la commande de cette session."}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <p><strong>{pickLists.length}</strong> {pickLists.length > 1 ? "listes de prélèvement seront soumises" : "liste de prélèvement sera soumise"}.</p>
              {varianceGroups.length > 0 && (
                <p className="text-amber-800">
                  {varianceGroups.length} article{varianceGroups.length > 1 ? "s" : ""} avec écart : les BL partiront des quantités prélevées, pas des quantités demandées.
                </p>
              )}
            </div>

            <p className="mt-4 text-xs text-slate-500">
              Cette action enregistre les quantités, soumet les listes et crée les BL. Elle ne peut pas être annulée.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setConfirmingBl(false)} disabled={submitting || saving}>
                Annuler
              </Button>
              <Button ref={confirmBlButtonRef} type="button" onClick={handleSubmit} disabled={submitting || saving}>
                <Package className="mr-2 h-4 w-4" />
                {submitting || saving ? "Création…" : "Créer les BL"}
              </Button>
            </div>
          </div>
        </div>
      )}

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
    <div className="space-y-6">
      <ReturnControlPanel />
      <SalesOrderPicker
        onOpenPickLists={(names, created = false) => {
          setSearchParams({ pick_lists: names.join(","), ...(created ? { created: "1" } : {}) });
        }}
      />
    </div>
  );
}

export default PreparationPage;
