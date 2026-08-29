import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

describe("Dialog Base UI", () => {
  it("gère le focus et se ferme avec Échap", async () => {
    const user = userEvent.setup()
    render(<Dialog><DialogTrigger render={<Button />}>Ouvrir</DialogTrigger><DialogContent><DialogTitle>Confirmation</DialogTitle><DialogDescription>Action à confirmer</DialogDescription><Button>Confirmer</Button></DialogContent></Dialog>)
    await user.click(screen.getByRole("button", { name: "Ouvrir" }))
    expect(screen.getByRole("dialog")).toBeVisible()
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmer" })).toHaveFocus())
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole("button", { name: "Ouvrir" })).toHaveFocus())
  })
})
