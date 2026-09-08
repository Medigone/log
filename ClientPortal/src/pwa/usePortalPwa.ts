import { useCallback, useEffect, useRef, useState } from "react"
import { dismissBanner, isBannerDismissed, isIosDevice, isStandaloneDisplay } from "@/pwa/detect"
import { getDeferredInstallPrompt, promptInstall, subscribeInstallPrompt } from "@/pwa/installPrompt"
import { registerPortalServiceWorker, subscribePushManager } from "@/pwa/push"
import { apiErrorMessage, usePushConfig, usePushSubscriptionActions } from "@/shared/api"

export type PushStatus = "idle" | "unsupported" | "needs-install" | "denied" | "prompt" | "subscribed" | "error"

function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported"
  return Notification.permission
}

export function usePortalPwa() {
  const [isStandalone, setStandalone] = useState(() => (typeof window === "undefined" ? false : isStandaloneDisplay()))
  const [isIos, setIos] = useState(() => (typeof window === "undefined" ? false : isIosDevice()))
  const [canPrompt, setCanPrompt] = useState(() => Boolean(getDeferredInstallPrompt()))
  const [dismissed, setDismissed] = useState(() => isBannerDismissed())
  const [installing, setInstalling] = useState(false)
  const [enablingPush, setEnablingPush] = useState(false)
  const [pushStatus, setPushStatus] = useState<PushStatus>("idle")
  const [pushError, setPushError] = useState("")
  const config = usePushConfig()
  const actions = usePushSubscriptionActions()
  const subscribeRef = useRef(actions.subscribe)
  subscribeRef.current = actions.subscribe
  const vapidPublicKey = config.data?.message?.vapidPublicKey || ""

  const refreshDisplay = useCallback(() => {
    setStandalone(isStandaloneDisplay())
    setIos(isIosDevice())
    setDismissed(isBannerDismissed())
  }, [])

  useEffect(() => {
    refreshDisplay()
    const unsub = subscribeInstallPrompt((event) => setCanPrompt(Boolean(event)))
    const media = window.matchMedia("(display-mode: standalone)")
    const onChange = () => setStandalone(isStandaloneDisplay())
    media.addEventListener("change", onChange)
    return () => {
      unsub()
      media.removeEventListener("change", onChange)
    }
  }, [refreshDisplay])

  const persistSubscription = useCallback(async (subscription: PushSubscription) => {
    const json = subscription.toJSON()
    const endpoint = json.endpoint
    const p256dh = json.keys?.p256dh
    const auth = json.keys?.auth
    if (!endpoint || !p256dh || !auth) throw new Error("Abonnement push incomplet.")
    await subscribeRef.current({
      endpoint,
      keys: { p256dh, auth },
      userAgent: navigator.userAgent,
    })
    setPushStatus("subscribed")
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const registration = await registerPortalServiceWorker()
        if (cancelled) return
        if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
          setPushStatus("unsupported")
          return
        }
        if (isIosDevice() && !isStandaloneDisplay()) {
          setPushStatus("needs-install")
          return
        }
        const permission = notificationPermission()
        if (permission === "denied") {
          setPushStatus("denied")
          return
        }
        const ready = registration || (await navigator.serviceWorker.ready)
        const existing = await ready.pushManager.getSubscription()
        if (existing && permission === "granted") {
          await persistSubscription(existing)
          return
        }
        if (permission === "granted" && vapidPublicKey) {
          const subscription = await subscribePushManager(vapidPublicKey)
          if (!cancelled) await persistSubscription(subscription)
          return
        }
        if (isStandaloneDisplay() && permission === "default" && vapidPublicKey) {
          const next = await Notification.requestPermission()
          if (cancelled) return
          if (next === "granted") {
            const subscription = await subscribePushManager(vapidPublicKey)
            await persistSubscription(subscription)
          } else {
            setPushStatus(next === "denied" ? "denied" : "prompt")
          }
          return
        }
        setPushStatus("prompt")
      } catch (error) {
        if (!cancelled) {
          setPushStatus("error")
          setPushError(apiErrorMessage(error))
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [persistSubscription, vapidPublicKey])

  const install = async () => {
    setInstalling(true)
    try {
      const outcome = await promptInstall()
      refreshDisplay()
      return outcome
    } finally {
      setInstalling(false)
    }
  }

  const dismiss = () => {
    dismissBanner()
    setDismissed(true)
  }

  const enablePush = async () => {
    setEnablingPush(true)
    setPushError("")
    try {
      if (isIosDevice() && !isStandaloneDisplay()) {
        setPushStatus("needs-install")
        return
      }
      await registerPortalServiceWorker()
      if (typeof Notification === "undefined") {
        setPushStatus("unsupported")
        return
      }
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setPushStatus(permission === "denied" ? "denied" : "prompt")
        return
      }
      if (!vapidPublicKey) throw new Error("Clé de notification indisponible.")
      const subscription = await subscribePushManager(vapidPublicKey)
      await persistSubscription(subscription)
    } catch (error) {
      setPushStatus("error")
      setPushError(apiErrorMessage(error))
    } finally {
      setEnablingPush(false)
    }
  }

  return {
    isStandalone,
    isIos,
    canPrompt,
    canInstall: !isStandalone,
    showBanner: !isStandalone && !dismissed,
    installing,
    install,
    dismiss,
    pushStatus,
    pushError,
    enablingPush,
    enablePush,
  }
}
