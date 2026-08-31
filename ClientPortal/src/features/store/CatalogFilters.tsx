import { useState, type ReactNode } from "react"
import { SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { selectString } from "@/features/store/catalogQuery"
import { useIsMobile } from "@/hooks/use-mobile"

function FilterFields({
  groups,
  group,
  offersOnly,
  hasOffers,
  onGroupChange,
  onOffersChange,
  onReset,
}: {
  groups: string[]
  group: string
  offersOnly: boolean
  hasOffers: boolean
  onGroupChange: (group: string) => void
  onOffersChange: (offersOnly: boolean) => void
  onReset: () => void
}) {
  const groupOptions = [{ value: "all", label: "Tous les rayons" }, ...groups.map((name) => ({ value: name, label: name }))]
  const selectedGroup = group || "all"
  const selectedLabel = groupOptions.find((option) => option.value === selectedGroup)?.label ?? "Tous les rayons"

  return (
    <FieldGroup className="gap-4">
      <Field>
        <FieldLabel>Rayon</FieldLabel>
        <Select
          value={selectedGroup}
          onValueChange={(next) => {
            const value = selectString(next, "all")
            onGroupChange(value === "all" ? "" : value)
          }}
          items={groupOptions}
        >
          <SelectTrigger className="w-full bg-background" aria-label="Filtrer par rayon">
            {selectedLabel}
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {groupOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      {hasOffers && (
        <Field>
          <Button
            type="button"
            variant={offersOnly ? "default" : "outline"}
            className="w-full justify-start"
            aria-pressed={offersOnly}
            onClick={() => onOffersChange(!offersOnly)}
          >
            Offres uniquement
          </Button>
        </Field>
      )}
      <Button type="button" variant="ghost" onClick={onReset}>
        Réinitialiser
      </Button>
    </FieldGroup>
  )
}

export function CatalogFilters({
  groups,
  group,
  offersOnly,
  hasOffers,
  activeCount,
  onGroupChange,
  onOffersChange,
  onReset,
}: {
  groups: string[]
  group: string
  offersOnly: boolean
  hasOffers: boolean
  activeCount: number
  onGroupChange: (group: string) => void
  onOffersChange: (offersOnly: boolean) => void
  onReset: () => void
}) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const fields = (
    <FilterFields
      groups={groups}
      group={group}
      offersOnly={offersOnly}
      hasOffers={hasOffers}
      onGroupChange={(next) => {
        onGroupChange(next)
        if (!isMobile) setOpen(false)
      }}
      onOffersChange={onOffersChange}
      onReset={() => {
        onReset()
        setOpen(false)
      }}
    />
  )

  const triggerLabel: ReactNode = (
    <>
      <SlidersHorizontal data-icon="inline-start" />
      Filtres
      {activeCount > 0 ? ` · ${activeCount}` : ""}
    </>
  )

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<Button variant="outline" aria-label="Filtres" />}>{triggerLabel}</SheetTrigger>
        <SheetContent side="right" className="p-4">
          <SheetHeader>
            <SheetTitle>Filtres</SheetTitle>
            <SheetDescription>Affiner le catalogue selon les rayons et les offres.</SheetDescription>
          </SheetHeader>
          {fields}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" aria-label="Filtres" />}>{triggerLabel}</PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <PopoverHeader>
          <PopoverTitle>Filtres</PopoverTitle>
          <PopoverDescription>Affiner le catalogue.</PopoverDescription>
        </PopoverHeader>
        {fields}
      </PopoverContent>
    </Popover>
  )
}
