import { Link } from "react-router-dom"
import { ForgotPasswordForm } from "@/components/forgot-password-form"

export function ForgotPasswordPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-4xl">
        <ForgotPasswordForm />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/" className="underline-offset-4 hover:underline">
            Retour à l’accueil
          </Link>
        </p>
      </div>
    </div>
  )
}
