import { dbToGain, type ParamSpec } from './knob'
import { NOTE_LANES } from './note'
import { KIT_LANES } from './pattern'
import { PAD_LANES } from './sampler'
import type { LaneId, NoteLaneId } from './types'

/**
 * A voice is anything on the Deck with its own mixer channel: the five drum
 * lanes, the four pad lanes, the bass and the stab. One rule — mute, solo and
 * Level — covers all eleven, sequenced and live sound alike.
 */
export type VoiceId = LaneId | NoteLaneId

/** Every voice in deck order, with the name its panel wears. */
export const VOICES: ReadonlyArray<{ id: VoiceId; label: string }> = [
  ...KIT_LANES,
  ...PAD_LANES.map(({ id, label }) => ({ id, label })),
  ...NOTE_LANES.map(({ id, label }) => ({ id, label })),
]

/**
 * One voice's mixer strip, kept in ProjectState alongside the pattern. Mute,
 * solo and Level are deck-surface performance controls, not pattern content, so
 * they live in their own map rather than inside a Lane.
 */
export interface VoiceMix {
  muted: boolean
  soloed: boolean
  /** Channel gain, linear: 0 is silence, 1 unity, `MAX_LEVEL` is +6 dB. */
  level: number
}

/**
 * Voice id → strip. A missing entry, or a missing field on one, reads as
 * unity, unmuted and unsoloed — the deck's resting sound.
 */
export type Mixer = Partial<Record<VoiceId, VoiceMix>>

/** +6 dB: the headroom a Level knob gives above unity. */
export const MAX_LEVEL = dbToGain(6)
export const DEFAULT_LEVEL = 1

export const UNITY_MIX: VoiceMix = { muted: false, soloed: false, level: DEFAULT_LEVEL }

/**
 * One voice's strip with every field filled in. Documents and links are
 * validated, but a strip written before Level existed is still a strip, so a
 * field it lacks reads as its resting value rather than as undefined.
 */
export function voiceMix(mixer: Mixer, voiceId: VoiceId): VoiceMix {
  return { ...UNITY_MIX, ...mixer[voiceId] }
}

/** A voice's channel gain. */
export function voiceLevel(mixer: Mixer, voiceId: VoiceId): number {
  return voiceMix(mixer, voiceId).level
}

/** True if any voice is soloed — solo mode suppresses every un-soloed voice. */
export function anySoloed(mixer: Mixer): boolean {
  return Object.values(mixer).some((mix) => mix?.soloed)
}

/**
 * The hardware rule for one strip, given whether anything on the deck is
 * soloed: with any solo engaged, only soloed voices play (multiple solos
 * allowed) and solo overrides mute; otherwise every un-muted voice plays.
 * Taking `soloing` rather than the whole mixer lets a panel that holds only
 * its own strips still apply the deck-wide rule.
 */
export function mixIsAudible(mix: Partial<VoiceMix> | undefined, soloing: boolean): boolean {
  const { muted, soloed } = { ...UNITY_MIX, ...mix }
  return soloing ? soloed : !muted
}

/** The voices that should sound, filtered from `voices` in order. */
export function audibleVoiceIds<Id extends VoiceId>(voices: Id[], mixer: Mixer): Id[] {
  const soloing = anySoloed(mixer)
  return voices.filter((voiceId) => mixIsAudible(mixer[voiceId], soloing))
}

/** Apply the one global mute/solo rule to a live voice before it reaches audio. */
export function voiceIsAudible(voiceId: VoiceId, mixer: Mixer): boolean {
  return audibleVoiceIds([voiceId], mixer).length === 1
}

/**
 * The Level knobs, one per voice. Each is a registered deck param with a
 * unique id, so a lesson can spotlight `knob:kickLevel` or ask for a sweep of
 * it in JSON alone; the value itself lives in the mixer, not in a patch.
 */
export type LevelParamId = `${VoiceId}Level`

export const LEVEL_PARAMS: ReadonlyArray<ParamSpec & { id: LevelParamId; voiceId: VoiceId }> =
  VOICES.map((voice) => ({
    id: `${voice.id}Level` as LevelParamId,
    voiceId: voice.id,
    label: `${voice.label} Level`,
    min: 0,
    max: MAX_LEVEL,
    default: DEFAULT_LEVEL,
    unit: 'dB',
    taper: 'fader',
  }))

/** The Level knob of one voice. */
export function levelParamForVoice(voiceId: VoiceId): (typeof LEVEL_PARAMS)[number] {
  return LEVEL_PARAMS.find((param) => param.voiceId === voiceId)!
}

/** The voice a Level knob turns. */
export function voiceOfLevelParam(id: LevelParamId): VoiceId {
  return LEVEL_PARAMS.find((param) => param.id === id)!.voiceId
}
