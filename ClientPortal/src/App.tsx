import { FrappeProvider, useFrappeAuth } from "frappe-react-sdk"
import { HashRouter, Navigate, Route, Routes } from "react-router-dom"
import { CartProvider } from "@/cart/CartContext"
import { ErrorState } from "@/components/LoadState"
import { Toaster } from "@/components/ui/sonner"
import { Spinner } from "@/components/ui/spinner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AccountPage } from "@/features/account/AccountPage"
import { LoginPage } from "@/features/auth/LoginPage"
import { InitialPasswordChangePage } from "@/features/auth/InitialPasswordChangePage"
import { CartPage } from "@/features/cart/CartPage"
import { DeliveriesPage } from "@/features/deliveries/DeliveriesPage"
import { DeliveryDetailPage } from "@/features/deliveries/DeliveryDetailPage"
import { LandingPage } from "@/features/landing/LandingPage"
import { NotificationsPage } from "@/features/notifications/NotificationsPage"
import { OrderDetailPage } from "@/features/orders/OrderDetailPage"
import { OrdersPage } from "@/features/orders/OrdersPage"
import { PaymentsPage } from "@/features/payments/PaymentsPage"
import { RequestDetailPage } from "@/features/requests/RequestDetailPage"
import { RequestFormPage } from "@/features/requests/RequestFormPage"
import { RequestsPage } from "@/features/requests/RequestsPage"
import { ProductPage } from "@/features/store/ProductPage"
import { StorefrontPage } from "@/features/store/StorefrontPage"
import { ClientShell } from "@/layouts/ClientShell"
import { usePortalContext } from "@/shared/api"

function siteName() {
  const frappeWindow = window as typeof window & { frappe?: { boot?: { sitename?: string } } }
  return frappeWindow.frappe?.boot?.sitename || import.meta.env.VITE_SITE_NAME || window.location.hostname
}

function SessionGate({ label }: { label: string }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
      <Spinner />
      {label}
    </div>
  )
}

function GuestRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function AuthenticatedRoutes({ currentUser }: { currentUser: string }) {
  const { data, isLoading, error, mutate } = usePortalContext(currentUser)
  if (isLoading) return <SessionGate label="Chargement du portail…" />
  if (error || !data?.message) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <ErrorState error={error || new Error("Compte client non configuré.")} />
      </main>
    )
  }
  const context = data.message
  if (context.mustChangePassword) {
    return <InitialPasswordChangePage email={context.user.email} onComplete={async () => { await mutate() }} />
  }
  return (
    <CartProvider user={context.user.name}>
      <ClientShell context={context}>
        <Routes>
          <Route path="/" element={<StorefrontPage context={context} />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/store" element={<Navigate to="/" replace />} />
          <Route path="/products/:itemCode" element={<ProductPage />} />
          <Route path="/cart" element={<CartPage context={context} />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:orderId" element={<OrderDetailPage today={context.today} />} />
          <Route path="/deliveries" element={<DeliveriesPage />} />
          <Route path="/deliveries/:deliveryId" element={<DeliveryDetailPage />} />
          <Route path="/payments" element={<PaymentsPage context={context} />} />
          <Route path="/requests" element={<RequestsPage />} />
          <Route path="/requests/new" element={<RequestFormPage today={context.today} />} />
          <Route path="/requests/:requestId" element={<RequestDetailPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/account" element={<AccountPage context={context} onUpdated={mutate} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ClientShell>
    </CartProvider>
  )
}

function PortalRoutes() {
  const { currentUser, isValidating } = useFrappeAuth()
  if (isValidating) return <SessionGate label="Vérification de la session…" />
  if (!currentUser || currentUser === "Guest") return <GuestRoutes />
  return <AuthenticatedRoutes currentUser={currentUser} />
}

export default function App() {
  return (
    <FrappeProvider url={window.location.origin} siteName={siteName()} socketPort={import.meta.env.VITE_SOCKET_PORT || "9000"}>
      <HashRouter>
        <TooltipProvider>
          <PortalRoutes />
          <Toaster richColors position="top-right" />
        </TooltipProvider>
      </HashRouter>
    </FrappeProvider>
  )
}
