import { vi } from 'vitest'

// The visualizer tests exercise their data and lifecycle seams, not browser
// rasterization. jsdom reports getContext as an error before returning null,
// so make that fallback explicit and quiet in every DOM test environment.
if (typeof HTMLCanvasElement !== 'undefined') {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => null),
  })
}
