import { createContext, useContext, useState, type ReactNode } from "react";
import { RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const PreparationToolbarEndContext = createContext<HTMLElement | null>(null);

export function usePreparationToolbarEnd() {
  return useContext(PreparationToolbarEndContext);
}

export function preparationChipClass(active: boolean) {
  return cn(
    "flex h-[30px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium",
    active
      ? "border-foreground bg-foreground text-background"
      : "border-hairline bg-card text-muted-foreground hover:border-brand-300",
  );
}

export function PreparationMoreFilters({ children }: { children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger render={<Button type="button" variant="outline" size="sm" className="h-[30px] rounded-lg text-xs" />}>
        Plus de filtres
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="flex flex-col gap-2">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

export function PreparationQueueShell({
  search,
  onSearchChange,
  searchPlaceholder,
  searchAriaLabel,
  chips,
  moreFilters,
  countLabel,
  heading,
  filtersActive,
  onReset,
  selectionBar,
  children,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchAriaLabel: string;
  chips?: ReactNode;
  moreFilters?: ReactNode;
  countLabel: string;
  heading: ReactNode;
  filtersActive: boolean;
  onReset: () => void;
  selectionBar?: ReactNode;
  children: ReactNode;
}) {
  const [toolbarEnd, setToolbarEnd] = useState<HTMLDivElement | null>(null);

  return (
    <PreparationToolbarEndContext.Provider value={toolbarEnd}>
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-muted px-3 py-2.5">
        <InputGroup className="h-[30px] w-[280px] min-w-48 bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchAriaLabel}
          />
        </InputGroup>
        {chips}
        {moreFilters}
        <div className="flex-1" />
        <span className="flex h-[30px] items-center num text-[11px] text-muted-foreground">{countLabel}</span>
        {heading}
        {filtersActive ? (
          <Button type="button" variant="ghost" size="sm" className="h-[30px]" onClick={onReset}>
            <RotateCcw data-icon="inline-start" />
            Réinitialiser
          </Button>
        ) : null}
        <div ref={setToolbarEnd} className="flex items-center" />
      </div>
      {selectionBar}
      {children}
    </Card>
    </PreparationToolbarEndContext.Provider>
  );
}

export function PreparationSelectionBar({
  summary,
  hint,
  actionLabel,
  actionDisabled,
  onAction,
  onClear,
}: {
  summary: string;
  hint?: string;
  actionLabel: string;
  actionDisabled?: boolean;
  onAction: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 bg-foreground px-3 py-2 text-background">
      <span className="text-sm font-medium">{summary}</span>
      {hint ? <span className="text-xs text-background/60">{hint}</span> : null}
      <div className="flex-1" />
      <Button size="sm" variant="secondary" disabled={actionDisabled} onClick={onAction}>
        {actionLabel}
      </Button>
      <Button size="sm" variant="ghost" className="text-background/60" onClick={onClear}>
        Effacer
      </Button>
    </div>
  );
}
