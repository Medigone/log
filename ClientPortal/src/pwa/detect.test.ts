import { afterEach, describe, expect, it } from "vitest"
import { DISMISS_STORAGE_KEY } from "@/pwa/constants"
import { dismissBanner, isBannerDismissed, isIosDevice, isStandaloneDisplay } from "@/pwa/detect"

function stubMatchMedia(standalone: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: standalone && query.includes("display-mode: standalone"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

describe("détection PWA", () => {
  afterEach(() => {
    sessionStorage.clear()
    stubMatchMedia(false)
    Object.defineProperty(window.navigator, "userAgent", { configurable: true, value: "Mozilla/5.0" })
    Object.defineProperty(window.navigator, "standalone", { configurable: true, value: undefined })
  })

  it("détecte le mode standalone", () => {
    stubMatchMedia(true)
    expect(isStandaloneDisplay()).toBe(true)
  })

  it("détecte iOS via le user agent", () => {
    stubMatchMedia(false)
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    })
    expect(isIosDevice()).toBe(true)
    expect(isStandaloneDisplay()).toBe(false)
  })

  it("persiste le refus du bandeau pour la session", () => {
    expect(isBannerDismissed()).toBe(false)
    dismissBanner()
    expect(isBannerDismissed()).toBe(true)
    expect(sessionStorage.getItem(DISMISS_STORAGE_KEY)).toBe("1")
  })
})
