import { STEP_COUNT, type DrumLaneId, type DrumStep, type Pattern } from './types'

function emptySteps(): DrumStep[] {
  return Array.from({ length: STEP_COUNT }, () => ({ on: false, accent: false }))
}

/** The Phase 1 tracer pattern: a single empty kick lane. */
export function createInitialPattern(): Pattern {
  return {
    id: 'pattern-1',
    name: 'Pattern 1',
    lanes: [{ id: 'kick', label: 'Kick', steps: emptySteps() }],
  }
}

/** Immutably toggle one step of one lane. */
export function toggleStep(pattern: Pattern, laneId: DrumLaneId, stepIndex: number): Pattern {
  return {
    ...pattern,
    lanes: pattern.lanes.map((lane) =>
      lane.id === laneId
        ? {
            ...lane,
            steps: lane.steps.map((step, i) =>
              i === stepIndex ? { ...step, on: !step.on } : step,
            ),
          }
        : lane,
    ),
  }
}
