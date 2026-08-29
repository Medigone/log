import { useCallback } from "react"
import { useSearchParams } from "react-router-dom"

export type SortDir = "asc" | "desc"

export function paramOrAll(value: string | null) {
  return value && value !== "all" ? value : ""
}

export function parseSort<T extends string>(
  params: URLSearchParams,
  fields: readonly T[],
  defaultField: T,
): { field: T; dir: SortDir } {
  const allowed = new Set<string>(fields)
  const raw = params.get("sort") || ""
  const legacy = raw.match(/^(.+)_(asc|desc)$/)
  if (legacy && allowed.has(legacy[1])) {
    return { field: legacy[1] as T, dir: legacy[2] as SortDir }
  }
  const field = allowed.has(raw) ? (raw as T) : defaultField
  const dir: SortDir = params.get("dir") === "asc" ? "asc" : "desc"
  return { field, dir }
}

export function useListQuery(defaultSortField = "date") {
  const [params, setParams] = useSearchParams()
  const patch = useCallback(
    (updates: Record<string, string | number | undefined>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(updates)) {
            const text = value == null ? "" : String(value)
            const omit =
              text === "" ||
              text === "all" ||
              (key === "page" && text === "1") ||
              (key === "sort" && text === defaultSortField) ||
              (key === "dir" && text === "desc")
            if (omit) next.delete(key)
            else next.set(key, text)
          }
          return next
        },
        { replace: true },
      )
    },
    [defaultSortField, setParams],
  )
  const reset = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams])
  return { params, patch, reset }
}
