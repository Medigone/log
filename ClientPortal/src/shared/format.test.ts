import { documentStatusTone, formatDocumentStatus } from "@/shared/format"

describe("formatDocumentStatus", () => {
  it("translates ERPNext order statuses without billing language", () => {
    expect(formatDocumentStatus("Draft")).toBe("En attente de validation")
    expect(formatDocumentStatus("Brouillon")).toBe("En attente de validation")
    expect(formatDocumentStatus("To Deliver and Bill")).toBe("À livrer")
    expect(formatDocumentStatus("To Deliver")).toBe("À livrer")
    expect(formatDocumentStatus("To Bill")).toBe("Livré")
    expect(formatDocumentStatus("Completed")).toBe("Livré")
    expect(formatDocumentStatus("Cancelled")).toBe("Annulé")
    expect(formatDocumentStatus("Closed")).toBe("Clôturé")
    expect(formatDocumentStatus("On Hold")).toBe("En pause")
    expect(formatDocumentStatus("Partially Billed")).toBe("Livré")
    expect(formatDocumentStatus("Partly Delivered")).toBe("Partiellement livré")
    expect(formatDocumentStatus("Partially Delivered")).toBe("Partiellement livré")
    expect(formatDocumentStatus("Livraison en cours")).toBe("Livraison en cours")
  })

  it("keeps already French operational statuses", () => {
    expect(formatDocumentStatus("Livré")).toBe("Livré")
    expect(formatDocumentStatus("Préparé")).toBe("Préparé")
    expect(formatDocumentStatus("Validé")).toBe("Validé")
    expect(formatDocumentStatus("À contrôler")).toBe("À contrôler")
  })

  it("falls back for empty values", () => {
    expect(formatDocumentStatus(null)).toBe("—")
    expect(formatDocumentStatus("")).toBe("—")
  })
})

describe("documentStatusTone", () => {
  it("maps ERPNext and operational statuses to badge tones", () => {
    expect(documentStatusTone("Completed")).toBe("success")
    expect(documentStatusTone("Livré")).toBe("success")
    expect(documentStatusTone("To Bill")).toBe("success")
    expect(documentStatusTone("To Deliver and Bill")).toBe("info")
    expect(documentStatusTone("Préparé")).toBe("info")
    expect(documentStatusTone("Partially Delivered")).toBe("warning")
    expect(documentStatusTone("Partiellement Livré")).toBe("warning")
    expect(documentStatusTone("À contrôler")).toBe("warning")
    expect(documentStatusTone("Cancelled")).toBe("destructive")
    expect(documentStatusTone("Non Livré")).toBe("destructive")
    expect(documentStatusTone("Draft")).toBe("warning")
    expect(documentStatusTone("En attente de validation")).toBe("warning")
    expect(documentStatusTone("Livraison en cours")).toBe("info")
  })
})
