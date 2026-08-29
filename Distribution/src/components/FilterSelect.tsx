import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "@/components/ui/select"
import { cn } from "@/lib/utils"

export type SelectOption = { value: string; label: string }

function resolveSelectValue(next: unknown, fallback: string) {
  if (typeof next === "object" && next && "value" in next) return String((next as { value: string }).value)
  return String(next || fallback)
}

export function FilterSelect({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string
  value: string
  options: readonly SelectOption[]
  onChange: (value: string) => void
  className?: string
}) {
  const selected = options.find((option) => option.value === value)
  const isDefault = value === "all" || value === ""
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(resolveSelectValue(next, options[0]?.value ?? ""))}
      items={[...options]}
    >
      <SelectTrigger className={cn("max-w-56 bg-background", className)} aria-label={label}>
        <span className="text-muted-foreground">{label}</span>
        {isDefault || !selected ? null : <span className="min-w-0 truncate">{selected.label}</span>}
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false} className="w-auto min-w-(--anchor-width)">
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

const EMPTY_VALUE = "__empty__"

export function FormSelect({
  value,
  options,
  onChange,
  "aria-label": ariaLabel,
  className,
}: {
  value: string
  options: readonly SelectOption[]
  onChange: (value: string) => void
  "aria-label"?: string
  className?: string
}) {
  const items = options.map((option) => ({
    ...option,
    value: option.value === "" ? EMPTY_VALUE : option.value,
  }))
  const resolved = value === "" ? EMPTY_VALUE : value
  const selected = items.find((option) => option.value === resolved)
  return (
    <Select
      value={resolved}
      onValueChange={(next) => {
        const parsed = resolveSelectValue(next, items[0]?.value ?? EMPTY_VALUE)
        onChange(parsed === EMPTY_VALUE ? "" : parsed)
      }}
      items={items}
    >
      <SelectTrigger className={cn("w-full bg-background", className)} aria-label={ariaLabel}>
        <span className={cn("min-w-0 truncate", (!selected || selected.value === EMPTY_VALUE) && "text-muted-foreground")}>
          {selected?.label || "Sélectionner"}
        </span>
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false} className="w-auto min-w-(--anchor-width)">
        <SelectGroup>
          {items.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
