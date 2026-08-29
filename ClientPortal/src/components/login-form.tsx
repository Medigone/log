import { useState, type ComponentProps, type FormEvent } from "react"
import { useFrappeAuth } from "frappe-react-sdk"
import { Eye, EyeOff, MapPin, ShoppingBag } from "lucide-react"
import { BrandLogo } from "@/components/BrandLogo"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { apiErrorMessage } from "@/shared/api"

export function LoginForm({ className, ...props }: ComponentProps<"div">) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const { login } = useFrappeAuth()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!username.trim() || !password) {
      setError("Renseignez votre identifiant et votre mot de passe.")
      return
    }
    setSubmitting(true)
    try {
      await login({ username: username.trim(), password })
      window.location.reload()
    } catch (loginError) {
      setError(apiErrorMessage(loginError).includes("Invalid login") ? "Identifiants invalides." : apiErrorMessage(loginError))
      setSubmitting(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={submit}>
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <BrandLogo className="mb-2 h-10 md:hidden" />
                <h1 className="text-2xl font-bold">Connexion</h1>
                <p className="text-balance text-muted-foreground">
                  Utilisez le compte client reçu par invitation.
                </p>
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Field>
                <FieldLabel htmlFor="email">Adresse e-mail</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
                  <a href="/login#forgot" className="ml-auto text-sm underline-offset-2 hover:underline">
                    Mot de passe oublié ?
                  </a>
                </div>
                <InputGroup>
                  <InputGroupInput
                    id="password"
                    autoComplete="current-password"
                    type={visible ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      onClick={() => setVisible((current) => !current)}
                    >
                      {visible ? <EyeOff /> : <Eye />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
              <Field>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Spinner data-icon="inline-start" />}
                  {submitting ? "Connexion…" : "Se connecter"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
          <div className="relative hidden flex-col justify-between bg-primary p-8 text-primary-foreground md:flex">
            <BrandLogo className="h-10 w-fit rounded-lg bg-background px-4 py-3" />
            <div className="flex flex-col gap-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary-foreground/80">
                Espace clients
              </p>
              <h2 className="max-w-lg text-3xl font-semibold leading-tight">
                Vos commandes et livraisons, réunies au même endroit.
              </h2>
              <div className="flex flex-col gap-3 text-sm text-primary-foreground/90">
                <p className="flex items-center gap-3">
                  <ShoppingBag />
                  Commandez avec vos tarifs habituels.
                </p>
                <p className="flex items-center gap-3">
                  <MapPin />
                  Confirmez votre point de livraison en toute sécurité.
                </p>
              </div>
            </div>
            <p className="text-xs text-primary-foreground/80">
              Accès sur invitation réservé aux clients IntraPro.
            </p>
          </div>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        Besoin d’accès ? Contactez votre responsable IntraPro.
      </FieldDescription>
    </div>
  )
}
