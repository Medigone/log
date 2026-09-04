import { useEffect, useState } from "react";

export const FOCUS_HIGHLIGHT_CLASS = "ring-2 ring-brand-500 ring-offset-2";

function focusSelector(id: string) {
  const escaped = CSS.escape(id);
  return `[data-focus-id="${escaped}"], [data-row-id="${escaped}"]`;
}

function nodesFor(ids: string[]) {
  return ids.flatMap((id) => [...document.querySelectorAll(focusSelector(id))]) as HTMLElement[];
}

/** Scrolls the first matching node into view and rings matches for ~3s. */
export function useFocusHighlight(ids: Iterable<string> | undefined, ready = true) {
  const key = [...new Set([...(ids ?? [])].filter(Boolean))].join("\0");
  const [active, setActive] = useState<Set<string>>(new Set());

  useEffect(() => {
    const list = key ? key.split("\0") : [];
    const classes = FOCUS_HIGHLIGHT_CLASS.split(" ");
    const clearNodes = () => {
      nodesFor(list).forEach((node) => node.classList.remove(...classes));
    };
    if (!ready || !list.length) {
      setActive(new Set());
      return;
    }
    setActive(new Set(list));
    const scrollTimer = window.setTimeout(() => {
      const nodes = nodesFor(list);
      nodes.forEach((node) => node.classList.add(...classes));
      nodes[0]?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    }, 80);
    const clearTimer = window.setTimeout(() => {
      clearNodes();
      setActive(new Set());
    }, 3200);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
      clearNodes();
    };
  }, [key, ready]);

  return active;
}
