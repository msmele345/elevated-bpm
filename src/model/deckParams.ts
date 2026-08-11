import { BASS_PARAMS, type BassParamId } from './bass'
import { FX_PARAMS, type FxParamId } from './fx'
import type { ParamSpec } from './knob'
import { MASTER_PARAMS, type MasterParamId } from './master'
import { SAMPLER_PARAMS, type SamplerParamId } from './sampler'

/**
 * Every knob on the deck, in one place.
 *
 * Sound-design goals name a knob, and until this existed they could only name a
 * *bass* knob — the master macros and now the FX controls were unreachable from
 * a lesson even though `observeParamMotion` records them all the same way. One
 * registry means a `paramSwept` goal can point at any knob the deck has, and a
 * mistyped one still fails loudly when the lesson is parsed.
 *
 * Instruments own their own specs; this only gathers them, so adding a knob
 * anywhere makes it lesson-addressable without touching the curriculum code.
 */

export type DeckParamId = BassParamId | MasterParamId | FxParamId | SamplerParamId

export const DECK_PARAMS: ReadonlyArray<ParamSpec & { id: DeckParamId }> = [
  ...BASS_PARAMS,
  ...MASTER_PARAMS,
  ...FX_PARAMS,
  ...SAMPLER_PARAMS,
]

/**
 * The ids as a set, for lookups and — asserted by the suite — as the proof that
 * no two knobs share one. Motion is recorded against a bare id, so a collision
 * would let one knob's sweep satisfy a goal about another.
 */
export const DECK_PARAM_IDS: ReadonlySet<string> = new Set(DECK_PARAMS.map((p) => p.id))

export function isDeckParamId(value: unknown): value is DeckParamId {
  return typeof value === 'string' && DECK_PARAM_IDS.has(value)
}

/**
 * The spec behind one knob anywhere on the deck. A knob the deck is known to
 * have always resolves; an untrusted id — a hand-authored lesson, say — may not.
 */
export function deckParamSpec(id: DeckParamId): ParamSpec & { id: DeckParamId }
export function deckParamSpec(id: string): (ParamSpec & { id: DeckParamId }) | undefined
export function deckParamSpec(id: string): (ParamSpec & { id: DeckParamId }) | undefined {
  return DECK_PARAMS.find((param) => param.id === id)
}
