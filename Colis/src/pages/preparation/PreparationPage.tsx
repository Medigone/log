import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  CheckCircle,
  ClipboardList,
  Package,
  Printer,
  QrCode,
  Search,
} from "lucide-react";
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

interface SalesOrderRow {
  name: string;
  customer?: string;
  customer_name?: string;
  transaction_date?: string;
  delivery_date?: string;
  grand_total?: number;
  total_qty?: number;
  per_picked?: number;
  custom_commune?: string;
  custom_wilaya?: string;
  draft_pick_list?: string;
}

interface PickLocation {
  name: string;
  item_code: string;
  item_name?: string;
  warehouse?: string;
  qty: number;
  stock_qty: number;
  picked_qty: number;
  sales_order?: string;
  uom?: string;
  stock_uom?: string;
}

interface PickGroup {
  item_code: string;
  item_name?: string;
  warehouse?: string;
  stock_qty: number;
  uom?: string;
  locations: PickLocation[];
}

interface PickListData {
  name: string;
  docstatus: number;
  locations: PickLocation[];
  grouped: PickGroup[];
  sales_orders: string[];
}

interface DeliveryNoteResult {
  name: string;
  customer_name?: string;
  customer?: string;
  custom_qr_image?: string;
  image?: string;
  custom_statut?: string;
  status?: string;
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

function SalesOrderPicker({ onOpenPickList }: { onOpenPickList: (name: string) => void }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState("");

  const { data, mutate, error, isLoading } = useFrappeGetCall<{ message: SalesOrderRow[] }>(
    "log.pick_list_ops.get_sales_orders_to_pick",
    { limit: 200 }
  );

  const { call: createPickList, loading: creating } = useFrappePostCall(
    "log.pick_list_ops.create_pick_list_from_sales_orders"
  );

  const orders = data?.message || [];
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
      const res = (await createPickList({ sales_orders: names })) as {
        message?: PickListData;
        name?: string;
      };
      const pickList = res?.message || res;
      if (pickList?.name) onOpenPickList(pickList.name);
      mutate();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Impossible de créer la Pick List.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Préparation</h1>
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
              Créer la Pick List
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
                {row.draft_pick_list ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.preventDefault();
                      onOpenPickList(row.draft_pick_list as string);
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
    </div>
  );
}

function PickListWorkspace({ pickListName, onBack }: { pickListName: string; onBack: () => void }) {
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [createdNotes, setCreatedNotes] = useState<DeliveryNoteResult[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  const { data, mutate, error, isLoading } = useFrappeGetCall<{ message: PickListData }>(
    "log.pick_list_ops.get_pick_list",
    { pick_list: pickListName }
  );

  const { call: saveQty, loading: saving } = useFrappePostCall("log.pick_list_ops.update_picked_qty");
  const { call: submitPickList, loading: submitting } = useFrappePostCall(
    "log.pick_list_ops.submit_pick_list_and_create_dns"
  );

  const pickList = data?.message;

  useEffect(() => {
    if (!pickList?.locations) return;
    const next: Record<string, number> = {};
    pickList.locations.forEach((loc) => {
      next[loc.name] = loc.picked_qty || loc.stock_qty || loc.qty || 0;
    });
    setPicked(next);
  }, [pickList]);

  const grouped = pickList?.grouped || [];

  const persistQty = async () => {
    if (!pickList || pickList.docstatus !== 0) return;
    await saveQty({
      pick_list: pickList.name,
      locations: Object.entries(picked).map(([name, picked_qty]) => ({ name, picked_qty })),
    });
    mutate();
  };

  const fillRequested = () => {
    if (!pickList) return;
    const next: Record<string, number> = {};
    pickList.locations.forEach((loc) => {
      next[loc.name] = loc.stock_qty || loc.qty || 0;
    });
    setPicked(next);
  };

  const handleSubmit = async () => {
    setErrorMessage("");
    try {
      await persistQty();
      const res = (await submitPickList({ pick_list: pickListName })) as {
        message?: { delivery_notes?: DeliveryNoteResult[] };
        delivery_notes?: DeliveryNoteResult[];
      };
      setCreatedNotes(res?.message?.delivery_notes || res?.delivery_notes || []);
      mutate();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Échec de la soumission de la Pick List.");
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
          <h1 className="text-2xl font-semibold">Pick List {pickListName}</h1>
          <p className="text-muted-foreground text-sm">
            Confirmez les quantités prélevées, puis créez les bons de livraison.
          </p>
        </div>
        {pickList && <Badge>{pickList.docstatus === 1 ? "Soumise" : "Brouillon"}</Badge>}
      </div>

      {(error || errorMessage) && (
        <Alert>
          <AlertDescription>{errorMessage || "Impossible de charger la Pick List."}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0">
          <CardTitle className="text-base">
            Lignes à prélever ({pickList?.sales_orders?.length || 0} commande
            {(pickList?.sales_orders?.length || 0) > 1 ? "s" : ""})
          </CardTitle>
          {pickList?.docstatus === 0 && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fillRequested}>
                Tout prélever
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={submitting || saving || isLoading}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Soumettre et créer les BL
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {!isLoading && grouped.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune ligne dans cette Pick List.</p>
          )}
          {grouped.map((group) => (
            <div key={`${group.item_code}-${group.warehouse}`} className="rounded-lg border p-3 space-y-2">
              <div>
                <div className="font-medium text-sm">
                  {group.item_code} · {group.item_name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {group.warehouse || "Entrepôt non défini"} · demandé {group.stock_qty} {group.uom || ""}
                </div>
              </div>
              {group.locations.map((loc) => (
                <div key={loc.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground truncate">{loc.sales_order}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {loc.stock_qty} {loc.stock_uom || loc.uom}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      className="w-24 h-8"
                      disabled={pickList?.docstatus !== 0}
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
  const pickListName = searchParams.get("pick_list") || "";

  if (pickListName) {
    return (
      <PickListWorkspace
        pickListName={pickListName}
        onBack={() => {
          setSearchParams({});
          navigate("/preparation");
        }}
      />
    );
  }

  return (
    <SalesOrderPicker
      onOpenPickList={(name) => {
        setSearchParams({ pick_list: name });
      }}
    />
  );
}

export default PreparationPage;
