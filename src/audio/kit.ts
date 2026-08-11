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

/**
 * Where the one shipped sample *source* lives. Not a lane map: no pad is bound
 * to this file. It is decoded once into the sample registry under the curated
 * source's id, and a pad reaches it only by holding a region into that source —
 * the same way a pad will reach an uploaded one.
 */
export const CURATED_SAMPLE_URL = '/samples/perc-909.wav'
