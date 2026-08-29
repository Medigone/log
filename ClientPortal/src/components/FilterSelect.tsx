import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "@/components/ui/select"

export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  const selected = options.find((option) => option.value === value)
  const isDefault = value === "all"
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const resolved =
          typeof next === "object" && next && "value" in next ? String((next as { value: string }).value) : String(next || "")
        onChange(resolved || options[0].value)
      }}
      items={[...options]}
    >
      <SelectTrigger className="max-w-56 bg-background" aria-label={label}>
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
