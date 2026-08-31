import { DISMISS_STORAGE_KEY } from "@/pwa/constants"

export function isStandaloneDisplay(win: Window = window) {
  const nav = win.navigator as Navigator & { standalone?: boolean }
  if (nav.standalone) return true
  return Boolean(win.matchMedia?.("(display-mode: standalone)")?.matches)
}

export function isIosDevice(win: Window = window) {
  const ua = win.navigator.userAgent || ""
  if (/iphone|ipad|ipod/i.test(ua)) return true
  return win.navigator.platform === "MacIntel" && win.navigator.maxTouchPoints > 1
}

export function isBannerDismissed(storage: Storage | undefined = getSessionStorage()) {
  if (!storage) return false
  try {
    return storage.getItem(DISMISS_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export function dismissBanner(storage: Storage | undefined = getSessionStorage()) {
  if (!storage) return
  try {
    storage.setItem(DISMISS_STORAGE_KEY, "1")
  } catch {
    /* ignore quota / private mode */
  }
}

function getSessionStorage() {
  try {
    return window.sessionStorage
  } catch {
    return undefined
  }
}
