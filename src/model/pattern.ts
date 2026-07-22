import { createNoteLanes } from './note'
import { STEP_COUNT, type DrumLaneId, type DrumStep, type Pattern } from './types'

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

/** An empty pattern with the full kit and bass lane: every lane, all steps off. */
export function createInitialPattern(): Pattern {
  return {
    id: 'pattern-1',
    name: 'Pattern 1',
    lanes: KIT_LANES.map(({ id, label }) => ({ id, label, steps: emptySteps() })),
    noteLanes: createNoteLanes(),
  }
}

/**
 * The starter groove a first-time deck opens with, as step indexes per lane;
 * `accent` steps hit at accent velocity. Deliberately kick-less: the clap,
 * hats and perc already sound like techno on the first press of play, and
 * dropping the kick in is the four-on-the-floor lesson's payoff.
 *
 * The closed hat stops short of step 14 so the open hat there rings out
 * instead of being choked (see CHOKES in audio/hits.ts).
 */
const DEMO_GROOVE: Partial<Record<DrumLaneId, { on: number[]; accent?: number[] }>> = {
  snare: { on: [4, 12], accent: [4, 12] },
  closedHat: { on: [2, 6, 10] },
  openHat: { on: [14], accent: [14] },
  perc: { on: [5, 11] },
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

/** Immutably replace one step of one lane, leaving other lanes by reference. */
function mapStep(
  pattern: Pattern,
  laneId: DrumLaneId,
  stepIndex: number,
  next: (step: DrumStep) => DrumStep,
): Pattern {
  return {
    ...pattern,
    lanes: pattern.lanes.map((lane) =>
      lane.id === laneId
        ? {
            ...lane,
            steps: lane.steps.map((step, i) => (i === stepIndex ? next(step) : step)),
          }
        : lane,
    ),
  }
}

/** Immutably toggle one step of one lane on/off, clearing accent when off. */
export function toggleStep(pattern: Pattern, laneId: DrumLaneId, stepIndex: number): Pattern {
  return mapStep(pattern, laneId, stepIndex, (step) => ({ ...step, on: !step.on }))
}

/**
 * Advance one step through the deck's three states: off → on → on+accent →
 * off. A single click is the whole accent interface, so there is no hidden
 * modifier and no second row of controls.
 */
export function cycleStep(pattern: Pattern, laneId: DrumLaneId, stepIndex: number): Pattern {
  return mapStep(pattern, laneId, stepIndex, (step) => {
    if (!step.on) return { on: true, accent: false }
    if (!step.accent) return { on: true, accent: true }
    return { on: false, accent: false }
  })
}
