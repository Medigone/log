import { describe, expect, it } from "vitest"
import { deskPath, deskRoot, frappeMajorVersion } from "@/shared/frappeCompat"

describe("frappeCompat", () => {
  it("choisit /app sur Frappe 15 et /desk à partir de 16", () => {
    expect(frappeMajorVersion("15.76.0")).toBe(15)
    expect(frappeMajorVersion("16.0.0")).toBe(16)
    expect(deskRoot("15.76.0")).toBe("/app")
    expect(deskRoot("16.2.1")).toBe("/desk")
  })

  it("compose un chemin Desk versionné", () => {
    expect(deskPath()).toBe(deskRoot())
  })
})
