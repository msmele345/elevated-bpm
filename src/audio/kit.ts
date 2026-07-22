import type { DrumLaneId } from '../model/types'

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
