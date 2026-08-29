import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export function SortSelector({
  field,
  dir,
  fields,
  onFieldChange,
  onDirChange,
  className,
}: {
  field: string
  dir: "asc" | "desc"
  fields: readonly { value: string; label: string }[]
  onFieldChange: (field: string) => void
  onDirChange: (dir: "asc" | "desc") => void
  className?: string
}) {
  const label = fields.find((item) => item.value === field)?.label ?? field
  const descending = dir === "desc"
  const dirLabel = descending ? "Décroissant" : "Croissant"
  const DirIcon = descending ? ArrowDownWideNarrow : ArrowUpNarrowWide

  return (
    <ButtonGroup className={cn("bg-background", className)} aria-label="Tri">
      <Button
        variant="outline"
        size="icon"
        aria-label={dirLabel}
        title={dirLabel}
        onClick={() => onDirChange(descending ? "asc" : "desc")}
      >
        <DirIcon />
      </Button>
      <ButtonGroupSeparator />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" aria-label="Trier par" />}>
          <span className="max-w-40 truncate">{label}</span>
          <ChevronDown data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-44">
          <DropdownMenuGroup>
            <DropdownMenuRadioGroup
              value={field}
              onValueChange={(value) => {
                if (typeof value === "string") onFieldChange(value)
              }}
            >
              {fields.map((item) => (
                <DropdownMenuRadioItem key={item.value} value={item.value}>
                  {item.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  )
}
