import { memo, useEffect, useRef } from 'react'
import * as engine from '../audio/engine'
import {
  barBinRanges,
  barLevels,
  decayLevels,
  SCOPE_CEIL_DB,
  SCOPE_FALL_PER_FRAME,
  SCOPE_FLOOR_DB,
  SCOPE_SPEC,
} from '../model/scope'

/** LED segments per bar — the ladder resolution of the display. */
const SEGMENTS = 14
/** Unlit segments still print faintly, like a powered-off LED ladder. */
const UNLIT_ALPHA = 0.16

/**
 * The master spectrum scope: 16 log-spaced bars — one per step, wearing the
 * step grid's quad colors — drawn as an LED segment ladder on canvas (per the
 * rendering split: canvas is for real-time visualizers only). The draw loop
 * runs on requestAnimationFrame reading the engine's analyser directly, never
 * React state, so it can hold 60fps without a single re-render; frames where
 * no segment changes skip the repaint entirely.
 */
function Scope() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    // jsdom (and very old browsers) have no 2d context; the scope is
    // decorative, so it simply stays dark there.
    let ctx: CanvasRenderingContext2D | null = null
    try {
      ctx = canvas?.getContext('2d') ?? null
    } catch {
      ctx = null
    }
    if (!canvas || !ctx) return

    // The quad palette is the single source of color truth in CSS; resolve it
    // once so the canvas can never drift from the step buttons above it.
    const styles = getComputedStyle(canvas)
    const quadColors = [0, 1, 2, 3].map((quad) =>
      styles.getPropertyValue(`--quad-${quad}`).trim(),
    )

    const ranges = barBinRanges(SCOPE_SPEC)
    let levels = new Array<number>(SCOPE_SPEC.barCount).fill(0)
    let litSignature = ''
    let width = 0
    let height = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      litSignature = '' // force a repaint at the new size
    }

    const draw = (lit: number[]) => {
      ctx.clearRect(0, 0, width, height)
      const barGap = width / SCOPE_SPEC.barCount
      const barWidth = Math.max(2, barGap * 0.55)
      const segGap = height / SEGMENTS
      const segHeight = Math.max(1, segGap * 0.62)
      for (let bar = 0; bar < SCOPE_SPEC.barCount; bar += 1) {
        const x = bar * barGap + (barGap - barWidth) / 2
        ctx.fillStyle = quadColors[Math.floor(bar / 4)]
        for (let seg = 0; seg < SEGMENTS; seg += 1) {
          const y = height - (seg + 1) * segGap + (segGap - segHeight) / 2
          ctx.globalAlpha = seg < lit[bar] ? 1 : UNLIT_ALPHA
          ctx.fillRect(x, y, barWidth, segHeight)
        }
      }
      ctx.globalAlpha = 1
    }

    // Reduced motion: no animation loop at all — one static unlit ladder, the
    // same treatment the club room gets (a still composition, not a dead hole).
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      resize()
      draw(new Array<number>(SCOPE_SPEC.barCount).fill(0))
      return
    }

    let rafId = 0
    const tick = () => {
      const fft = engine.getSpectrum()
      const target = fft
        ? barLevels(fft, ranges, SCOPE_FLOOR_DB, SCOPE_CEIL_DB)
        : new Array<number>(SCOPE_SPEC.barCount).fill(0)
      levels = decayLevels(levels, target, SCOPE_FALL_PER_FRAME)
      const lit = levels.map((level) => Math.round(level * SEGMENTS))
      const signature = lit.join(',')
      if (signature !== litSignature) {
        draw(lit)
        litSignature = signature
      }
      rafId = requestAnimationFrame(tick)
    }

    resize()
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(canvas)
    rafId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafId)
      observer?.disconnect()
    }
  }, [])

  return (
    <div className="scope" aria-hidden="true">
      <canvas ref={canvasRef} className="scope-canvas" />
      <span className="scope-label">Main Out</span>
    </div>
  )
}

/** Propless, so this renders once and then only its own rAF loop touches it. */
export const SpectrumScope = memo(Scope)
