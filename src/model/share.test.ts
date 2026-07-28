import { describe, expect, it } from 'vitest'
import {
  activePattern,
  createInitialProjectState,
  cycleActivePatternStep,
  PROJECT_STATE_VERSION,
  setBassParamValue,
  setTransportBpm,
  resizeActivePatternNote,
  toggleActivePatternNoteStep,
  toggleLaneMute,
  transposeActivePatternNote,
} from './projectState'
import {
  createShareUrl,
  PRACTICAL_SHARE_URL_LIMIT,
  projectWithSharedBeat,
  readSharedBeat,
} from './share'
import type { DrumLaneId, NoteLaneId } from './types'

describe('share URL', () => {
  it('reproduces the active pattern and every setting that affects how it sounds', async () => {
    const source = toggleLaneMute(
      setBassParamValue(
        setTransportBpm(
          toggleActivePatternNoteStep(
            cycleActivePatternStep(createInitialProjectState(), 'kick', 4),
            'stab',
            7,
          ),
          142,
        ),
        'cutoff',
        3200,
      ),
      'openHat',
    )

    const url = await createShareUrl(source, 'https://elevated-bpm.example/deck?ref=friend')
    const shared = await readSharedBeat(url)

    expect(shared).toEqual({
      status: 'ready',
      project: {
        version: PROJECT_STATE_VERSION,
        patterns: [activePattern(source)],
        activePatternId: source.activePatternId,
        transport: source.transport,
        instrumentSettings: source.instrumentSettings,
        lessonProgress: {},
        prefs: {},
        mixer: source.mixer,
        activeLessonId: null,
      },
    })
  })

  it('keeps a densely programmed beat within the practical 2,000-character URL limit', async () => {
    let source = createInitialProjectState()
    const drumLanes: DrumLaneId[] = ['kick', 'snare', 'closedHat', 'openHat', 'perc']
    const noteLanes: NoteLaneId[] = ['bass', 'stab']

    for (const lane of drumLanes) {
      for (let step = 0; step < 16; step += 1) {
        source = cycleActivePatternStep(source, lane, step)
        if ((step + drumLanes.indexOf(lane)) % 2 === 0) {
          source = cycleActivePatternStep(source, lane, step)
        }
      }
    }
    for (const lane of noteLanes) {
      for (let step = 0; step < 16; step += 1) {
        source = toggleActivePatternNoteStep(source, lane, step)
        source = transposeActivePatternNote(source, lane, step, (step % 12) - 5)
        source = resizeActivePatternNote(source, lane, step, step % 4)
      }
    }

    const url = await createShareUrl(source, 'https://elevated-bpm.example/')

    expect(url.length).toBeLessThanOrEqual(PRACTICAL_SHARE_URL_LIMIT)
  })

  it('reports older and newer payload versions without trying to open them', async () => {
    for (const version of [0, 999]) {
      await expect(
        readSharedBeat(`https://elevated-bpm.example/?p=${version}.not-used`),
      ).resolves.toEqual({
        status: 'error',
        code: 'unsupported-version',
        message:
          'This shared beat uses an incompatible version of Elevated BPM and cannot be opened here.',
      })
    }
  })

  it('turns a damaged payload into a clear, non-destructive error', async () => {
    await expect(
      readSharedBeat(
        `https://elevated-bpm.example/?p=${PROJECT_STATE_VERSION}.not-a-compressed-beat`,
      ),
    ).resolves.toEqual({
      status: 'error',
      code: 'malformed',
      message: 'This shared beat link is damaged or incomplete. Your saved project is safe.',
    })
  })

  it('rejects compressed JSON that is not a complete playable beat', async () => {
    const invalid = createInitialProjectState()
    invalid.patterns = [{ id: 'pattern-1', name: 'Broken', lanes: [], noteLanes: [] }]
    const url = await createShareUrl(invalid, 'https://elevated-bpm.example/')

    await expect(readSharedBeat(url)).resolves.toMatchObject({
      status: 'error',
      code: 'malformed',
    })
  })

  it('previews a shared beat without mutating recipient-only project state', async () => {
    const recipient = cycleActivePatternStep(createInitialProjectState(), 'kick', 2)
    recipient.lessonProgress = {
      'four-on-the-floor': { completed: true, dismissed: true },
    }
    recipient.prefs = { reducedFlashes: true }
    const ownPattern = activePattern(recipient)

    const sender = setBassParamValue(
      setTransportBpm(
        toggleActivePatternNoteStep(createInitialProjectState(), 'bass', 6),
        136,
      ),
      'resonance',
      14,
    )
    const senderPattern = activePattern(sender)
    senderPattern.name = 'Warehouse signal'
    const shared = await readSharedBeat(
      await createShareUrl(sender, 'https://elevated-bpm.example/'),
    )
    if (shared.status !== 'ready') throw new Error('Expected a playable shared beat')

    const preview = projectWithSharedBeat(recipient, shared.project)

    expect(activePattern(preview)).toEqual(senderPattern)
    expect(preview.transport).toEqual(sender.transport)
    expect(preview.instrumentSettings).toEqual(sender.instrumentSettings)
    expect(preview.lessonProgress).toBe(recipient.lessonProgress)
    expect(preview.prefs).toBe(recipient.prefs)
    expect(activePattern(recipient)).toBe(ownPattern)
    expect(ownPattern.lanes[0].steps[2].on).toBe(true)
  })
})
