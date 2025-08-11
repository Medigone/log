import React, { useState } from "react";
import { useFrappeAuth } from "frappe-react-sdk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Circle,
} from "lucide-react";
import logoSvg from "../../assets/IntraPro_fleetmaster.svg";

function srOnly(text: string) {
  return (
    <span
      style={{
        position: "absolute",
        width: "1px",
        height: "1px",
        padding: 0,
        margin: "-1px",
        overflow: "hidden",
        clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap",
        border: 0,
      }}
    >
      {text}
    </span>
  );
}



const Login: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<any>("");

  const { login, isLoading } = useFrappeAuth();

  const getErrorMessage = (error: any) => {
    if (!error) return "";
    const errorTranslations: { [key: string]: string } = {
      "Invalid login credentials": "Identifiants de connexion invalides",
      "User disabled or does not exist": "Utilisateur désactivé ou inexistant",
      "Incorrect password": "Mot de passe incorrect",
      "User does not exist": "Utilisateur inexistant",
      "Authentication failed": "Échec de l'authentification",
      "Network Error": "Erreur de réseau",
      "Server Error": "Erreur du serveur",
      Unauthorized: "Non autorisé",
      "Incomplete login details": "Détails de connexion incomplets",
    };

    const message =
      error?.message ||
      error?.httpStatusText ||
      error?.exc_type ||
      "Erreur de connexion";

    if (errorTranslations[message]) return errorTranslations[message];
    for (const [en, fr] of Object.entries(errorTranslations)) {
      if (String(message).toLowerCase().includes(en.toLowerCase())) return fr;
    }
    return message;
  };

  const onSubmit = async () => {
    if (!username || !password) {
      setLoginError({ message: "Détails de connexion incomplets" });
      return;
    }
    try {
      await login({ username, password });
      setLoginError("");
      window.location.reload();
    } catch (err) {
      setLoginError(err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onSubmit();
  };

  return (
    <div className="min-h-screen bg-background grid place-items-center p-4">
      {/* Container */}
      <div className="w-full max-w-4xl grid grid-cols-1 gap-0">
        {/* Wrapper card */}
        <div className="w-full grid grid-cols-1 bg-card rounded-2xl border shadow-lg overflow-hidden">
          {/* Header translucide */}
          <div className="bg-muted/50 border-b">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-muted-foreground md:hidden">
                  <img
                    src={logoSvg}
                    alt="IntraPro FleetMaster"
                    className="h-6 w-auto"
                  />
                </div>
                <div className="w-6 hidden md:block"></div>
                <div className="inline-flex items-center gap-2 text-white text-sm">
                  <span>Connexion</span>
                  <Circle className="w-1 h-1 fill-current" />
                  <span className="text-white">Compte</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 min-h-[420px]">
            {/* Left panel (message) */}
            <div className="hidden md:block bg-muted/50 border-r">
              <div className="px-10 py-12">
                <div className="mb-8">
                  <img
                    src={logoSvg}
                    alt="IntraPro FleetMaster"
                    className="h-12 w-auto"
                  />
                </div>

                <h1 className="text-4xl font-bold text-white leading-tight tracking-tight">
                  Gérez vos livraisons avec sérénité.
                </h1>
                <p className="text-white mt-3">
                  IntraPro FleetMaster vous aide à superviser, analyser et
                  optimiser vos opérations en toute simplicité.
                </p>
              </div>
            </div>

            {/* Right panel (form) */}
            <div className="w-full grid place-items-center">
              <div className="w-full max-w-[380px] p-6">
                <h2 className="text-2xl font-semibold text-white mb-3">
                  Connexion
                </h2>

                {loginError && (
                  <div className="mb-4 p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{getErrorMessage(loginError)}</span>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-sm font-medium text-white block mb-2">
                      Identifiant
                    </label>
                    <Input
                      placeholder="nom.utilisateur@exemple.com"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-white block mb-2">
                      Mot de passe
                    </label>
                    <div className="relative">
                      <Input
                        placeholder="••••••••"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="w-full pr-10"
                      />
                      <button
                        type="button"
                        aria-label={
                          showPassword
                            ? "Masquer le mot de passe"
                            : "Afficher le mot de passe"
                        }
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors p-1 rounded-md grid place-items-center"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        {srOnly(
                          showPassword
                            ? "Masquer le mot de passe"
                            : "Afficher le mot de passe"
                        )}
                      </button>
                    </div>
                  </div>

                  <Button
                    onClick={onSubmit}
                    disabled={isLoading}
                    className="w-full mt-1.5"
                  >
                    {isLoading ? "Connexion..." : "Se connecter"}
                  </Button>
                </div>

                <Separator className="my-4" />

                <p className="text-sm text-white">
                  Besoin d'aide ? Contactez l'administrateur.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;