import { calendarDay, documentStatusTone, formatCampaignUntil, formatDocumentStatus, formatRelativeDateTime, todayIso } from "@/shared/format"

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

describe("formatCampaignUntil", () => {
  it("forme une date limite en français", () => {
    expect(formatCampaignUntil("2026-09-01", new Date("2026-08-31T12:00:00"))).toBe("Jusqu’au 1er septembre")
    expect(formatCampaignUntil("2026-09-15T23:59:59", new Date("2026-08-31T12:00:00"))).toBe("Jusqu’au 15 septembre")
    expect(formatCampaignUntil("2026-09-01", new Date("2027-01-01T12:00:00"))).toBe("Jusqu’au 1er septembre 2026")
    expect(formatCampaignUntil(null)).toBeNull()
  })
})

describe("formatRelativeDateTime", () => {
  const now = new Date("2026-08-31T16:00:00")

  it("exprime un délai court en français", () => {
    expect(formatRelativeDateTime("2026-08-31 15:59:30", now)).toBe("à l’instant")
    expect(formatRelativeDateTime("2026-08-31 15:10:00", now)).toBe("il y a 50 min")
    expect(formatRelativeDateTime("2026-08-31 14:00:00", now)).toBe("il y a 2 h")
    expect(formatRelativeDateTime("2026-08-30 16:00:00", now)).toBe("hier")
  })

  it("falls back for empty values", () => {
    expect(formatRelativeDateTime(null)).toBe("—")
    expect(formatRelativeDateTime("")).toBe("—")
  })
})

describe("calendarDay", () => {
  it("keeps an ISO calendar date", () => {
    expect(calendarDay("2026-09-06")).toBe("2026-09-06")
    expect(calendarDay("2026-09-06T00:00:00.000Z")).toBe("2026-09-06")
  })

  it("falls back to the local calendar day", () => {
    expect(calendarDay(null)).toBe(todayIso())
    expect(calendarDay("06/09/2026")).toBe(todayIso())
  })
})
