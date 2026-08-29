import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Sidebar, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

function stubMobileMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

describe("Sidebar mobile", () => {
  beforeEach(() => {
    stubMobileMatchMedia()
  })

  it("ouvre le menu au premier tap", async () => {
    const user = userEvent.setup()
    render(
      <SidebarProvider>
        <Sidebar>
          <nav>Navigation</nav>
        </Sidebar>
        <SidebarTrigger />
      </SidebarProvider>,
    )

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }))
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible())
    expect(screen.getByText("Navigation")).toBeVisible()
  })

  it("ne se referme pas sur le clic fantôme du tap d'ouverture", async () => {
    const user = userEvent.setup()
    render(
      <SidebarProvider>
        <Sidebar>
          <nav>Navigation</nav>
        </Sidebar>
        <SidebarTrigger />
      </SidebarProvider>,
    )

    await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }))
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible())

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    expect(screen.getByRole("dialog")).toBeVisible()
  })
})
