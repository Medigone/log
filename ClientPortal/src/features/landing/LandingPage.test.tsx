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
		expect(document.title).toBe("Modern Pharma — parapharmacie et nutrition infantile")
	})

	it("expose les accès Store et espace client vers la connexion", () => {
		renderLanding()
		expect(screen.getByRole("link", { name: "Accéder au Store →" })).toHaveAttribute("href", "/login")
		expect(screen.getByRole("link", { name: "Découvrir le Store →" })).toHaveAttribute("href", "/login")
		const spaceLinks = screen.getAllByRole("link", { name: /mon espace client|accéder à mon espace|espace client|connexion/i })
		expect(spaceLinks.length).toBeGreaterThan(0)
		for (const link of spaceLinks) {
			expect(link).toHaveAttribute("href", "/login")
		}
	})

	it("envoie vers le formulaire de candidature", () => {
		renderLanding()
		const links = screen.getAllByRole("link", { name: /devenir client/i })
		expect(links.length).toBeGreaterThan(0)
		for (const link of links) {
			expect(link).toHaveAttribute("href", "/signup")
		}
	})

	it("n’affiche pas la boutique pour les visiteurs", () => {
		renderLanding()
		expect(screen.queryByRole("search")).not.toBeInTheDocument()
		expect(screen.getByRole("heading", { name: /la distribution, simplement/i })).toBeInTheDocument()
		expect(screen.getByRole("heading", { name: /vos commandes professionnelles/i })).toBeInTheDocument()
		expect(screen.getByRole("heading", { name: /tout votre suivi dans un seul espace/i })).toBeInTheDocument()
		expect(screen.queryByRole("link", { name: /nous contacter/i })).not.toBeInTheDocument()
		expect(screen.queryByRole("button", { name: /nous contacter/i })).not.toBeInTheDocument()
		expect(screen.getByText("Passez commande en ligne")).toBeInTheDocument()
		expect(screen.getByText("Un article absent du catalogue ?")).toBeInTheDocument()
		expect(screen.getByText("Suivez votre commande")).toBeInTheDocument()
		expect(screen.queryByText("Repérez les conditions commerciales")).not.toBeInTheDocument()
		expect(screen.getByText("Demander un article")).toBeInTheDocument()
		expect(screen.getByText(/aperçu illustratif/i)).toBeInTheDocument()
		expect(screen.getByAltText("Lait 1er âge")).toHaveAttribute("src", "/assets/log/images/store-preview-lait.jpg")
		expect(screen.getByAltText("Compote fruits")).toHaveAttribute("src", "/assets/log/images/store-preview-compote.jpg")
		expect(screen.getByText("La gamme peut être étendue selon les besoins des clients.")).toBeInTheDocument()
	})

	it("place la couverture après le Store et l’espace client", () => {
		renderLanding()
		expect(screen.getByRole("heading", { name: /une plateforme digitale/i })).toBeInTheDocument()
		expect(screen.queryByRole("heading", { name: /depuis oran, nous couvrons l’ouest algérien/i })).not.toBeInTheDocument()
		expect(screen.getByRole("list", { name: /wilayas principales desservies/i })).toBeInTheDocument()
		expect(screen.getByText("06")).toBeInTheDocument()
		expect(screen.getByText("Base logistique")).toBeInTheDocument()
		expect(screen.getByText("Aïn Témouchent")).toBeInTheDocument()
		expect(screen.getByText("Sidi Bel Abbès")).toBeInTheDocument()
		expect(screen.getAllByText("Nutrition infantile").length).toBeGreaterThan(0)
		expect(screen.getAllByText("Parapharmacie").length).toBeGreaterThan(0)
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
