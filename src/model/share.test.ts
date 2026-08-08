import { describe, expect, it } from 'vitest'
import {
  activePattern,
  createInitialProjectState,
  cycleActivePatternStep,
  PROJECT_STATE_VERSION,
  setBassParamValue,
  setMasterParamValue,
  setTransportBpm,
  resizeActivePatternNote,
  toggleActivePatternNoteStep,
  toggleLaneMute,
  transposeActivePatternNote,
  type ProjectState,
} from './projectState'
import { DEFAULT_MASTER_SETTINGS } from './master'
import { createInitialPattern, cycleStep } from './pattern'
import {
  createShareUrl,
  PRACTICAL_SHARE_URL_LIMIT,
  projectWithSharedBeat,
  readSharedBeat,
  SHARE_QUERY_PARAM,
} from './share'
import type { DrumLaneId, NoteLaneId } from './types'

/**
 * Encode a payload the way an older build did, rather than through the current
 * writer — the point of these cases is a link this codebase did not produce, so
 * the wire format is spelled out here instead of tracking whatever share.ts does.
 */
async function legacyShareUrl(version: number, document: unknown): Promise<string> {
  const stream = new CompressionStream('gzip')
  const compressed = new Response(stream.readable).arrayBuffer()
  const writer = stream.writable.getWriter()
  await writer.write(new TextEncoder().encode(JSON.stringify(document)))
  await writer.close()

  let binary = ''
  for (const byte of new Uint8Array(await compressed)) binary += String.fromCharCode(byte)
  const encoded = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  return `https://elevated-bpm.example/?p=${version}.${encoded}`
}

/** The document a v6 build (before the master-bus macros) would have shared. */
function v6ShareDocument(
  source: ProjectState,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: 6,
    patterns: [activePattern(source)],
    activePatternId: source.activePatternId,
    transport: source.transport,
    instrumentSettings: { bass: source.instrumentSettings.bass },
    lessonProgress: {},
    prefs: {},
    mixer: source.mixer,
    activeLessonId: null,
    ...overrides,
  }
}

describe('share URL', () => {
  it('reproduces the active pattern and every setting that affects how it sounds', async () => {
    const source = setMasterParamValue(
      toggleLaneMute(
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
      ),
      'drive',
      45,
    )

    const url = await createShareUrl(source, 'https://elevated-bpm.example/deck?ref=friend')
    const shared = await readSharedBeat(url)

    // Outgoing links are always stamped current; only the reader is tolerant,
    // so nothing else here would notice the writer drifting to a stale prefix.
    expect(new URL(url).searchParams.get(SHARE_QUERY_PARAM)).toMatch(
      new RegExp(`^${PROJECT_STATE_VERSION}\\.`),
    )
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

  it('opens a link written by an older schema version with its beat, tempo and patch intact', async () => {
    const sender = setBassParamValue(
      setTransportBpm(
        toggleActivePatternNoteStep(
          cycleActivePatternStep(createInitialProjectState(), 'kick', 8),
          'bass',
          3,
        ),
        132,
      ),
      'cutoff',
      2400,
    )

    const shared = await readSharedBeat(await legacyShareUrl(6, v6ShareDocument(sender)))

    if (shared.status !== 'ready') {
      throw new Error(`Expected an older link to open, got ${shared.status}`)
    }
    expect(shared.project.version).toBe(PROJECT_STATE_VERSION)
    expect(activePattern(shared.project)).toEqual(activePattern(sender))
    expect(shared.project.transport.bpm).toBe(132)
    expect(shared.project.instrumentSettings.bass).toEqual(sender.instrumentSettings.bass)
    // The version it predates arrives at its neutral default, not missing.
    expect(shared.project.instrumentSettings.master).toEqual(DEFAULT_MASTER_SETTINGS)
  })

  it('lifts a payload through every migration step, not only the most recent one', async () => {
    // v0 predates the document itself — one bare pattern and a flat bpm — so a
    // link this old only opens if the reader runs the whole chain rather than
    // special-casing the version below current.
    const pattern = cycleStep(createInitialPattern(), 'kick', 0)

    const shared = await readSharedBeat(
      await legacyShareUrl(0, { version: 0, pattern, bpm: 125 }),
    )

    if (shared.status !== 'ready') {
      throw new Error(`Expected the whole migration chain to run, got ${shared.status}`)
    }
    expect(shared.project.version).toBe(PROJECT_STATE_VERSION)
    expect(activePattern(shared.project).lanes[0].steps[0].on).toBe(true)
    expect(shared.project.transport.bpm).toBe(125)
  })

  it('blanks curriculum progress an older link carries rather than refusing the beat', async () => {
    const sender = cycleActivePatternStep(createInitialProjectState(), 'snare', 4)
    const url = await legacyShareUrl(
      6,
      v6ShareDocument(sender, {
        lessonProgress: { 'four-on-the-floor': { completed: true, dismissed: true } },
        prefs: { reducedFlashes: true },
        activeLessonId: 'filter-sweep',
      }),
    )

    const shared = await readSharedBeat(url)

    if (shared.status !== 'ready') {
      throw new Error(`Expected a stale progress map to be blanked, got ${shared.status}`)
    }
    expect(activePattern(shared.project).lanes[1].steps[4].on).toBe(true)
    expect(shared.project.lessonProgress).toEqual({})
    expect(shared.project.prefs).toEqual({})
    expect(shared.project.activeLessonId).toBeNull()
  })

  it('refuses a payload newer than this build without trying to open it', async () => {
    await expect(
      readSharedBeat(
        `https://elevated-bpm.example/?p=${PROJECT_STATE_VERSION + 1}.not-used`,
      ),
    ).resolves.toEqual({
      status: 'error',
      code: 'unsupported-version',
      message:
        'This shared beat uses an incompatible version of Elevated BPM and cannot be opened here.',
    })
  })

  it('reports a recognized version whose body cannot be migrated as damaged, not incompatible', async () => {
    const sender = createInitialProjectState()
    const links = [
      // A body whose own version nothing can lift.
      await legacyShareUrl(6, { version: 999 }),
      // A body whose version is known but whose contents migration cannot read.
      await legacyShareUrl(0, { version: 0 }),
      // A body that migrates cleanly and still is not a playable beat.
      await legacyShareUrl(6, v6ShareDocument(sender, { patterns: [] })),
    ]

    for (const link of links) {
      await expect(readSharedBeat(link)).resolves.toEqual({
        status: 'error',
        code: 'malformed',
        message: 'This shared beat link is damaged or incomplete. Your saved project is safe.',
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

  it('rejects a payload whose master macros are missing or out of range', async () => {
    const outOfRange = createInitialProjectState()
    outOfRange.instrumentSettings.master = { filter: 18_000, drive: 400 }
    const missing = createInitialProjectState()
    missing.instrumentSettings = {
      bass: missing.instrumentSettings.bass,
    } as typeof missing.instrumentSettings

    for (const invalid of [outOfRange, missing]) {
      const url = await createShareUrl(invalid, 'https://elevated-bpm.example/')
      await expect(readSharedBeat(url)).resolves.toMatchObject({
        status: 'error',
        code: 'malformed',
      })
    }
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
