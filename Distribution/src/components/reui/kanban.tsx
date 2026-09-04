"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface KanbanItem {
  id: UniqueIdentifier;
  columnId: UniqueIdentifier;
}

export interface KanbanColumn {
  id: UniqueIdentifier;
}

export interface KanbanValue<T extends KanbanItem> {
  columns: KanbanColumn[];
  items: T[];
}

export interface KanbanCommit<T extends KanbanItem> {
  item: T;
  fromColumnId: UniqueIdentifier;
  toColumnId: UniqueIdentifier;
  newIndex: number;
}

interface KanbanRootProps<T extends KanbanItem> {
  value: KanbanValue<T>;
  onValueChange: (next: KanbanValue<T>) => void;
  onValueCommit?: (commit: KanbanCommit<T>) => void | Promise<void>;
  restoreOnCancel?: boolean;
  collisionDetection?: CollisionDetection;
  children: React.ReactNode;
  className?: string;
}

interface KanbanContextValue<T extends KanbanItem> {
  activeItem: T | null;
  value: KanbanValue<T>;
  previousValue: React.MutableRefObject<KanbanValue<T>>;
}

const KanbanCtx = React.createContext<KanbanContextValue<KanbanItem> | null>(null);

function useKanbanContext<T extends KanbanItem>() {
  const ctx = React.useContext(KanbanCtx) as KanbanContextValue<T> | null;
  if (!ctx) throw new Error("useKanbanContext must be used within Kanban");
  return ctx;
}

type SortableItemApi = ReturnType<typeof useSortable>;
const SortableItemCtx = React.createContext<SortableItemApi | null>(null);

export function Kanban<T extends KanbanItem>({
  value,
  onValueChange,
  onValueCommit,
  restoreOnCancel = true,
  collisionDetection = closestCorners,
  children,
  className,
}: KanbanRootProps<T>) {
  const [activeItem, setActiveItem] = React.useState<T | null>(null);
  const previousValue = React.useRef<KanbanValue<T>>(value);
  const valueRef = React.useRef(value);
  valueRef.current = value;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findColumn = (id: UniqueIdentifier, board: KanbanValue<T>): UniqueIdentifier | undefined => {
    if (board.columns.some((column) => column.id === id)) return id;
    return board.items.find((item) => item.id === id)?.columnId;
  };

  const handleDragStart = (event: DragStartEvent) => {
    previousValue.current = { columns: value.columns, items: [...value.items] };
    const item = value.items.find((entry) => entry.id === event.active.id) as T | undefined;
    setActiveItem(item ?? null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const board = valueRef.current;
    const activeCol = findColumn(active.id, board);
    const overCol = findColumn(over.id, board);
    if (!activeCol || !overCol || activeCol === overCol) return;
    onValueChange({
      ...board,
      items: board.items.map((item) => (item.id === active.id ? { ...item, columnId: overCol } : item)),
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);
    if (!over) {
      if (restoreOnCancel) onValueChange(previousValue.current);
      return;
    }
    const board = valueRef.current;
    const overCol = findColumn(over.id, board);
    const fromColumnId = previousValue.current.items.find((item) => item.id === active.id)?.columnId;
    if (!overCol || fromColumnId == null) {
      if (restoreOnCancel) onValueChange(previousValue.current);
      return;
    }

    const colItems = board.items.filter((item) => item.columnId === overCol || item.id === active.id);
    const oldIndex = colItems.findIndex((item) => item.id === active.id);
    const overIndex = colItems.findIndex((item) => item.id === over.id);
    let ordered = colItems.map((item) => (item.id === active.id ? { ...item, columnId: overCol } : item));
    if (oldIndex !== -1 && overIndex !== -1 && oldIndex !== overIndex) {
      ordered = arrayMove(ordered, oldIndex, overIndex);
    }

    const nextItems = board.items
      .filter((item) => item.columnId !== overCol && item.id !== active.id)
      .concat(ordered.map((item) => ({ ...item, columnId: overCol })));
    const next = { ...board, items: nextItems };
    onValueChange(next);

    const movedItem = nextItems.find((item) => item.id === active.id) as T | undefined;
    const finalIndex = nextItems.filter((item) => item.columnId === overCol).findIndex((item) => item.id === active.id);
    if (!movedItem || (fromColumnId === overCol && finalIndex === previousValue.current.items.filter((item) => item.columnId === fromColumnId).findIndex((item) => item.id === active.id))) {
      return;
    }

    void Promise.resolve(
      onValueCommit?.({
        item: movedItem,
        fromColumnId,
        toColumnId: overCol,
        newIndex: Math.max(finalIndex, 0),
      }),
    ).catch(() => {
      if (restoreOnCancel) onValueChange(previousValue.current);
    });
  };

  const ctx: KanbanContextValue<T> = { activeItem, value, previousValue };

  return (
    <KanbanCtx.Provider value={ctx as unknown as KanbanContextValue<KanbanItem>}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className={className}>{children}</div>
      </DndContext>
    </KanbanCtx.Provider>
  );
}

export function KanbanBoard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}

interface KanbanColumnProps {
  id: UniqueIdentifier;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onOverChange?: (isOver: boolean) => void;
  "aria-label"?: string;
}

export function KanbanColumn({ id, children, className, disabled, onOverChange, ...rest }: KanbanColumnProps) {
  const { value } = useKanbanContext();
  const items = value.items.filter((item) => item.columnId === id);
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  React.useEffect(() => {
    onOverChange?.(isOver);
  }, [isOver, onOverChange]);
  return (
    <div
      ref={setNodeRef}
      className={className}
      data-column-id={id}
      data-disabled={disabled || undefined}
      data-over={isOver || undefined}
      {...rest}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy} disabled={disabled}>
        {children}
      </SortableContext>
    </div>
  );
}

interface KanbanItemProps {
  id: UniqueIdentifier;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  asHandle?: boolean;
}

export function KanbanItem({ id, children, className, disabled, asHandle }: KanbanItemProps) {
  const sortable = useSortable({ id, disabled });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <SortableItemCtx.Provider value={sortable}>
      <div
        ref={setNodeRef}
        style={style}
        className={className}
        data-dragging={isDragging || undefined}
        {...(disabled ? {} : asHandle ? { ...attributes, ...listeners } : attributes)}
      >
        {children}
      </div>
    </SortableItemCtx.Provider>
  );
}

export function KanbanItemHandle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const sortable = React.useContext(SortableItemCtx);
  if (!sortable) return <span className={className}>{children}</span>;
  return (
    <button type="button" className={className} {...sortable.listeners} {...sortable.attributes}>
      {children}
    </button>
  );
}

export function KanbanOverlay({ children }: { children: React.ReactNode }) {
  return <DragOverlay>{children}</DragOverlay>;
}

export { useKanbanContext };
