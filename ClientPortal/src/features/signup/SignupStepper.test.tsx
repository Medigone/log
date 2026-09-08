import { render, screen } from "@testing-library/react"
import { SignupStepper } from "@/features/signup/SignupStepper"

describe("SignupStepper", () => {
	it("marque l’inscription en ligne comme étape en cours", () => {
		render(<SignupStepper currentStep={1} />)
		expect(screen.getByRole("list", { name: /étapes pour devenir client/i })).toBeInTheDocument()
		expect(screen.getByText("Inscription en ligne")).toBeInTheDocument()
		expect(screen.getByText("Confirmation par un représentant")).toBeInTheDocument()
		expect(screen.getByText("Accès au Store")).toBeInTheDocument()
		expect(screen.getByText("Après un appel téléphonique")).toBeInTheDocument()
		const current = screen.getByRole("listitem", { current: "step" })
		expect(current).toHaveTextContent("Inscription en ligne")
		expect(current).toHaveTextContent("En cours")
		expect(screen.getAllByText("En attente")).toHaveLength(2)
	})

	it("passe à la confirmation après envoi de la demande", () => {
		render(<SignupStepper currentStep={2} />)
		const current = screen.getByRole("listitem", { current: "step" })
		expect(current).toHaveTextContent("Confirmation par un représentant")
		expect(current).toHaveTextContent("En cours")
		expect(screen.getByText("Terminé")).toBeInTheDocument()
	})
})
