import { Minus, Plus } from "lucide-react"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { cn } from "@/lib/utils"

const MIN_QTY = 1
const STEP = 1

function parseQuantity(raw: string, fallback: number) {
  const parsed = Number(raw.replace(",", "."))
  if (!Number.isFinite(parsed)) return fallback
  return parsed
}

function snapQuantity(value: number) {
  if (value < MIN_QTY) return MIN_QTY
  return Math.max(MIN_QTY, Math.round(value / STEP) * STEP)
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
  const atMin = value <= MIN_QTY

  return (
    <InputGroup className={cn("w-full bg-background", compact ? "h-7" : undefined)}>
      <InputGroupAddon>
        <InputGroupButton
          size={compact ? "icon-xs" : "icon-sm"}
          aria-label={`Diminuer ${name}`}
          disabled={atMin}
          onClick={() => onChange(snapQuantity(value - STEP))}
        >
          <Minus />
        </InputGroupButton>
      </InputGroupAddon>
      <InputGroupInput
        aria-label={`Quantité ${name}`}
        inputMode="numeric"
        type="number"
        min={MIN_QTY}
        step={STEP}
        value={value}
        onChange={(event) => onChange(snapQuantity(parseQuantity(event.target.value, value)))}
        className="min-w-0 text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {unit ? <InputGroupText className="max-w-20 truncate pr-1 text-xs">{unit}</InputGroupText> : null}
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size={compact ? "icon-xs" : "icon-sm"}
          aria-label={`Augmenter ${name}`}
          onClick={() => onChange(snapQuantity(value + STEP))}
        >
          <Plus />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
