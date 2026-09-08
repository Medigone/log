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

function snapQuantity(value: number) {
  if (value < MIN_QTY) return MIN_QTY
  return Math.max(MIN_QTY, Math.round(value / STEP) * STEP)
}

function digitsOnly(raw: string) {
  return raw.replace(/[^\d]/g, "")
}

function liveQuantity(draft: string | null, value: number) {
  if (draft === null || draft.trim() === "") return value
  return snapQuantity(parseQuantity(draft, value))
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
}: {
  value: number
  onChange: (quantity: number) => void
  name: string
  uom?: string
  compact?: boolean
}) {
  const unit = (uom || "").trim()
  const [draft, setDraft] = useState<string | null>(null)
  const current = liveQuantity(draft, value)
  const atMin = current <= MIN_QTY

  const commitDraft = () => {
    if (draft === null) return
    if (draft.trim() === "") {
      setDraft(null)
      return
    }
    const next = snapQuantity(parseQuantity(draft, value))
    setDraft(null)
    if (next !== value) onChange(next)
  }

  const stepBy = (delta: number) => {
    const next = snapQuantity(current + delta)
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
          onClick={() => stepBy(STEP)}
        >
          <Plus />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
