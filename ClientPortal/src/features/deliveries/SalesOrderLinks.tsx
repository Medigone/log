import { Link } from "react-router-dom"

export function SalesOrderLinks({ names, className }: { names?: string[] | null; className?: string }) {
  if (!names?.length) return <span className={className}>—</span>
  return (
    <span className={className}>
      {names.map((name, index) => (
        <span key={name}>
          {index > 0 ? ", " : null}
          <Link to={`/orders/${name}`} className="text-primary text-sm font-medium underline-offset-4 hover:underline">
            {name}
          </Link>
        </span>
      ))}
    </span>
  )
}

export function salesOrderLabel(names?: string[] | null) {
  if (!names?.length) return null
  if (names.length === 1) return `Commande ${names[0]}`
  return `Commandes ${names.join(", ")}`
}
