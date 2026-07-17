/** Pure step-index math shared by the rAF playhead — no Tone.js/DOM involved. */
export function stepIndexAtTicks(ticks: number, ticksPer16th: number, stepCount: number): number {
  return Math.floor(ticks / ticksPer16th) % stepCount
}
