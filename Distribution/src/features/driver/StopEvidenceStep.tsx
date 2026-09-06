import { useEffect, useRef, useState } from "react";
import { Camera, Check, LocateFixed, RotateCcw, X } from "lucide-react";
import { Circle, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { divIcon } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SignaturePad } from "@/features/driver/SignaturePad";
import { compressImage } from "@/features/driver/stopHelpers";
import { formatDriverMoney } from "@/features/driver/driverMobile";
import { cn } from "@/lib/utils";
import type { EvidenceInput, RouteStop } from "@/shared/types/distribution";

function distanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude?: number; longitude?: number },
) {
  if (to.latitude == null || to.longitude == null) return null;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.sqrt(a)));
}

const gpsIcon = divIcon({
  className: "distribution-evidence-pin",
  html: `<span class="block size-3.5 rounded-full border-2 border-white bg-emerald-500 shadow"></span>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function FitGps({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([latitude, longitude], 17);
  }, [map, latitude, longitude]);
  return null;
}

function EvidenceMapBanner({
  stop,
  latitude,
  longitude,
  accuracy,
  distance,
}: {
  stop: RouteStop;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  distance: number | null;
}) {
  const located = latitude != null && longitude != null;
  return (
    <div className="relative h-[118px] shrink-0 overflow-hidden bg-muted" data-map-root>
      {located ? (
        <MapContainer
          center={[latitude, longitude]}
          zoom={17}
          scrollWheelZoom={false}
          dragging={false}
          zoomControl={false}
          attributionControl={false}
          className="h-full w-full"
        >
          <FitGps latitude={latitude} longitude={longitude} />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {accuracy ? (
            <Circle
              center={[latitude, longitude]}
              radius={accuracy}
              pathOptions={{ color: "#10b981", fillColor: "#10b981", fillOpacity: 0.18, weight: 1 }}
            />
          ) : null}
          <Marker position={[latitude, longitude]} icon={gpsIcon} />
        </MapContainer>
      ) : (
        <div className="h-full w-full bg-muted" />
      )}
      <div className="pointer-events-none absolute top-3 left-3 max-w-[85%] truncate rounded-full bg-background/95 px-2.5 py-1 text-xs font-semibold shadow-sm">
        {stop.customerName}
        {distance != null ? <span className="num font-medium text-muted-foreground"> · {distance} m</span> : null}
      </div>
    </div>
  );
}

function SignatureGlyph() {
  return (
    <svg viewBox="0 0 32 18" className="size-8 text-subtle" aria-hidden="true">
      <path
        d="M2 14c4-8 6-2 8 1 2-7 4-11 7-4 2 4 4 2 7-2 2-3 4-1 6 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function StopEvidenceStep({
  stop,
  evidence,
  locating,
  stepIndex,
  stepCount,
  amount,
  nextLabel,
  saving,
  error,
  onRetryGps,
  onChange,
  onBack,
  onContinue,
}: {
  stop: RouteStop;
  evidence: Partial<EvidenceInput>;
  locating: boolean;
  stepIndex: number;
  stepCount: number;
  amount: number;
  nextLabel: string;
  saving: boolean;
  error?: string;
  onRetryGps: () => void;
  onChange: (patch: Partial<EvidenceInput>) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [padKey, setPadKey] = useState(0);
  const [preview, setPreview] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const located = evidence.latitude != null && evidence.longitude != null;
  const signed = Boolean(evidence.signatureData);
  const hasPhoto = Boolean(evidence.photoData);
  const complete = hasPhoto && signed;
  const distance =
    located && evidence.latitude != null && evidence.longitude != null
      ? distanceMeters({ latitude: evidence.latitude, longitude: evidence.longitude }, stop)
      : null;

  const addPhoto = async (file?: File) => {
    if (!file) return;
    try {
      onChange({ photoData: await compressImage(file) });
    } catch {
      onChange({});
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const clearSignature = () => {
    onChange({ signatureData: undefined });
    setPadKey((current) => current + 1);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-surface-subtle">
      <EvidenceMapBanner
        stop={stop}
        latitude={evidence.latitude}
        longitude={evidence.longitude}
        accuracy={evidence.accuracy}
        distance={distance}
      />

      <div className="-mt-5 flex min-h-0 flex-1 flex-col rounded-t-[20px] bg-background shadow-[0_-8px_24px_-12px_rgba(9,9,11,0.28)]">
        <div className="shrink-0 border-b px-4 pb-3 pt-2.5">
          <span className="mx-auto mb-3 block h-1 w-9 rounded-full bg-border" />
          <p className="num t-meta text-muted-foreground">
            {stop.deliveryNote} · étape {stepIndex + 1} / {stepCount}
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">Preuves de livraison</h2>
          <p className={cn("mt-0.5 text-sm", complete ? "font-medium text-emerald-600" : "text-muted-foreground")}>
            {complete ? "Tout est collecté" : `${stop.customerName} · photo et signature facultatives`}
          </p>
          <div className="mt-3 flex gap-1" aria-hidden="true">
            {Array.from({ length: stepCount }, (_, index) => (
              <span
                key={index}
                className={cn("h-1 flex-1 rounded-sm", index <= stepIndex ? "bg-foreground" : "bg-border")}
              />
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          {error ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <div className="flex items-center gap-2.5 rounded-touch border bg-background px-3 py-2.5">
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-lg",
                located ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-700",
              )}
            >
              <LocateFixed className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold">{located ? "Position acquise" : locating ? "Position en cours" : "Position manquante"}</p>
              <p className="num truncate text-xs text-emerald-600">
                {located
                  ? `${Math.round(evidence.accuracy || 0)} m${distance != null ? ` · ${distance} m du client` : ""}`
                  : "En attente du GPS"}
              </p>
            </div>
            <button type="button" onClick={onRetryGps} className="shrink-0 text-xs font-semibold text-muted-foreground">
              Reprendre
            </button>
          </div>

          <section>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Photo de livraison</h3>
              {hasPhoto ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <Check className="size-3.5" strokeWidth={2.5} />
                  Ajoutée
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Facultative</span>
              )}
            </div>
            {hasPhoto ? (
              <div className="flex h-[74px] items-center gap-3 rounded-xl border bg-background p-2">
                <button
                  type="button"
                  onClick={() => setPreview(true)}
                  className="shrink-0 overflow-hidden rounded-lg"
                >
                  <img
                    src={evidence.photoData}
                    alt="Photo de livraison"
                    className="size-[3.625rem] object-cover"
                  />
                </button>
                <button type="button" onClick={() => setPreview(true)} className="min-w-0 flex-1 text-left text-xs text-muted-foreground">
                  Appuyer pour agrandir
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Retirer la photo"
                  onClick={() => onChange({ photoData: undefined })}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <label className="flex h-[74px] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-[1.5px] border-dashed">
                <Camera className="size-5 text-muted-foreground" />
                <span className="text-sm font-semibold">Prendre une photo</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => void addPhoto(event.target.files?.[0])}
                />
              </label>
            )}
          </section>

          <section className="flex min-h-0 flex-1 flex-col">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Signature du client</h3>
              {signed ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <Check className="size-3.5" strokeWidth={2.5} />
                  Signée
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Facultative</span>
              )}
            </div>
            <div
              className={cn(
                "relative min-h-[9rem] flex-1 overflow-hidden rounded-xl",
                signed ? "border bg-background" : "border-[1.5px] border-dashed",
              )}
            >
              <SignaturePad
                key={padKey}
                showClearButton={false}
                onChange={(signatureData) => onChange({ signatureData })}
              />
              {!signed ? (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
                  <SignatureGlyph />
                  <p className="text-[13.5px] font-semibold text-muted-foreground">Faire signer ici</p>
                  <p className="text-xs text-subtle">Passez le téléphone au client</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={clearSignature}
                  className="absolute right-2.5 bottom-[0.4375rem] inline-flex min-h-11 items-center gap-1 rounded-lg bg-muted px-2.5 text-xs font-semibold"
                >
                  <RotateCcw className="size-[0.8125rem]" />
                  Effacer
                </button>
              )}
            </div>
          </section>
        </div>

        <div className="shrink-0 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="mb-2.5 flex items-center gap-2 text-xs">
            <span className="size-[0.4375rem] rounded-full bg-emerald-500" />
            {complete
              ? "Position, photo et signature enregistrées hors ligne"
              : "Photo et signature facultatives — vous pouvez continuer"}
          </p>
          <div className="flex gap-2.5">
            <Button type="button" variant="outline" onClick={onBack} disabled={saving} className="h-[3.375rem] w-24">
              Retour
            </Button>
            <Button
              type="button"
              onClick={onContinue}
              disabled={saving}
              className="h-[3.375rem] flex-1 flex-col gap-0 py-1 whitespace-normal"
            >
              <span className="text-[15.5px] font-semibold">{nextLabel}</span>
              {nextLabel === "Continuer" ? (
                <span className="num text-[12px] font-medium opacity-70">Encaissement · {formatDriverMoney(amount, false)}</span>
              ) : null}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Photo de livraison</DialogTitle>
            <DialogDescription className="sr-only">Aperçu de la photo jointe à l’arrêt.</DialogDescription>
          </DialogHeader>
          {evidence.photoData ? (
            <img src={evidence.photoData} alt="Photo de livraison agrandie" className="max-h-[70vh] w-full rounded-xl object-contain" />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
