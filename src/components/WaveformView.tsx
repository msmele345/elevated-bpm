import { memo, useEffect, useRef } from 'react'
import type { AnalysisAudio } from '../audio/engine'
import type { SampleRegion } from '../model/sampler'
import { waveformColumns, type WaveformColumn } from '../model/waveform'

interface WaveformViewProps {
  analysis: AnalysisAudio
  onsets: readonly number[]
  region: SampleRegion
}

/** Outside the region the shape is still drawn, just unlit — like a dark LED. */
const OUTSIDE_ALPHA = 0.22

/**
 * The shape of the source, with its detected hits marked and the current
 * region lit.
 *
 * Decorative to assistive technology: this canvas has no semantics at all, and
 * the two region handles carry every bit of the editor's meaning. That mirrors
 * how the knob's SVG is handled, and it is why onset detection matters — a
 * waveform describes audio the user can already hear.
 *
 * Drawn on requestAnimationFrame reading refs rather than from a React render,
 * so a dragged edge repaints at frame rate whatever React is doing; frames
 * where nothing has changed skip the repaint entirely, and reduced motion gets
 * one static render with no loop at all.
 */
function Waveform({ analysis, onsets, region }: WaveformViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // The draw loop reads the live region from here, never from a closure over
  // the prop, so it never needs the component to re-render to stay current.
  const regionRef = useRef(region)
  regionRef.current = region

  useEffect(() => {
    const canvas = canvasRef.current
    // jsdom (and very old browsers) have no 2d context; the waveform is
    // decorative, so it simply stays dark there.
    let ctx: CanvasRenderingContext2D | null = null
    try {
      ctx = canvas?.getContext('2d') ?? null
    } catch {
      ctx = null
    }
    if (!canvas || !ctx) return

    const styles = getComputedStyle(canvas)
    const lit = styles.getPropertyValue('--led').trim() || '#f0a04a'
    const onsetInk = styles.getPropertyValue('--focus').trim() || '#7fd4ff'

    let columns: WaveformColumn[] = []
    let width = 0
    let height = 0
    let signature = ''

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // The envelope is the expensive part and depends only on the width, so
      // it is rebuilt here rather than per frame.
      columns = waveformColumns(analysis.samples, Math.max(1, Math.round(width)))
      signature = ''
    }

    const draw = () => {
      const { start, duration } = regionRef.current
      const end = start + duration
      ctx.clearRect(0, 0, width, height)
      const middle = height / 2
      const perColumn = analysis.duration / Math.max(1, columns.length)

      for (let column = 0; column < columns.length; column += 1) {
        const time = column * perColumn
        const inside = time >= start && time <= end
        ctx.globalAlpha = inside ? 1 : OUTSIDE_ALPHA
        ctx.fillStyle = lit
        const top = middle - columns[column].max * middle
        const bottom = middle - columns[column].min * middle
        ctx.fillRect(column, top, 1, Math.max(1, bottom - top))
      }

      // Onsets last, so the structure reads on top of the shape.
      ctx.globalAlpha = 0.7
      ctx.fillStyle = onsetInk
      for (const onset of onsets) {
        const x = (onset / Math.max(analysis.duration, 1e-6)) * width
        ctx.fillRect(x, 0, 1, height * 0.16)
        ctx.fillRect(x, height * 0.84, 1, height * 0.16)
      }
      ctx.globalAlpha = 1
    }

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      resize()
      draw()
      return
    }

    let frame = 0
    const tick = () => {
      const { start, duration } = regionRef.current
      const next = `${width}:${start}:${duration}`
      if (next !== signature) {
        draw()
        signature = next
      }
      frame = requestAnimationFrame(tick)
    }

    resize()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(canvas)
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [analysis, onsets])

  return <canvas ref={canvasRef} className="region-waveform" aria-hidden="true" />
}

export const WaveformView = memo(Waveform)
