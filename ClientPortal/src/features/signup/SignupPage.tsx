import { useState } from "react"
import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"
import { ACCENT } from "@/features/landing/landingCopy"
import { SignupForm } from "@/features/signup/SignupForm"
import { SignupStepper } from "@/features/signup/SignupStepper"

const LOGO_SRC = "/assets/log/images/logo_mp_new.png"

export function SignupPage() {
  const [currentStep, setCurrentStep] = useState(1)

  return (
    <div className="min-h-svh bg-white text-zinc-950 antialiased">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-6 py-3">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <img src={LOGO_SRC} alt="Modern Pharma" className="h-9 w-auto object-contain object-left" />
            <span className="truncate text-sm font-semibold">Modern Pharma</span>
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-2.5">
            <Link to="/" className="hidden h-[34px] items-center rounded-lg border border-zinc-200 px-3 text-[13px] font-medium hover:bg-zinc-100 sm:flex">
              Accueil
            </Link>
            <Link
              to="/login"
              className="flex h-[34px] items-center rounded-lg px-4 text-[13px] font-medium text-white hover:opacity-90"
              style={{ background: ACCENT }}
            >
              Connexion
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-6 py-12">
        <SignupStepper currentStep={currentStep} />
        <div className={cn("mx-auto mt-8 max-w-xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm md:p-8")}>
          <SignupForm onSuccess={() => setCurrentStep(2)} />
        </div>
        <p className="mt-6 text-center text-sm text-zinc-500">
          Déjà client ?{" "}
          <Link to="/login" className="font-medium text-zinc-950 underline-offset-4 hover:underline">
            Se connecter
          </Link>
        </p>
      </main>
    </div>
  )
}
