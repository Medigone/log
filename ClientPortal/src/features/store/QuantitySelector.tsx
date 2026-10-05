import { useState } from "react"
import { Minus, Plus } from "lucide-react"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { cn } from "@/lib/utils"

const MIN_QTY = 1
const STEP = 1

function parseQuantity(raw: string, fallback: number) {
  const parsed = Number(raw.replace(",", ".").trim())
  if (!Number.isFinite(parsed)) return fallback
  return parsed
}

function snapQuantity(value: number, max?: number | null) {
  if (value < MIN_QTY) return MIN_QTY
  const snapped = Math.max(MIN_QTY, Math.round(value / STEP) * STEP)
  return max && max > 0 ? Math.min(snapped, max) : snapped
}

function digitsOnly(raw: string) {
  return raw.replace(/[^\d]/g, "")
}

function liveQuantity(draft: string | null, value: number, max?: number | null) {
  if (draft === null || draft.trim() === "") return value
  return snapQuantity(parseQuantity(draft, value), max)
}

function keepExistingValueOnFocus(input: HTMLInputElement) {
  window.requestAnimationFrame(() => {
    if (document.activeElement !== input) return
    const end = input.value.length
    const selectedAll = input.selectionStart === 0 && input.selectionEnd === end && end > 0
    if (selectedAll) input.setSelectionRange(end, end)
  })
}

export function QuantitySelector({
  value,
  onChange,
  name,
  uom,
  compact = false,
  max,
}: {
  value: number
  onChange: (quantity: number) => void
  name: string
  uom?: string
  compact?: boolean
  /** Quota de l'article : quantité max par commande. */
  max?: number | null
}) {
  const unit = (uom || "").trim()
  const [draft, setDraft] = useState<string | null>(null)
  const current = liveQuantity(draft, value, max)
  const atMin = current <= MIN_QTY
  const atMax = Boolean(max && max > 0 && current >= max)

  const commitDraft = () => {
    if (draft === null) return
    if (draft.trim() === "") {
      setDraft(null)
      return
    }
    const next = snapQuantity(parseQuantity(draft, value), max)
    setDraft(null)
    if (next !== value) onChange(next)
  }

  const stepBy = (delta: number) => {
    const next = snapQuantity(current + delta, max)
    setDraft(null)
    onChange(next)
  }

  return (
    <InputGroup className={cn("w-full bg-background has-disabled:bg-background has-disabled:opacity-100 dark:bg-background dark:has-disabled:bg-background", compact ? "h-7" : undefined)}>
      <InputGroupAddon>
        <InputGroupButton
          size={compact ? "icon-xs" : "icon-sm"}
          variant="ghost"
          aria-label={`Diminuer ${name}`}
          disabled={atMin}
          onClick={() => stepBy(-STEP)}
        >
          <Minus />
        </InputGroupButton>
      </InputGroupAddon>
      <InputGroupInput
        aria-label={`Quantité ${name}`}
        inputMode="numeric"
        enterKeyHint="done"
        autoComplete="off"
        type="text"
        pattern="[0-9]*"
        value={draft ?? String(value)}
        onFocus={(event) => keepExistingValueOnFocus(event.currentTarget)}
        onMouseUp={(event) => keepExistingValueOnFocus(event.currentTarget)}
        onChange={(event) => setDraft(digitsOnly(event.target.value))}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
        className="min-w-0 text-center tabular-nums"
      />
      {unit ? <InputGroupText className="max-w-20 truncate pr-1 text-xs">{unit}</InputGroupText> : null}
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size={compact ? "icon-xs" : "icon-sm"}
          aria-label={`Augmenter ${name}`}
          disabled={atMax}
          onClick={() => stepBy(STEP)}
        >
          <Plus />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
