import type { DistributionRoute, RouteStop } from "@/shared/types/distribution";

function escapeHtml(value: string | number | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function absoluteUrl(value: string): string {
  if (/^(?:data:|https?:)/i.test(value)) return value;
  return new URL(value, window.location.origin).href;
}

export function buildRouteLabelsHtml(route: DistributionRoute, selectedStops = route.stops): string {
  const labels = selectedStops.flatMap((stop) => {
    if (!stop.qrCode) return [];
    const packageCount = Math.max(stop.packageCount || 1, 1);
    return Array.from({ length: packageCount }, (_, packageIndex) => `
      <section class="label">
        <div class="heading">
          <div><span class="eyebrow">Bon de livraison</span><strong>${escapeHtml(stop.deliveryNote)}</strong></div>
          <span class="stop">Arrêt ${stop.sequence}</span>
        </div>
        <div class="content">
          <img class="qr" src="${escapeHtml(absoluteUrl(stop.qrCode || ""))}" alt="QR ${escapeHtml(stop.deliveryNote)}" />
          <div class="details">
            <h1>${escapeHtml(stop.customerName)}</h1>
            <p>${escapeHtml(stop.commune || stop.wilaya || "Localisation non renseignée")}</p>
            <dl>
              <div><dt>Tournée</dt><dd>${escapeHtml(route.name)}</dd></div>
              <div><dt>Date</dt><dd>${escapeHtml(route.date)}</dd></div>
              <div><dt>Articles</dt><dd>${escapeHtml(stop.totalQuantity)}</dd></div>
              <div><dt>Paquet</dt><dd>${packageIndex + 1} / ${packageCount}</dd></div>
            </dl>
          </div>
        </div>
      </section>`);
  });

  return `<!doctype html>
  <html lang="fr"><head><meta charset="utf-8"><title>Étiquettes ${escapeHtml(route.name)}</title>
  <style>
    @page { size: 100mm 70mm; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #0f172a; font-family: Arial, sans-serif; }
    .label { width: 100mm; height: 70mm; padding: 6mm; page-break-after: always; overflow: hidden; }
    .label:last-child { page-break-after: auto; }
    .heading { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #cbd5e1; padding-bottom: 3mm; }
    .heading strong { display: block; margin-top: 1mm; font-size: 13pt; }
    .eyebrow, dt { color: #64748b; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
    .stop { border-radius: 999px; background: #e3edf3; color: #2e546c; padding: 2mm 3mm; font-size: 8pt; font-weight: 700; }
    .content { display: grid; grid-template-columns: 42mm 1fr; gap: 4mm; padding-top: 4mm; }
    .qr { width: 40mm; height: 40mm; object-fit: contain; }
    h1 { margin: 0 0 2mm; font-size: 12pt; line-height: 1.15; }
    p { margin: 0 0 3mm; color: #475569; font-size: 8pt; }
    dl { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; }
    dt { margin-bottom: .5mm; }
    dd { margin: 0; font-size: 8.5pt; font-weight: 700; }
    @media screen { body { background: #e2e8f0; padding: 12px; } .label { margin: 0 auto 12px; background: white; box-shadow: 0 2px 12px #64748b55; } }
    @media print { body { background: white; } }
  </style></head><body>${labels.join("")}<script>window.addEventListener('load',function(){window.print()})</script></body></html>`;
}

export function printRouteLabels(route: DistributionRoute, selectedStops = route.stops): boolean {
  const printableStops = selectedStops.filter((stop): stop is RouteStop & { qrCode: string } => Boolean(stop.qrCode));
  if (!printableStops.length) return false;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(buildRouteLabelsHtml(route, printableStops));
  printWindow.document.close();
  return true;
}
