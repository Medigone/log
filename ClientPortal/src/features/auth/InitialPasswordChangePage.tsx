import { useState, type FormEvent } from "react"
import { KeyRound } from "lucide-react"
import { BrandLogo } from "@/components/BrandLogo"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { apiErrorMessage, usePasswordActions } from "@/shared/api"

interface InitialPasswordChangePageProps {
  email: string
  onComplete: () => Promise<void> | void
}

function passwordValidation(password: string): string {
  if (password.length < 12) return "Utilisez au moins 12 caractères."
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return "Ajoutez une majuscule, une minuscule, un chiffre et un symbole."
  }
  return ""
}

export function InitialPasswordChangePage({ email, onComplete }: InitialPasswordChangePageProps) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [error, setError] = useState("")
  const { changeInitialPassword, changing } = usePasswordActions()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError("")
    if (!currentPassword) {
      setError("Saisissez le mot de passe temporaire reçu.")
      return
    }
    const validation = passwordValidation(newPassword)
    if (validation) {
      setError(validation)
      return
    }
    if (newPassword !== confirmation) {
      setError("La confirmation ne correspond pas au nouveau mot de passe.")
      return
    }
    if (newPassword === currentPassword) {
      setError("Le nouveau mot de passe doit être différent du mot de passe temporaire.")
      return
    }

    try {
      await changeInitialPassword({ currentPassword, newPassword })
      await onComplete()
    } catch (changeError) {
      setError(apiErrorMessage(changeError))
    }
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex flex-col gap-4">
          <BrandLogo className="h-10 w-fit" />
          <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
            <KeyRound />
          </div>
          <div>
            <CardTitle className="text-2xl">Créez votre mot de passe</CardTitle>
            <CardDescription className="mt-2">
              Pour sécuriser le compte {email}, remplacez le mot de passe temporaire avant de continuer.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-5" onSubmit={submit}>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="current-password">Mot de passe temporaire</FieldLabel>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-password">Nouveau mot de passe</FieldLabel>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
                <FieldDescription>
                  12 caractères minimum avec majuscule, minuscule, chiffre et symbole.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="confirm-password">Confirmer le nouveau mot de passe</FieldLabel>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </Field>
              <Field>
                <Button type="submit" size="lg" disabled={changing}>
                  {changing && <Spinner data-icon="inline-start" />}
                  {changing ? "Mise à jour…" : "Enregistrer et accéder au portail"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
