import { MemoryRouter } from "react-router-dom"
import { render, screen } from "@testing-library/react"
import { LandingPage } from "@/features/landing/LandingPage"

function renderLanding() {
	return render(
		<MemoryRouter>
			<LandingPage />
		</MemoryRouter>,
	)
}

describe("LandingPage", () => {
	it("fixe le titre de l’onglet à Modern Pharma", () => {
		document.title = "Ancien titre"
		renderLanding()
		expect(document.title).toBe("Modern Pharma")
	})

	it("expose les liens vers l’espace client", () => {
		renderLanding()
		const links = screen.getAllByRole("link", { name: /connexion|je suis déjà client|se connecter/i })
		expect(links.length).toBeGreaterThan(0)
		for (const link of links) {
			expect(link).toHaveAttribute("href", "/login")
		}
	})

	it("envoie vers le formulaire de candidature", () => {
		renderLanding()
		const links = screen.getAllByRole("link", { name: /devenir client|ouvrir un compte professionnel/i })
		expect(links.length).toBeGreaterThan(0)
		for (const link of links) {
			expect(link).toHaveAttribute("href", "/signup")
		}
	})

	it("n’affiche pas la boutique", () => {
		renderLanding()
		expect(screen.queryByRole("search")).not.toBeInTheDocument()
		expect(screen.getByRole("heading", { name: /le distributeur de vos rayons/i })).toBeInTheDocument()
	})

	it("affiche les wilayas desservies depuis Oran", () => {
		renderLanding()
		expect(screen.getByRole("heading", { name: /depuis oran, nous couvrons l’ouest algérien/i })).toBeInTheDocument()
		expect(screen.getByRole("list", { name: /wilayas principales desservies/i })).toBeInTheDocument()
		expect(screen.getByText("06")).toBeInTheDocument()
		expect(screen.getByText("Base logistique")).toBeInTheDocument()
		expect(screen.getByText("Aïn Témouchent")).toBeInTheDocument()
		expect(screen.getByText("Sidi Bel Abbès")).toBeInTheDocument()
		expect(screen.queryByText("+ wilayas limitrophes")).not.toBeInTheDocument()
		expect(screen.queryByRole("img", { name: /wilayas desservies/i })).not.toBeInTheDocument()
	})

	it("affiche le logo Modern Pharma", () => {
		renderLanding()
		const logos = screen.getAllByRole("img", { name: "Modern Pharma" })
		expect(logos.length).toBeGreaterThan(0)
		for (const logo of logos) {
			expect(logo).toHaveAttribute("src", "/assets/log/images/logo_mp_new.png")
		}
	})
})
