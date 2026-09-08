import { afterEach, describe, expect, it, vi } from "vitest"
import { goToLanding, LANDING_HREF } from "@/shared/session"

describe("goToLanding", () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it("remplace l’URL courante par la racine publique", () => {
		const replace = vi.fn()
		vi.stubGlobal("location", { replace })
		expect(LANDING_HREF).toBe("/")
		goToLanding()
		expect(replace).toHaveBeenCalledWith("/")
	})
})
