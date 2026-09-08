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
	useFrappePostCall: () => ({
		call: vi.fn(),
		loading: false,
	}),
}))

vi.mock("@/shared/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/shared/api")>()
	return {
		...actual,
		usePortalContext: () => {
			throw new Error("usePortalContext ne doit pas être appelé pour un Guest")
		},
		useSignupOptions: () => ({
			data: {
				message: {
					communes: [{ name: "COM-1", nom: "Oran", wilaya: "Oran", wilayaName: "Oran" }],
					categories: [{ name: "Commercial", label: "Commercial" }],
				},
			},
			isLoading: false,
			error: null,
		}),
		useCustomerSignup: () => ({ submit: vi.fn(), sending: false }),
	}
})

describe("App invité", () => {
	beforeEach(() => {
		window.location.hash = ""
	})

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
		expect(screen.getByRole("link", { name: /mot de passe oublié/i })).toHaveAttribute("href", "#/forgot")
	})

	it("ouvre la page mot de passe oublié dans le même chrome que le login", async () => {
		const user = userEvent.setup()
		render(<App />)
		await user.click(screen.getByRole("link", { name: /^connexion$/i }))
		await user.click(screen.getByRole("link", { name: /mot de passe oublié/i }))
		expect(screen.getByRole("heading", { name: "Mot de passe oublié" })).toBeInTheDocument()
		expect(screen.getByText("Modern Pharma")).toBeInTheDocument()
		expect(screen.getByLabelText("Identifiant")).toHaveAttribute("type", "text")
		expect(screen.getByRole("button", { name: "Envoyer le lien" })).toBeInTheDocument()
		expect(screen.getByRole("link", { name: /retour à la connexion/i })).toHaveAttribute("href", "#/login")
		expect(screen.getByRole("link", { name: /retour à l’accueil/i })).toHaveAttribute("href", "#/")
	})

	it("ouvre le formulaire Devenir client depuis la landing", async () => {
		const user = userEvent.setup()
		render(<App />)
		await user.click(screen.getAllByRole("link", { name: /^devenir client$/i })[0])
		expect(screen.getByRole("heading", { name: "Devenir client" })).toBeInTheDocument()
		expect(screen.getByLabelText("Nom commercial")).toBeRequired()
		expect(screen.getByLabelText("Catégorie client")).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "Envoyer la demande" })).toBeInTheDocument()
	})
})
