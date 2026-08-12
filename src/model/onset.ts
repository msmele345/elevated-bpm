/**
 * Onset detection: where the hits are inside a decoded source.
 *
 * This is accessibility work rather than a nicety. Every other visual
 * affordance on the deck describes something with a non-visual equivalent — a
 * knob has a value, a step has a state — but a waveform describes audio the
 * user can already hear. Onsets are what make the editor navigable by
 * *structure*: they are what a region edge announces its position among, and
 * what the bracket keys jump between.
 *
 * Pure math over samples, so it sits in the model beside the spectrum and
 * room-light math and is tested without a browser or a real decoder.
 */

/** Analysis frame spacing. 5 ms is finer than the ear's ~10 ms hit resolution. */
const HOP_SECONDS = 0.005

/** Silence floor, so a log ratio over near-zero energy cannot explode. */
const ENERGY_FLOOR = 1e-6

/**
 * How close two hits may be and still be two hits. One attack takes several
 * frames to reach its peak, so without this a single hit reports as a little
 * cluster — and a cluster is worse than useless to someone navigating by
 * onset count. 30 ms is faster than any drum roll a learner will chop.
 */
const MIN_SPACING_SECONDS = 0.03

/**
 * One frame's loudness. RMS over a hop is enough — the detector reads the
 * *rise* between frames rather than any absolute level, which is what keeps
 * it indifferent to how loud the source was mastered.
 */
function frameEnergies(
  samples: ArrayLike<number>,
  hopSize: number,
  frameCount: number,
): Float32Array {
  const energies = new Float32Array(frameCount)
  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * hopSize
    const end = Math.min(samples.length, start + hopSize)
    let sum = 0
    for (let i = start; i < end; i += 1) sum += samples[i] * samples[i]
    energies[frame] = Math.sqrt(sum / Math.max(1, end - start))
  }
  return energies
}

/**
 * Detected hit times in seconds, ascending. `samples` is one channel of the
 * analysis decode — mono, reduced rate — and `sampleRate` is that buffer's own
 * rate, so the times returned are real source times whatever rate it was
 * decoded at.
 */
export function detectOnsets(samples: ArrayLike<number>, sampleRate: number): number[] {
  const hopSize = Math.max(1, Math.round(sampleRate * HOP_SECONDS))
  const frameCount = Math.floor(samples.length / hopSize)
  if (frameCount < 2) return []

  const energies = frameEnergies(samples, hopSize, frameCount)
  const onsets: number[] = []
  let previousOnset = -Infinity
  for (let frame = 0; frame < frameCount; frame += 1) {
    // Before the buffer there is silence. A source that has already been
    // trimmed opens *on* its attack, and skipping frame 0 would report that it
    // has no structure at all.
    const before = frame === 0 ? 0 : energies[frame - 1]
    // A log ratio, so a hit is "six times louder than the moment before it"
    // rather than "louder than some absolute number".
    const rise = Math.log(energies[frame] + ENERGY_FLOOR) - Math.log(before + ENERGY_FLOOR)
    if (rise <= 1) continue
    const time = (frame * hopSize) / sampleRate
    // The first frame of the rise is the attack; the ones behind it are the
    // same hit still getting louder.
    if (time - previousOnset < MIN_SPACING_SECONDS) continue
    onsets.push(time)
    previousOnset = time
  }
  return onsets
}
