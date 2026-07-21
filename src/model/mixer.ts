import type { DrumLaneId } from './types'

/**
 * Per-lane mixer state, kept in ProjectState alongside the pattern. Mute/solo
 * are deck-surface performance controls, not pattern content, so they live in
 * their own map rather than inside a Lane.
 */
export interface LaneMix {
  muted: boolean
  soloed: boolean
}

export type Mixer = Partial<Record<DrumLaneId, LaneMix>>

const SILENT: LaneMix = { muted: false, soloed: false }

function mixOf(mixer: Mixer, laneId: DrumLaneId): LaneMix {
  return mixer[laneId] ?? SILENT
}

/** True if any lane is soloed — solo mode suppresses every un-soloed lane. */
function anySoloed(mixer: Mixer): boolean {
  return Object.values(mixer).some((mix) => mix?.soloed)
}

/**
 * The lanes that should sound, filtered from `lanes` in order. Hardware rules:
 * with any solo engaged, only soloed lanes play (multiple solos allowed) and
 * solo overrides mute; otherwise every un-muted lane plays.
 */
export function audibleLaneIds(lanes: DrumLaneId[], mixer: Mixer): DrumLaneId[] {
  const soloing = anySoloed(mixer)
  return lanes.filter((laneId) => {
    const mix = mixOf(mixer, laneId)
    return soloing ? mix.soloed : !mix.muted
  })
}
