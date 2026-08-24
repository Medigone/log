import { Check, Circle, LoaderCircle, PackageCheck, ShieldCheck, Truck } from "lucide-react";
import { apiErrorMessage, usePublicTracking } from "@/shared/api/distribution";

export function PublicTrackingPage({ deliveryNote }: { deliveryNote: string }) {
  const { data, error, isLoading } = usePublicTracking(deliveryNote);
  const tracking = data?.message;
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-700 text-white"><Truck className="h-5 w-5" /></span><div><p className="font-bold text-slate-950">IntraPro Distribution</p><p className="text-xs text-slate-500">Suivi du bon de livraison</p></div></div><ShieldCheck className="h-5 w-5 text-emerald-600" /></header>
        {isLoading && <div className="grid min-h-80 place-items-center rounded-2xl border border-slate-200 bg-white"><LoaderCircle className="h-7 w-7 animate-spin text-blue-700" /></div>}
        {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">{apiErrorMessage(error)}</div>}
        {tracking && <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bon de livraison</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold text-slate-950">{tracking.name}</h1><span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-800">{tracking.status}</span></div></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-bold text-slate-950">Progression</h2><ol className="mt-5 space-y-4">{tracking.steps.map((step) => <li key={step.key} className="flex gap-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${step.completed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{step.completed ? <Check className="h-4 w-4" /> : <Circle className="h-3 w-3" />}</span><div><p className="text-sm font-bold text-slate-900">{step.label}</p><p className="text-xs text-slate-500">{step.completed_at ? new Date(step.completed_at).toLocaleString("fr-FR") : step.completed ? "Étape confirmée" : "En attente"}</p></div></li>)}</ol></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6"><div className="flex items-center gap-2"><PackageCheck className="h-5 w-5 text-blue-700" /><h2 className="font-bold text-slate-950">Articles</h2></div><div className="mt-4 divide-y divide-slate-100">{tracking.articles.map((article) => <div key={article.item_code} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-bold text-slate-900">{article.item_name}</p><p className="text-xs text-slate-500">{article.item_code}</p></div><p className="text-sm font-semibold text-slate-700">{article.delivered_quantity} / {article.quantity}</p></div>)}</div></section>
          <p className="text-center text-xs text-slate-400">Cette page publique affiche uniquement l’avancement et les articles.</p>
        </div>}
      </div>
    </main>
  );
}
