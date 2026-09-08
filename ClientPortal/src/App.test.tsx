import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"
import App from "@/App"

vi.mock("frappe-react-sdk", () => ({
	FrappeProvider: ({ children }: { children: ReactNode }) => children,
	useFrappeAuth: () => ({
		currentUser: "Guest",
		isValidating: false,
		login: vi.fn(),
	}),
}))

vi.mock("@/shared/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/shared/api")>()
	return {
		...actual,
		usePortalContext: () => {
			throw new Error("usePortalContext ne doit pas être appelé pour un Guest")
		},
	}
})

describe("App invité", () => {
	it("affiche la landing et non le store", () => {
		render(<App />)
		expect(screen.getByRole("heading", { name: /le distributeur de vos rayons/i })).toBeInTheDocument()
		expect(screen.getByRole("link", { name: /^connexion$/i })).toHaveAttribute("href", "#/login")
		expect(screen.queryByText(/article promo/i)).not.toBeInTheDocument()
	})

	it("ouvre le login SPA depuis Connexion", async () => {
		const user = userEvent.setup()
		render(<App />)
		await user.click(screen.getByRole("link", { name: /^connexion$/i }))
		expect(screen.getByRole("heading", { name: "Connexion" })).toBeInTheDocument()
		expect(screen.getByLabelText("Identifiant")).toHaveAttribute("type", "text")
		expect(screen.getByText("Modern Pharma")).toBeInTheDocument()
		expect(screen.queryByText(/Espace clients/i)).not.toBeInTheDocument()
		expect(screen.queryByText(/Accès sur invitation/i)).not.toBeInTheDocument()
		expect(screen.getByRole("link", { name: /retour à l’accueil/i })).toHaveAttribute("href", "#/")
	})
})
