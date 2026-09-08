import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { CommunePicker } from "@/features/account/CommunePicker"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { apiErrorMessage, useCustomerSignup, useSignupOptions } from "@/shared/api"

const SUCCESS_MESSAGE = "Demande envoyée. Un conseiller vous contactera pour valider le compte."
const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

export function SignupForm() {
  const { data, isLoading, error: optionsError } = useSignupOptions()
  const { submit, sending } = useCustomerSignup()
  const communes = data?.message?.communes || []
  const categories = data?.message?.categories || []
  const [commercialName, setCommercialName] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [commune, setCommune] = useState("")
  const [category, setCategory] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError("")
    setSuccess("")
    if (
      !commercialName.trim() ||
      !firstName.trim() ||
      !lastName.trim() ||
      !commune ||
      !category ||
      !phone.trim() ||
      !email.trim()
    ) {
      setError("Tous les champs sont obligatoires.")
      return
    }
    try {
      const result = await submit({
        commercialName: commercialName.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        commune,
        category,
        phone: phone.trim(),
        email: email.trim(),
      })
      setSuccess(result.message || SUCCESS_MESSAGE)
    } catch (submitError) {
      setError(apiErrorMessage(submitError))
    }
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={onSubmit}>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Devenir client</h1>
        <p className="text-sm leading-relaxed text-zinc-600">
          Remplissez ce formulaire. Un conseiller validera votre compte avant l’ouverture de l’accès portail.
        </p>
      </div>
      {(error || optionsError) && (
        <Alert variant="destructive">
          <AlertDescription>{error || apiErrorMessage(optionsError)}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="signup-commercial-name">Nom commercial</FieldLabel>
          <Input
            id="signup-commercial-name"
            autoComplete="organization"
            value={commercialName}
            onChange={(event) => setCommercialName(event.target.value)}
            required
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="signup-first-name">Prénom</FieldLabel>
            <Input
              id="signup-first-name"
              autoComplete="given-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="signup-last-name">Nom</FieldLabel>
            <Input
              id="signup-last-name"
              autoComplete="family-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              required
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="signup-commune">Commune</FieldLabel>
          {isLoading ? (
            <p className="text-sm text-zinc-500">Chargement des communes…</p>
          ) : (
            <CommunePicker
              id="signup-commune"
              value={commune}
              communes={communes}
              onChange={(next) => setCommune(next.name)}
            />
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="signup-category">Catégorie client</FieldLabel>
          <select
            id="signup-category"
            className={SELECT_CLASS}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            required
          >
            <option value="">Sélectionnez une catégorie</option>
            {categories.map((item) => (
              <option key={item.name} value={item.name}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="signup-phone">Téléphone</FieldLabel>
          <Input
            id="signup-phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="signup-email">E-mail</FieldLabel>
          <Input
            id="signup-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </Field>
        <Field>
          <Button type="submit" disabled={sending || Boolean(success) || isLoading}>
            {sending && <Spinner data-icon="inline-start" />}
            {sending ? "Envoi…" : "Envoyer la demande"}
          </Button>
        </Field>
      </FieldGroup>
      {success && (
        <p className="text-center text-sm text-zinc-600">
          <Link to="/" className="underline-offset-4 hover:underline">
            Retour à l’accueil
          </Link>
        </p>
      )}
    </form>
  )
}
