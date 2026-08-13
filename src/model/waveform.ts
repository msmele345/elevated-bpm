/**
 * The shape of a source, reduced to what a display can draw: one min/max pair
 * per column. Pure math, so the drawing loop on the canvas is only a paint —
 * the same discipline the spectrum scope follows.
 *
 * The envelope keeps extremes rather than averages because a transient is
 * exactly what a user is looking for when they open a source, and an average
 * would smooth away the hits.
 */

export interface WaveformColumn {
  min: number
  max: number
}

/** Peak envelope of one channel over `columnCount` evenly spaced columns. */
export function waveformColumns(
  samples: ArrayLike<number>,
  columnCount: number,
): WaveformColumn[] {
  const columns: WaveformColumn[] = []
  const perColumn = samples.length / columnCount
  for (let column = 0; column < columnCount; column += 1) {
    const start = Math.floor(column * perColumn)
    const end = Math.min(samples.length, Math.max(start + 1, Math.floor((column + 1) * perColumn)))
    let min = 0
    let max = 0
    for (let i = start; i < end; i += 1) {
      if (samples[i] < min) min = samples[i]
      if (samples[i] > max) max = samples[i]
    }
    columns.push({ min, max })
  }
  return columns
}
