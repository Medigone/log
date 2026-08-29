import { render, screen } from "@testing-library/react"
import { StatusBadge } from "@/components/StatusBadge"

describe("StatusBadge", () => {
  it("renders a French label for an English document status", () => {
    render(<StatusBadge status="To Deliver and Bill" />)
    expect(screen.getByText("À livrer")).toHaveAttribute("data-tone", "info")
  })

  it("colors operational statuses by meaning", () => {
    const { rerender } = render(<StatusBadge status="Livré" />)
    expect(screen.getByText("Livré")).toHaveAttribute("data-tone", "success")

    rerender(<StatusBadge status="Préparé" />)
    expect(screen.getByText("Préparé")).toHaveAttribute("data-tone", "info")

    rerender(<StatusBadge status="Non Livré" />)
    expect(screen.getByText("Non Livré")).toHaveAttribute("data-tone", "destructive")

    rerender(<StatusBadge status="À contrôler" />)
    expect(screen.getByText("À contrôler")).toHaveAttribute("data-tone", "warning")

    rerender(<StatusBadge status="Draft" />)
    expect(screen.getByText("En attente de validation")).toHaveAttribute("data-tone", "warning")
  })
})
