import { useState, type ComponentProps, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { useFrappeAuth } from "frappe-react-sdk"
import { Eye, EyeOff } from "lucide-react"
import { AuthSplitCard } from "@/components/AuthSplitCard"
import { BrandLogo } from "@/components/BrandLogo"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
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
    <AuthSplitCard className={cn(className)} {...props}>
      <form className="p-6 md:p-8" onSubmit={submit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <BrandLogo className="mb-2 h-10 md:hidden" />
            <h1 className="text-2xl font-bold">Connexion</h1>
            <p className="text-balance text-muted-foreground">
              Saisissez votre identifiant et votre mot de passe.
            </p>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel htmlFor="username">Identifiant</FieldLabel>
            <Input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </Field>
          <Field>
            <div className="flex items-center">
              <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
              <Link to="/forgot" className="ml-auto text-sm underline-offset-2 hover:underline">
                Mot de passe oublié ?
              </Link>
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
    </AuthSplitCard>
  )
}
