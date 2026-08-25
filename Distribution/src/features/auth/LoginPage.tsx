import { useState, type FormEvent } from "react";
import { useFrappeAuth } from "frappe-react-sdk";
import { AlertTriangle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiErrorMessage } from "@/shared/api/distribution";
import { BrandLogo } from "@/shared/ui/BrandLogo";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const { login, isLoading } = useFrappeAuth();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("Renseignez votre identifiant et votre mot de passe.");
      return;
    }
    try {
      await login({ username: username.trim(), password });
      window.location.reload();
    } catch (loginError) {
      const message = apiErrorMessage(loginError);
      setError(message.includes("Invalid login") ? "Identifiants de connexion invalides." : message);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60 md:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden bg-blue-700 p-12 text-white md:flex md:flex-col md:justify-between">
          <div className="self-start rounded-2xl bg-white px-4 py-3"><BrandLogo className="h-12 w-auto" alt="IntraPro Distribution" /></div>
          <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-200">Opérations logistiques</p><h1 className="mt-4 text-4xl font-bold leading-tight">Préparer, planifier et livrer avec clarté.</h1><p className="mt-5 max-w-sm text-sm leading-6 text-blue-100">Une interface simple pour garder les équipes alignées, du prélèvement jusqu’à la preuve de livraison.</p></div>
          <p className="text-xs text-blue-200">Accès sécurisé réservé aux équipes autorisées.</p>
        </section>
        <section className="p-7 sm:p-10 md:p-12">
          <div className="mb-8 md:hidden"><BrandLogo className="h-10 w-auto" alt="IntraPro Distribution" /></div>
          <p className="text-sm font-semibold text-blue-700">Bienvenue</p><h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Connexion</h2><p className="mt-2 text-sm text-slate-500">Utilisez votre compte professionnel Frappe.</p>
          {error && <div role="alert" className="mt-6 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
          <form onSubmit={submit} className="mt-7 space-y-5">
            <label className="block text-sm font-semibold text-slate-700">Identifiant<Input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className="mt-2 h-12 rounded-xl" placeholder="nom@entreprise.dz" /></label>
            <label className="block text-sm font-semibold text-slate-700">Mot de passe<span className="relative mt-2 block"><Input autoComplete="current-password" type={visible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 rounded-xl pr-12" /><button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></label>
            <Button type="submit" disabled={isLoading} className="h-12 w-full rounded-xl bg-blue-700 text-base hover:bg-blue-800">{isLoading ? "Connexion…" : "Se connecter"}</Button>
          </form>
          <p className="mt-8 text-center text-xs text-slate-400">Besoin d’aide ? Contactez votre responsable.</p>
        </section>
      </div>
    </main>
  );
}
