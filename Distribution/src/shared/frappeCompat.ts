export type FrappeBoot = {
  desk_path?: string
  versions?: { frappe?: string }
}

function boot(): FrappeBoot | undefined {
  return (window as typeof window & { frappe?: { boot?: FrappeBoot } }).frappe?.boot
}

export function frappeMajorVersion(version?: string): number {
  const raw = version ?? boot()?.versions?.frappe ?? "15"
  const major = Number.parseInt(String(raw).split(".")[0] ?? "15", 10)
  return Number.isFinite(major) ? major : 15
}

export function deskRoot(version?: string): string {
  const fromBoot = boot()?.desk_path
  if (!version && fromBoot) return fromBoot
  return frappeMajorVersion(version) >= 16 ? "/desk" : "/app"
}

export function deskPath(...parts: string[]): string {
  const rest = parts.map((part) => part.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/")
  return rest ? `${deskRoot()}/${rest}` : deskRoot()
}
