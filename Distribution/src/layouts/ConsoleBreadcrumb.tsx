import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { Fragment } from "react"
import { Link, useLocation } from "react-router-dom"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { crumbsFromPath } from "@/layouts/breadcrumbPath"

const LastCrumbContext = createContext<{
  lastLabel: string | null
  setLastLabel: (label: string | null) => void
}>({ lastLabel: null, setLastLabel: () => {} })

export function BreadcrumbLabelProvider({ children }: { children: ReactNode }) {
  const [lastLabel, setLastLabel] = useState<string | null>(null)
  return <LastCrumbContext.Provider value={{ lastLabel, setLastLabel }}>{children}</LastCrumbContext.Provider>
}

/** Remplace le dernier segment du fil d’Ariane (ex. id technique → nom du véhicule). */
export function BreadcrumbLabel({ children }: { children?: string }) {
  const { setLastLabel } = useContext(LastCrumbContext)
  useEffect(() => {
    setLastLabel(children || null)
    return () => setLastLabel(null)
  }, [children, setLastLabel])
  return null
}

export function ConsoleBreadcrumb() {
  const { pathname } = useLocation()
  const { lastLabel } = useContext(LastCrumbContext)
  const crumbs = crumbsFromPath(pathname).map((crumb, index, list) =>
    index === list.length - 1 && lastLabel ? { ...crumb, label: lastLabel } : crumb,
  )

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              {index > 0 && <BreadcrumbSeparator className="hidden md:block" />}
              <BreadcrumbItem className={index === 0 && !last ? "hidden md:block" : undefined}>
                {last || !crumb.to ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link to={crumb.to} />}>{crumb.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
