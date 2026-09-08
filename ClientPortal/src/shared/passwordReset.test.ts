import { describe, expect, it } from "vitest"
import { passwordResetFeedback } from "@/shared/api"

describe("passwordResetFeedback", () => {
  it("confirme l’envoi quand Frappe accepte la demande", () => {
    expect(passwordResetFeedback(null)).toEqual({
      ok: true,
      message: "Les instructions de réinitialisation ont été envoyées à votre adresse e-mail.",
    })
  })

  it("traduit les codes Frappe", () => {
    expect(passwordResetFeedback("not found").message).toBe("Aucun compte ne correspond à cet identifiant.")
    expect(passwordResetFeedback("disabled").message).toBe("Ce compte est désactivé.")
    expect(passwordResetFeedback("not allowed").message).toBe("Cette action n’est pas autorisée.")
  })

  it("traduit une 404 levée par le SDK", () => {
    expect(passwordResetFeedback(undefined, { httpStatusText: "not found" }).ok).toBe(false)
    expect(passwordResetFeedback(undefined, { message: "404" }).message).toBe(
      "Aucun compte ne correspond à cet identifiant.",
    )
  })
})
