import { useLocation } from "react-router-dom"

export function listSearchState(search: string) {
  return { listSearch: search }
}

export function useListBackPath(fallback: string) {
  const location = useLocation()
  const state = location.state as { listSearch?: string } | null
  return typeof state?.listSearch === "string" ? `${fallback}${state.listSearch}` : fallback
}
