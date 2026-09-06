import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { GripVertical, MapPin, Route } from "lucide-react";
import { Badge } from "@/components/reui/badge";
import {
  Frame,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import { Sortable, SortableItem, SortableItemHandle } from "@/components/reui/sortable";
import { Button } from "@/components/ui/button";
import { orderedDeliveryNotes, sameStopOrder } from "@/features/planning/routeOrder";
import {
  flattenLocationGroups,
  groupStopsByLocation,
  locationGroupKey,
  stopCommune,
  stopWilaya,
} from "@/features/planning/routeStopGroups";
import { getStopVisualStyle } from "@/features/planning/stopStatus";
import { FOCUS_HIGHLIGHT_CLASS } from "@/shared/useFocusHighlight";
import { TONES } from "@/shared/design/statusTone";
import { cn } from "@/lib/utils";
import type { RouteStop } from "@/shared/types/distribution";

export type RouteStopRailProps = {
  stops: RouteStop[];
  selected: string;
  onSelect: (deliveryNote: string) => void;
  reorderable: boolean;
  disabled?: boolean;
  onCommit: (orderedDeliveryNotes: string[]) => void | Promise<void>;
  highlight?: ReadonlySet<string>;
  /** `responsive` : vertical ≥ lg, bandeau horizontal < lg. `vertical` : toujours une colonne (Sheet). */
  layout?: "responsive" | "vertical";
  onRequestReorder?: () => void;
};

function optionId(deliveryNote: string) {
  return `stop-option-${deliveryNote}`;
}

function countGroup(items: RouteStop[], key: string) {
  return items.filter((item) => locationGroupKey(item) === key).length;
}

function scrollRowIntoContainer(container: HTMLElement, row: HTMLElement) {
  const bounds = container.getBoundingClientRect();
  const rowBounds = row.getBoundingClientRect();
  if (rowBounds.top < bounds.top) {
    container.scrollTop -= bounds.top - rowBounds.top;
  } else if (rowBounds.bottom > bounds.bottom) {
    container.scrollTop += rowBounds.bottom - bounds.bottom;
  }
  if (rowBounds.left < bounds.left) {
    container.scrollLeft -= bounds.left - rowBounds.left;
  } else if (rowBounds.right > bounds.right) {
    container.scrollLeft += rowBounds.right - bounds.right;
  }
}

export function RouteStopRail({
  stops,
  selected,
  onSelect,
  reorderable,
  disabled,
  onCommit,
  highlight,
  layout = "responsive",
  onRequestReorder,
}: RouteStopRailProps) {
  const groupedStops = useMemo(() => flattenLocationGroups(groupStopsByLocation(stops)), [stops]);
  const [items, setItems] = useState(groupedStops);
  const listRef = useRef<HTMLDivElement>(null);
  const responsive = layout === "responsive";
  const multipleWilayas = useMemo(() => new Set(items.map(stopWilaya)).size > 1, [items]);
  const multipleCommunes = useMemo(() => new Set(items.map(locationGroupKey)).size > 1, [items]);

  useEffect(() => {
    setItems(groupedStops);
  }, [groupedStops]);

  useEffect(() => {
    const container = listRef.current;
    if (!container || !selected) return;
    const row = container.querySelector<HTMLElement>(`#${CSS.escape(optionId(selected))}`);
    if (!row) return;
    scrollRowIntoContainer(container, row);
  }, [selected]);

  if (!stops.length) return null;

  const moveSelection = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if ((event.target as HTMLElement).closest("[data-slot='sortable-item-handle']")) return;
    event.preventDefault();
    const index = items.findIndex((stop) => stop.deliveryNote === selected);
    const nextIndex = event.key === "ArrowDown" ? Math.min(index + 1, items.length - 1) : Math.max(index - 1, 0);
    const next = items[nextIndex];
    if (next && next.deliveryNote !== selected) onSelect(next.deliveryNote);
  };

  return (
    <Frame spacing="xs">
      <FrameHeader>
        <div className="flex items-center gap-2">
          <FrameTitle>Ordre de livraison</FrameTitle>
          <Badge variant="outline" size="sm">
            <Route />
            {items.length} arrêt{items.length > 1 ? "s" : ""}
          </Badge>
          {reorderable ? (
            <span className={cn("t-meta ml-auto text-subtle", responsive && "hidden lg:inline")}>Glissez</span>
          ) : null}
          {reorderable && onRequestReorder ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(responsive ? "ml-auto lg:hidden" : "hidden")}
              onClick={onRequestReorder}
            >
              Réorganiser
            </Button>
          ) : null}
        </div>
      </FrameHeader>
      <FramePanel className="p-0!">
        <div
          ref={listRef}
          role="listbox"
          tabIndex={0}
          aria-label="Arrêts de la tournée"
          aria-activedescendant={selected ? optionId(selected) : undefined}
          onKeyDown={moveSelection}
          className={cn(
            "max-h-[470px] overflow-y-auto",
            responsive && "max-lg:max-h-none max-lg:overflow-x-auto max-lg:overflow-y-hidden",
          )}
        >
          <Sortable
            value={items}
            onValueChange={setItems}
            getItemValue={(item) => item.deliveryNote}
            strategy="vertical"
            className={cn("flex flex-col", responsive && "max-lg:flex-row")}
            onValueCommit={(next, meta) => {
              if (!sameStopOrder(next, meta.previousValue)) void onCommit(orderedDeliveryNotes(next));
            }}
          >
            {items.flatMap((stop, index) => {
              const visual = getStopVisualStyle(stop.status);
              const isSelected = stop.deliveryNote === selected;
              const isLast = index === items.length - 1;
              const previous = items[index - 1];
              const wilaya = stopWilaya(stop);
              const commune = stopCommune(stop);
              const groupKey = locationGroupKey(stop);
              const showWilayaHeader = multipleWilayas && (!previous || stopWilaya(previous) !== wilaya);
              const showCommuneHeader = multipleCommunes && (!previous || locationGroupKey(previous) !== groupKey);
              const nodes: ReactNode[] = [];

              if (showWilayaHeader) {
                nodes.push(
                  <div
                    key={`wilaya-${wilaya}`}
                    role="presentation"
                    className={cn(
                      "sticky top-0 z-[2] bg-muted/90 px-3 py-1 backdrop-blur-sm",
                      responsive && "max-lg:hidden",
                    )}
                  >
                    <p className="t-micro text-muted-foreground">{wilaya}</p>
                  </div>,
                );
              }
              if (showCommuneHeader) {
                nodes.push(
                  <div
                    key={`commune-${groupKey}`}
                    role="presentation"
                    className={cn(
                      "sticky z-[1] flex items-center justify-between gap-2 border-b border-hairline bg-card px-3 py-1.5",
                      showWilayaHeader ? "top-6" : "top-0",
                      responsive && "max-lg:hidden",
                    )}
                  >
                    <p className="truncate text-[11px] font-medium text-foreground">{commune}</p>
                    <span className="num shrink-0 text-[10px] text-muted-foreground">
                      {countGroup(items, groupKey)}
                    </span>
                  </div>,
                );
              }

              nodes.push(
                <SortableItem
                  key={stop.deliveryNote}
                  value={stop.deliveryNote}
                  disabled={disabled}
                  role="presentation"
                >
                  <div
                    id={optionId(stop.deliveryNote)}
                    role="option"
                    aria-selected={isSelected}
                    data-focus-id={stop.deliveryNote}
                    data-stop-state={visual.state}
                    onClick={() => onSelect(stop.deliveryNote)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 border-l-2 px-3 py-2 text-left",
                      !isLast && "border-b border-hairline",
                      isSelected ? "border-l-foreground bg-surface-subtle" : "border-l-transparent hover:bg-surface-subtle",
                      highlight?.has(stop.deliveryNote) && FOCUS_HIGHLIGHT_CLASS,
                      responsive && "max-lg:border-b-0 max-lg:shrink-0",
                      responsive && !isLast && "max-lg:border-r max-lg:border-hairline",
                    )}
                  >
                    {reorderable ? (
                      <SortableItemHandle
                        render={<button type="button" />}
                        className={cn(
                          "cursor-grab text-muted-foreground hover:text-foreground",
                          responsive && "max-lg:hidden",
                        )}
                        aria-label={`Déplacer ${stop.customerName}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <GripVertical className="size-4" />
                      </SortableItemHandle>
                    ) : null}
                    <span
                      className={cn(
                        "num grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold",
                        visual.sequenceClass,
                      )}
                    >
                      {visual.markerSymbol || stop.sequence}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-xs font-medium",
                          responsive && "max-lg:max-w-[120px]",
                        )}
                      >
                        {stop.customerName}
                      </p>
                    </div>
                    {stop.requiresCustomerGeolocation ? (
                      <MapPin className="size-3 shrink-0 text-amber-700" aria-label="GPS client à collecter" />
                    ) : null}
                    <span className={cn("size-1.5 shrink-0 rounded-full", TONES[visual.tone].dot)} aria-hidden="true" />
                  </div>
                </SortableItem>,
              );

              return nodes;
            })}
          </Sortable>
        </div>
      </FramePanel>
    </Frame>
  );
}
