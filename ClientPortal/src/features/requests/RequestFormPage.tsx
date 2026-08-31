import { useMemo, useState, type ChangeEvent, type FormEvent } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { DetailBackButton } from "@/components/DetailBackButton"
import { PageTitle } from "@/components/PageTitle"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { apiErrorMessage, useCatalogRequestActions } from "@/shared/api"
import { todayIso } from "@/shared/format"

type LineDraft = {
  id: string
  designation: string
  quantity: string
  reference: string
  notes: string
  photoName: string
  photoData: string
}

function newLine(designation = ""): LineDraft {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `line-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    designation,
    quantity: "1",
    reference: "",
    notes: "",
    photoName: "",
    photoData: "",
  }
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(reader.error || new Error("Lecture de la photo impossible."))
    reader.readAsDataURL(file)
  })
}

export function RequestFormPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const prefill = (params.get("q") || "").trim()
  const actions = useCatalogRequestActions()
  const [deliveryDate, setDeliveryDate] = useState(todayIso())
  const [comment, setComment] = useState("")
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine(prefill)])
  const [error, setError] = useState("")

  const canRemove = lines.length > 1
  const title = useMemo(
    () => (prefill ? `Demande pour « ${prefill} »` : "Nouvelle demande"),
    [prefill],
  )

  const updateLine = (id: string, patch: Partial<LineDraft>) => {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)))
  }

  const handlePhoto = async (id: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setError("")
    try {
      const photoData = await readAsDataUrl(file)
      updateLine(id, { photoName: file.name, photoData })
    } catch (photoError) {
      setError(apiErrorMessage(photoError))
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError("")
    const items = lines.map((line) => ({
      designation: line.designation.trim(),
      quantity: Number(line.quantity),
      reference: line.reference.trim() || undefined,
      notes: line.notes.trim() || undefined,
      photo: line.photoData ? { filename: line.photoName || "photo.jpg", imageData: line.photoData } : undefined,
    }))
    if (items.some((item) => !item.designation || !item.quantity || item.quantity <= 0)) {
      setError("Chaque ligne doit avoir une désignation et une quantité supérieure à zéro.")
      return
    }
    try {
      const created = await actions.create({
        deliveryDate,
        comment: comment.trim() || undefined,
        items,
      })
      toast.success(`Demande ${created.name} envoyée`)
      navigate(`/requests/${created.name}`)
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    }
  }

  return (
    <>
      <DetailBackButton to="/requests" label="Demandes" />
      <PageTitle
        title={title}
        description="Décrivez les articles introuvables. L’équipe les identifie puis crée la commande."
      />
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Envoi impossible</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <form className="flex flex-col gap-6" onSubmit={submit}>
        <Card>
          <CardHeader>
            <CardTitle>Livraison</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="request-delivery-date">Date de livraison souhaitée</FieldLabel>
                <Input
                  id="request-delivery-date"
                  type="date"
                  min={todayIso()}
                  value={deliveryDate}
                  onChange={(event) => setDeliveryDate(event.target.value)}
                  required
                />
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="request-comment">Commentaire</FieldLabel>
                <Textarea
                  id="request-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Précisions utiles pour l’équipe…"
                />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        {lines.map((line, index) => (
          <Card key={line.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Article {index + 1}</CardTitle>
              {canRemove ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Supprimer l'article ${index + 1}`}
                  onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <Field className="md:col-span-2">
                  <FieldLabel htmlFor={`designation-${line.id}`}>Désignation</FieldLabel>
                  <Input
                    id={`designation-${line.id}`}
                    value={line.designation}
                    onChange={(event) => updateLine(line.id, { designation: event.target.value })}
                    placeholder="Nom du produit, marque, conditionnement…"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`quantity-${line.id}`}>Quantité</FieldLabel>
                  <Input
                    id={`quantity-${line.id}`}
                    type="number"
                    min="1"
                    step="1"
                    value={line.quantity}
                    onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`reference-${line.id}`}>Référence / marque</FieldLabel>
                  <Input
                    id={`reference-${line.id}`}
                    value={line.reference}
                    onChange={(event) => updateLine(line.id, { reference: event.target.value })}
                    placeholder="EAN, réf fournisseur…"
                  />
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel htmlFor={`notes-${line.id}`}>Notes</FieldLabel>
                  <Textarea
                    id={`notes-${line.id}`}
                    value={line.notes}
                    onChange={(event) => updateLine(line.id, { notes: event.target.value })}
                  />
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel htmlFor={`photo-${line.id}`}>Photo</FieldLabel>
                  <Input
                    id={`photo-${line.id}`}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(event) => void handlePhoto(line.id, event)}
                  />
                  <FieldDescription>
                    {line.photoName ? `Fichier sélectionné : ${line.photoName}` : "Optionnel, 2 Mo maximum."}
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        ))}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setLines((current) => [...current, newLine()])}>
            <Plus data-icon="inline-start" />
            Ajouter un article
          </Button>
          <Button type="submit" disabled={actions.saving}>
            {actions.saving && <Spinner data-icon="inline-start" />}
            {actions.saving ? "Envoi…" : "Envoyer la demande"}
          </Button>
        </div>
      </form>
    </>
  )
}
