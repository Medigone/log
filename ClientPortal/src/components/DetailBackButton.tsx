import { Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export function DetailBackButton({ to, label }: { to: string; label: string }) {
  return (
    <Button variant="ghost" className="-ml-2 w-fit" render={<Link to={to} />} nativeButton={false}>
      <ArrowLeft data-icon="inline-start" />
      {label}
    </Button>
  )
}
