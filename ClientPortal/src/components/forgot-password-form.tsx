import { useState, type ComponentProps, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { AuthSplitCard } from "@/components/AuthSplitCard"
import { BrandLogo } from "@/components/BrandLogo"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { passwordResetFeedback, usePasswordReset } from "@/shared/api"

export function ForgotPasswordForm({ className, ...props }: ComponentProps<"div">) {
  const [user, setUser] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const { send, sending } = usePasswordReset()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError("")
    setSuccess("")
    if (!user.trim()) return
    try {
      const feedback = await send(user.trim())
      if (feedback.ok) setSuccess(feedback.message)
      else setError(feedback.message)
    } catch (resetError) {
      const feedback = passwordResetFeedback(undefined, resetError)
      setError(feedback.message)
    }
  }

  return (
    <AuthSplitCard className={cn(className)} {...props}>
      <form className="p-6 md:p-8" onSubmit={submit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <BrandLogo className="mb-2 h-10 md:hidden" />
            <h1 className="text-2xl font-bold">Mot de passe oublié</h1>
            <p className="text-balance text-muted-foreground">
              Saisissez votre identifiant. Nous vous enverrons un lien de réinitialisation.
            </p>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel htmlFor="forgot-user">Identifiant</FieldLabel>
            <Input
              id="forgot-user"
              type="text"
              autoComplete="username"
              value={user}
              onChange={(event) => setUser(event.target.value)}
              required
            />
          </Field>
          <Field>
            <Button type="submit" disabled={sending || Boolean(success)}>
              {sending && <Spinner data-icon="inline-start" />}
              {sending ? "Envoi…" : "Envoyer le lien"}
            </Button>
          </Field>
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="underline-offset-4 hover:underline">
              Retour à la connexion
            </Link>
          </p>
        </FieldGroup>
      </form>
    </AuthSplitCard>
  )
}
