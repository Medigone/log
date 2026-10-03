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
import { crumbsFromPath, type Crumb } from "@/layouts/breadcrumbPath"

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

function CrumbInner({ crumb }: { crumb: Crumb }) {
  const Icon = crumb.icon
  return (
    <>
      {Icon ? <Icon className="size-4" /> : null}
      {crumb.label}
    </>
  )
}

export function ConsoleBreadcrumb() {
  const { pathname, search } = useLocation()
  const { lastLabel } = useContext(LastCrumbContext)
  const crumbs = crumbsFromPath(pathname, search).map((crumb, index, list) =>
    index === list.length - 1 && lastLabel ? { ...crumb, label: lastLabel } : crumb,
  )

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          const inner = <CrumbInner crumb={crumb} />
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              {index > 0 && <BreadcrumbSeparator className="hidden md:block" />}
              <BreadcrumbItem className={index === 0 && !last ? "hidden md:block" : undefined}>
                {last ? (
                  <BreadcrumbPage className="flex items-center gap-1.5">{inner}</BreadcrumbPage>
                ) : crumb.to ? (
                  <BreadcrumbLink className="flex items-center gap-1.5" render={<Link to={crumb.to} />}>
                    {inner}
                  </BreadcrumbLink>
                ) : (
                  <span className="flex items-center gap-1.5">{inner}</span>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
