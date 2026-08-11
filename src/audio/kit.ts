import type { DrumLaneId, PadLaneId } from '../model/types'

/**
 * The default kit: which synthesized 909-style sample each lane plays. Sample
 * URLs are static assets under public/samples (regenerate with
 * scripts/generate-kit.mjs). Keeping this map here lets the engine load and
 * fire lanes generically instead of hard-coding a kick.
 */
export const KIT_SAMPLES: Record<DrumLaneId, string> = {
  kick: '/samples/kick-909.wav',
  snare: '/samples/clap-909.wav',
  closedHat: '/samples/hat-closed-909.wav',
  openHat: '/samples/hat-open-909.wav',
  perc: '/samples/perc-909.wav',
}

/**
 * The tracer's four voices all point at the one curated shipped source. Tone's
 * buffer cache prevents four network reads; one Player per pad preserves the
 * hardware rule that pads choke themselves but never each other.
 */
export const PAD_SAMPLES: Record<PadLaneId, string> = {
  pad1: '/samples/perc-909.wav',
  pad2: '/samples/perc-909.wav',
  pad3: '/samples/perc-909.wav',
  pad4: '/samples/perc-909.wav',
}
