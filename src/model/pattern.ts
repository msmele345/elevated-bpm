import { createNoteLanes } from './note'
import { isPadLaneId, PAD_LANES } from './sampler'
import {
  STEP_COUNT,
  type DrumLaneId,
  type DrumStep,
  type LaneId,
  type PadLane,
  type Pattern,
  type StepLane,
} from './types'

function emptySteps(): DrumStep[] {
  return Array.from({ length: STEP_COUNT }, () => ({ on: false, accent: false }))
}

/**
 * The kit's lanes, in deck order. This list is the authority on which lanes a
 * pattern has — the kit definition (audio/kit.ts) and the document migration
 * both derive from it, so adding a lane is a one-line change here.
 */
export const KIT_LANES: ReadonlyArray<{ id: DrumLaneId; label: string }> = [
  { id: 'kick', label: 'Kick' },
  { id: 'snare', label: 'Clap' },
  { id: 'closedHat', label: 'Closed Hat' },
  { id: 'openHat', label: 'Open Hat' },
  { id: 'perc', label: 'Perc' },
]

/** An empty pattern with the full kit and note lanes: every lane, all steps off. */
export function createInitialPattern(): Pattern {
  return {
    id: 'pattern-1',
    name: 'Pattern 1',
    lanes: KIT_LANES.map(({ id, label }) => ({ id, label, steps: emptySteps() })),
    padLanes: PAD_LANES.map(({ id, label }) => ({ id, label, steps: emptySteps() })),
    noteLanes: createNoteLanes(),
  }
}

/**
 * The starter groove a first-time deck opens with, as step indexes per lane;
 * `accent` steps hit at accent velocity. It grooves on the first press of
 * play, but every place the curriculum teaches is deliberately left open: no
 * kick at all, a half-time clap answering only on beat 4, and offbeat hats
 * that stop a step short. Each arc lesson is the missing piece, and finishing
 * the arc is what completes this groove.
 *
 * The rule this pattern lives by: on a lane a lesson asserts, the demo may
 * only place steps that lesson also wants, so every lesson is something to add
 * rather than something to undo (guarded in lessons/lessons.test.ts). That
 * leaves the perc as the one lane free to be busy — no lesson asks for it — so
 * it carries the syncopation, all of it between the beats, with the hit after
 * the clap answering the backbeat the arc has yet to build.
 *
 * The closed hat also stops short of step 14 so the open hat there rings out
 * instead of being choked (see CHOKES in audio/hits.ts) — until the offbeat
 * hats lesson fills that step in, which is exactly what the open hat lesson
 * then teaches the user to hear and fix. That move is the one deliberate
 * exception to the rule above.
 */
const DEMO_GROOVE: Partial<Record<DrumLaneId, { on: number[]; accent?: number[] }>> = {
  snare: { on: [12], accent: [12] },
  closedHat: { on: [2, 6, 10] },
  openHat: { on: [14], accent: [14] },
  perc: { on: [3, 5, 11, 13], accent: [5, 11] },
}

/** The pattern a fresh project starts from: playable techno on first press. */
export function createDemoPattern(): Pattern {
  return {
    ...createInitialPattern(),
    lanes: KIT_LANES.map(({ id, label }) => {
      const groove = DEMO_GROOVE[id]
      return {
        id,
        label,
        steps: Array.from({ length: STEP_COUNT }, (_, i) => ({
          on: groove?.on.includes(i) ?? false,
          accent: groove?.accent?.includes(i) ?? false,
        })),
      }
    }),
  }
}

/**
 * Return the pattern with every kit lane present, in deck order. Lanes the
 * pattern already has keep their programmed steps; missing ones arrive empty.
 * This is what lets a document saved before a lane existed load intact.
 */
export function withFullKit(pattern: Pattern): Pattern {
  return {
    ...pattern,
    lanes: KIT_LANES.map(
      ({ id, label }) =>
        pattern.lanes.find((lane) => lane.id === id) ?? { id, label, steps: emptySteps() },
    ),
  }
}

/** Return the pattern with all four sampler lanes present, preserving existing programming. */
export function withPadLanes(pattern: Pattern): Pattern {
  const saved = (pattern as Partial<Pattern>).padLanes ?? []
  return {
    ...pattern,
    padLanes: PAD_LANES.map(
      ({ id, label }) =>
        saved.find((lane: PadLane) => lane.id === id) ?? { id, label, steps: emptySteps() },
    ),
  }
}

/** Immutably replace one step of one lane, leaving other lanes by reference. */
function mapLaneStep<Id extends LaneId>(
  lanes: StepLane<Id>[],
  laneId: Id,
  stepIndex: number,
  next: (step: DrumStep) => DrumStep,
): StepLane<Id>[] {
  return lanes.map((lane) =>
    lane.id === laneId
      ? {
          ...lane,
          steps: lane.steps.map((step, i) => (i === stepIndex ? next(step) : step)),
        }
      : lane,
  )
}

function mapStep(
  pattern: Pattern,
  laneId: LaneId,
  stepIndex: number,
  next: (step: DrumStep) => DrumStep,
): Pattern {
  if (isPadLaneId(laneId)) {
    return {
      ...pattern,
      padLanes: mapLaneStep(pattern.padLanes, laneId, stepIndex, next),
    }
  }
  return {
    ...pattern,
    lanes: mapLaneStep(pattern.lanes, laneId, stepIndex, next),
  }
}

/** Immutably toggle one step of one lane on/off, clearing accent when off. */
export function toggleStep(pattern: Pattern, laneId: LaneId, stepIndex: number): Pattern {
  return mapStep(pattern, laneId, stepIndex, (step) => ({ ...step, on: !step.on }))
}

/**
 * Advance one step through the deck's three states: off → on → on+accent →
 * off. A single click is the whole accent interface, so there is no hidden
 * modifier and no second row of controls.
 */
export function cycleStep(pattern: Pattern, laneId: LaneId, stepIndex: number): Pattern {
  return mapStep(pattern, laneId, stepIndex, (step) => {
    if (!step.on) return { on: true, accent: false }
    if (!step.accent) return { on: true, accent: true }
    return { on: false, accent: false }
  })
}
