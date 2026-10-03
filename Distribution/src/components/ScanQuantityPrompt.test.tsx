import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScanQuantityPrompt } from "@/components/ScanQuantityPrompt";

describe("ScanQuantityPrompt", () => {
  it("propose le pas du code-barres, valide sur Entrée et refuse une quantité nulle", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ScanQuantityPrompt title="Lait" defaultQty={12} unit="N°" onConfirm={onConfirm} onCancel={vi.fn()} />);

    const qty = screen.getByLabelText("Quantité");
    expect(qty).toHaveValue("12");
    expect(qty).toHaveFocus();
    expect(screen.queryByLabelText("Numéro de lot")).not.toBeInTheDocument();

    await user.clear(qty);
    await user.type(qty, "0");
    expect(screen.getByRole("button", { name: "Ajouter" })).toBeDisabled();

    await user.clear(qty);
    await user.type(qty, "3,5{Enter}");
    expect(onConfirm).toHaveBeenCalledWith({ qty: 3.5, batchNo: undefined, expiryDate: undefined });
  });

  it("annule sans rien ajouter", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ScanQuantityPrompt title="Lait" defaultQty={1} askBatch onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByLabelText("Numéro de lot")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
