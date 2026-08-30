import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

class PointerEventPolyfill extends MouseEvent {
  constructor(type: string, init?: PointerEventInit) {
    super(type, init);
  }
}

Object.defineProperty(window, "PointerEvent", {
  writable: true,
  configurable: true,
  value: PointerEventPolyfill,
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});
