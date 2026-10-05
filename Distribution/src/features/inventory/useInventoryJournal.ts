import { useCallback, useEffect, useRef, useState } from "react"
import {
  applyResults,
  pendingEntries,
  readJournal,
  writeJournal,
  type JournalEntry,
} from "@/features/inventory/inventoryScan"
import type { CountEntryInput, CountEntryResult } from "@/shared/api/inventory"

const FLUSH_INTERVAL_MS = 3000
const FLUSH_BATCH_SIZE = 20
const MAX_BATCH = 50

/**
 * File de saisies de l'appareil : chaque scan s'affiche tout de suite, part par lot
 * toutes les 3 s (ou dès 20 saisies) et survit à une coupure réseau ou un rechargement.
 */
export function useInventoryJournal(
  inventory: string | undefined,
  send: (entries: CountEntryInput[]) => Promise<CountEntryResult[]>,
  onSynced?: () => void,
) {
  const [journal, setJournal] = useState<JournalEntry[]>(() => (inventory ? readJournal(inventory) : []))
  const [syncing, setSyncing] = useState(false)
  const [offline, setOffline] = useState(false)
  const journalRef = useRef(journal)
  const syncingRef = useRef(false)
  const sendRef = useRef(send)
  const onSyncedRef = useRef(onSynced)
  sendRef.current = send
  onSyncedRef.current = onSynced

  const update = useCallback(
    (next: (current: JournalEntry[]) => JournalEntry[]) => {
      const value = next(journalRef.current)
      journalRef.current = value
      setJournal(value)
      if (inventory) writeJournal(inventory, value)
    },
    [inventory],
  )

  useEffect(() => {
    const value = inventory ? readJournal(inventory) : []
    journalRef.current = value
    setJournal(value)
  }, [inventory])

  const flush = useCallback(async () => {
    if (syncingRef.current || !inventory) return
    const batch = pendingEntries(journalRef.current).slice(0, MAX_BATCH)
    if (!batch.length) return
    syncingRef.current = true
    setSyncing(true)
    try {
      const results = await sendRef.current(batch)
      update((current) => applyResults(current, results))
      setOffline(false)
      onSyncedRef.current?.()
    } catch {
      // Réseau coupé ou serveur indisponible : les saisies restent en file et repartiront.
      setOffline(true)
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [inventory, update])

  useEffect(() => {
    const timer = window.setInterval(() => void flush(), FLUSH_INTERVAL_MS)
    const online = () => void flush()
    window.addEventListener("online", online)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("online", online)
    }
  }, [flush])

  const add = useCallback(
    (entry: JournalEntry) => {
      update((current) => [...current, entry])
      if (pendingEntries(journalRef.current).length >= FLUSH_BATCH_SIZE) void flush()
    },
    [flush, update],
  )

  const markUndone = useCallback(
    (clientUuid: string) =>
      update((current) =>
        current.map((entry) => (entry.client_uuid === clientUuid ? { ...entry, state: "undone", message: undefined } : entry)),
      ),
    [update],
  )

  const dismiss = useCallback(
    (clientUuid: string) => update((current) => current.filter((entry) => entry.client_uuid !== clientUuid)),
    [update],
  )

  const pendingCount = journal.filter((entry) => entry.state === "pending").length
  const errorCount = journal.filter((entry) => entry.state === "error").length

  return { journal, add, flush, markUndone, dismiss, syncing, offline, pendingCount, errorCount }
}
