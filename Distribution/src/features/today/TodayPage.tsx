import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, ClipboardCheck, Route, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiErrorMessage, usePlanningBoard } from "@/shared/api/distribution";

function localDate() {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function TodayPage() {
  const navigate = useNavigate();
  const { data, error, isLoading } = usePlanningBoard(localDate());
  const board = data?.message;
  const active = board?.routes.filter((route) => ["Publiée", "En cours"].includes(route.lifecycle)).length || 0;
  const exceptions = board?.routes.flatMap((route) => route.stops).filter((stop) => ["Partiellement Livré", "Non Livré"].includes(stop.status)).length || 0;
  const indicators = [
    { title: "BL prêts à planifier", value: board?.unassigned.length || 0, icon: ClipboardCheck, tone: "text-blue-700", action: "Affecter aux tournées", target: "/planning" },
    { title: "Tournées actives", value: active, icon: Route, tone: "text-emerald-600", action: "Suivre les livraisons", target: "/deliveries" },
    { title: "Exceptions à traiter", value: exceptions, icon: AlertCircle, tone: "text-amber-600", action: "Voir les résultats terrain", target: "/deliveries" },
  ];
  return <div className="space-y-7">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-1 text-sm font-semibold text-blue-700">Vue opérationnelle</p><h1 className="text-3xl font-bold tracking-tight text-slate-950">Aujourd’hui</h1><p className="mt-2 text-sm text-slate-500">Les priorités du {new Date().toLocaleDateString("fr-FR")}.</p></div><Button onClick={() => navigate("/planning")} className="h-11 bg-blue-700 hover:bg-blue-800">Ouvrir le planning<ArrowRight className="ml-2 h-4 w-4" /></Button></header>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{apiErrorMessage(error)}</div>}
    <section aria-label="Indicateurs du jour" className="grid gap-4 md:grid-cols-3">{indicators.map((item) => { const Icon = item.icon; return <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-600">{item.title}</p><Icon className={`h-5 w-5 ${item.tone}`} /></div><p className="mt-4 text-3xl font-bold text-slate-950">{isLoading ? "—" : item.value}</p><button className="mt-3 text-left text-sm font-semibold text-blue-700" onClick={() => navigate(item.target)}>{item.action}</button></article>; })}</section>
    <section className="rounded-2xl border border-slate-200 bg-white p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-bold text-slate-950">Flux de la journée</h2><p className="mt-1 text-sm text-slate-500">Une lecture simple de l’avancement opérationnel.</p></div><Truck className="h-6 w-6 text-slate-400" /></div><div className="grid gap-3 md:grid-cols-3">{[["1", "Préparer", "Prélever et contrôler les commandes"], ["2", "Planifier", "Affecter les BL aux ressources"], ["3", "Livrer", "Guider les arrêts et collecter les preuves"]].map(([step, title, description]) => <div key={step} className="rounded-xl bg-slate-50 p-4"><span className="mb-3 grid h-8 w-8 place-items-center rounded-full bg-blue-700 text-sm font-bold text-white">{step}</span><h3 className="font-bold text-slate-900">{title}</h3><p className="mt-1 text-sm text-slate-500">{description}</p></div>)}</div></section>
  </div>;
}
