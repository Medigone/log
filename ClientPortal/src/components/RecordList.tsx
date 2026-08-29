import type { ReactNode } from "react"

export function RecordList({ table, items }: { table: ReactNode; items: ReactNode }) {
  return (
    <>
      <div className="md:hidden">{items}</div>
      <div className="hidden md:block">{table}</div>
    </>
  )
}
