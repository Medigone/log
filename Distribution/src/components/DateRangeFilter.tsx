import { format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatShortDate } from "@/shared/format"

function parseDay(value?: string) {
  if (!value) return undefined
  const date = parseISO(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
}) {
  const selected: DateRange | undefined = from || to ? { from: parseDay(from), to: parseDay(to) } : undefined
  const label =
    from && to
      ? `${formatShortDate(from)} – ${formatShortDate(to)}`
      : from
        ? `Depuis ${formatShortDate(from)}`
        : to
          ? `Jusqu’au ${formatShortDate(to)}`
          : "Période"

  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="outline" className="justify-start bg-background font-normal" />}
        aria-label="Période"
      >
        <CalendarIcon data-icon="inline-start" />
        <span className={!from && !to ? "text-muted-foreground" : undefined}>{label}</span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          locale={fr}
          selected={selected}
          onSelect={(range) =>
            onChange({
              from: range?.from ? format(range.from, "yyyy-MM-dd") : "",
              to: range?.to ? format(range.to, "yyyy-MM-dd") : "",
            })
          }
          numberOfMonths={1}
        />
      </PopoverContent>
    </Popover>
  )
}
