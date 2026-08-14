import { describe, expect, it } from 'vitest'
import {
  activePattern,
  addSource,
  assignSourceToSamplerPad,
  commitRegionToSamplerPad,
  createInitialProjectState,
  cycleActivePatternStep,
  PROJECT_STATE_VERSION,
  setBassParamValue,
  setFxParamValue,
  setMasterParamValue,
  setSamplerParamValue,
  setTransportBpm,
  resizeActivePatternNote,
  toggleActivePatternNoteStep,
  toggleLaneMute,
  transposeActivePatternNote,
  type ProjectState,
} from './projectState'
import { DEFAULT_FX_SETTINGS } from './fx'
import { DEFAULT_MASTER_SETTINGS } from './master'
import { createInitialPattern, cycleStep } from './pattern'
import {
  CURATED_SAMPLE_SOURCE,
  samplerParamForPad,
  type AvailableAudio,
  type SampleRegion,
} from './sampler'
import { sliceKey, type Slice } from './slice'
import {
  BUNDLE_FILE_EXTENSION,
  createBundle,
  readBundle,
  SENDABLE_BUNDLE_LIMIT,
} from './bundle'
import {
  createShareUrl,
  PRACTICAL_SHARE_URL_LIMIT,
  projectWithSharedBeat,
  readSharedBeat,
  sharedAudioNotice,
  SHARE_QUERY_PARAM,
} from './share'
import type { DrumLaneId, NoteLaneId, PadLaneId } from './types'

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
    const source = setFxParamValue(
      setFxParamValue(
        setMasterParamValue(
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
        ),
        'stabSend',
        65,
      ),
      'feedback',
      70,
    )

    // Everything that shapes the sound travels, the FX bus included.
    expect(source.instrumentSettings.fx.stabSend).toBe(65)

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
        sources: source.sources,
        lessonProgress: {},
        prefs: {},
        mixer: source.mixer,
        activeLessonId: null,
      },
    })
  })

  it('round-trips pad programming, assignment, Tune, fit and pad mixer keys', async () => {
    let source = assignSourceToSamplerPad(
      createInitialProjectState(),
      'pad2',
      CURATED_SAMPLE_SOURCE.id,
    )
    source = cycleActivePatternStep(source, 'pad2', 5)
    source = cycleActivePatternStep(source, 'pad2', 5)
    source = setSamplerParamValue(source, samplerParamForPad('pad2').id, -7)
    source = toggleLaneMute(source, 'pad4')
    source = {
      ...source,
      instrumentSettings: {
        ...source.instrumentSettings,
        sampler: {
          ...source.instrumentSettings.sampler,
          pad2: { ...source.instrumentSettings.sampler.pad2, fit: 4 },
        },
      },
    }

    const shared = await readSharedBeat(
      await createShareUrl(source, 'https://elevated-bpm.example/'),
    )

    if (shared.status !== 'ready') throw new Error('Expected a playable shared sampler beat')
    expect(activePattern(shared.project).padLanes).toEqual(activePattern(source).padLanes)
    expect(shared.project.instrumentSettings.sampler).toEqual(source.instrumentSettings.sampler)
    expect(shared.project.mixer.pad4).toEqual({ muted: true, soloed: false })
    expect(shared.project.sources).toEqual([CURATED_SAMPLE_SOURCE])
  })

  it('keeps a densely programmed beat within the practical 2,000-character URL limit', async () => {
    let source = createInitialProjectState()
    const drumLanes: DrumLaneId[] = ['kick', 'snare', 'closedHat', 'openHat', 'perc']
    const padLanes: PadLaneId[] = ['pad1', 'pad2', 'pad3', 'pad4']
    const noteLanes: NoteLaneId[] = ['bass', 'stab']

    for (const lane of drumLanes) {
      for (let step = 0; step < 16; step += 1) {
        source = cycleActivePatternStep(source, lane, step)
        if ((step + drumLanes.indexOf(lane)) % 2 === 0) {
          source = cycleActivePatternStep(source, lane, step)
        }
      }
    }
    for (const lane of padLanes) {
      for (let step = 0; step < 16; step += 1) {
        source = cycleActivePatternStep(source, lane, step)
        if ((step + padLanes.indexOf(lane)) % 2 === 0) {
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
    // A link written before the FX bus existed arrives with every send closed,
    // so an old beat still sounds the way its sender heard it.
    expect(shared.project.instrumentSettings.fx).toEqual(DEFAULT_FX_SETTINGS)
    expect(shared.project.sources).toEqual([CURATED_SAMPLE_SOURCE])
    expect(activePattern(shared.project).padLanes.every((lane) => lane.steps.every((step) => !step.on)))
      .toBe(true)
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
    invalid.patterns = [
      { id: 'pattern-1', name: 'Broken', lanes: [], padLanes: [], noteLanes: [] },
    ]
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

  it('rejects a payload whose FX patch is missing or out of range', async () => {
    const outOfRange = createInitialProjectState()
    outOfRange.instrumentSettings.fx = { ...DEFAULT_FX_SETTINGS, stabSend: 400 }
    const missing = createInitialProjectState()
    missing.instrumentSettings = {
      bass: missing.instrumentSettings.bass,
      master: missing.instrumentSettings.master,
    } as typeof missing.instrumentSettings

    for (const invalid of [outOfRange, missing]) {
      const url = await createShareUrl(invalid, 'https://elevated-bpm.example/')
      await expect(readSharedBeat(url)).resolves.toMatchObject({
        status: 'error',
        code: 'malformed',
      })
    }
  })

  it('rejects sampler settings outside the closed four-pad shape', async () => {
    const outOfRange = createInitialProjectState()
    outOfRange.instrumentSettings.sampler.pad1.tune = 999
    const missingPad = createInitialProjectState()
    delete (missingPad.instrumentSettings.sampler as Partial<
      typeof missingPad.instrumentSettings.sampler
    >).pad4

    for (const invalid of [outOfRange, missingPad]) {
      const url = await createShareUrl(invalid, 'https://elevated-bpm.example/')
      await expect(readSharedBeat(url)).resolves.toMatchObject({
        status: 'error',
        code: 'malformed',
      })
    }
  })

  it('rejects a mixer key for a pad the fixed deck does not have', async () => {
    const invalid = createInitialProjectState()
    ;(invalid.mixer as Record<string, unknown>).pad5 = { muted: false, soloed: true }

    await expect(
      readSharedBeat(await createShareUrl(invalid, 'https://elevated-bpm.example/')),
    ).resolves.toMatchObject({ status: 'error', code: 'malformed' })
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
    expect(preview.sources).toEqual(sender.sources)
    expect(preview.lessonProgress).toBe(recipient.lessonProgress)
    expect(preview.prefs).toBe(recipient.prefs)
    expect(activePattern(recipient)).toBe(ownPattern)
    expect(ownPattern.lanes[0].steps[2].on).toBe(true)
  })
})

/**
 * White noise, which is the *worst* case a bundle can be asked to carry: audio
 * that compresses no better than random bytes. Sizing the format against it is
 * what makes the ceiling below an honest promise rather than a lucky fixture.
 */
function noisePcm(samples: number, seed = 1): Int16Array {
  const pcm = new Int16Array(samples)
  let x = seed
  for (let at = 0; at < samples; at += 1) {
    x ^= x << 13
    x >>>= 0
    x ^= x >>> 17
    x ^= x << 5
    x >>>= 0
    pcm[at] = (x & 0xffff) - 32_768
  }
  return pcm
}

function sliceFixture(seconds: number, channels = 2, sampleRate = 48_000, seed = 1): Slice {
  const frames = Math.round(seconds * sampleRate)
  return { sampleRate, channels, frames, pcm: noisePcm(frames * channels, seed) }
}

const BREAK = {
  id: 'upload-break',
  name: 'Warehouse Break',
  origin: 'upload' as const,
  duration: 8,
  channels: 2,
}

/** A beat with two chops cut out of one uploaded break, and the audio for both. */
function senderWithChops(): { project: ProjectState; slices: Map<string, Slice> } {
  const first: SampleRegion = { sourceId: BREAK.id, start: 0.5, duration: 1 }
  const second: SampleRegion = { sourceId: BREAK.id, start: 4, duration: 0.25 }
  let project = addSource(createInitialProjectState(), BREAK)
  project = commitRegionToSamplerPad(project, 'pad1', first)
  project = commitRegionToSamplerPad(project, 'pad3', second)
  project = cycleActivePatternStep(project, 'pad1', 0)
  project = cycleActivePatternStep(project, 'pad3', 6)
  project = cycleActivePatternStep(project, 'pad3', 6)
  project = setSamplerParamValue(project, samplerParamForPad('pad1').id, -5)
  project = setTransportBpm(project, 138)
  return {
    project,
    slices: new Map([
      [sliceKey(first), sliceFixture(0.01, 2, 48_000, 7)],
      [sliceKey(second), sliceFixture(0.005, 1, 44_100, 11)],
    ]),
  }
}

async function exportedBytes(
  project: ProjectState,
  slices: Map<string, Slice>,
): Promise<ArrayBuffer> {
  const bundle = await createBundle(project, slices)
  if (bundle.status !== 'ready') throw new Error(`Expected a bundle, got ${bundle.status}`)
  return bundle.blob.arrayBuffer()
}

/**
 * A bundle's wire format, spelled out here rather than reached for through the
 * writer — the point of the cases below is a file this codebase did not
 * produce, so the tests must not track whatever `bundle.ts` happens to do.
 */
const BUNDLE_MAGIC = 'elevated-bpm-bundle/'

function bundleBody(bytes: Uint8Array): Uint8Array {
  return bytes.subarray(bytes.indexOf(0x0a) + 1)
}

function carriedIn(header: string, body: Uint8Array): ArrayBuffer {
  const prefix = new TextEncoder().encode(header)
  const file = new Uint8Array(prefix.length + body.length)
  file.set(prefix)
  file.set(body, prefix.length)
  return file.buffer as ArrayBuffer
}

async function gzipped(text: string): Promise<Uint8Array> {
  const stream = new CompressionStream('gzip')
  const output = new Response(stream.readable).arrayBuffer()
  const writer = stream.writable.getWriter()
  await writer.write(new TextEncoder().encode(text))
  await writer.close()
  return new Uint8Array(await output)
}

async function gunzipped(bytes: Uint8Array): Promise<string> {
  const stream = new DecompressionStream('gzip')
  const output = new Response(stream.readable).arrayBuffer()
  const writer = stream.writable.getWriter()
  await writer.write(bytes)
  await writer.close()
  return new TextDecoder().decode(await output)
}

/** Rewrite what is inside a bundle: an older build's document, or a damaged one. */
async function rewriteBundleDocument(
  bytes: Uint8Array,
  rewrite: (document: unknown) => unknown,
): Promise<ArrayBuffer> {
  const document = JSON.parse(await gunzipped(bundleBody(bytes)))
  return carriedIn(
    `${BUNDLE_MAGIC}${PROJECT_STATE_VERSION}\n`,
    await gzipped(JSON.stringify(rewrite(document))),
  )
}

/** The same bundle, stamped as though a different build had written it. */
function withBundleVersion(bytes: Uint8Array, version: number): ArrayBuffer {
  return carriedIn(`${BUNDLE_MAGIC}${version}\n`, bundleBody(bytes))
}

describe('beat bundle', () => {
  it('reproduces the beat and its pad audio on a machine that has neither', async () => {
    const { project: sender, slices } = senderWithChops()

    const opened = await readBundle(await exportedBytes(sender, slices))

    if (opened.status !== 'ready') throw new Error(`Expected a playable bundle, got ${opened.status}`)
    expect(activePattern(opened.project)).toEqual(activePattern(sender))
    expect(opened.project.transport.bpm).toBe(138)
    expect(opened.project.instrumentSettings).toEqual(sender.instrumentSettings)
    expect(opened.project.sources).toEqual(sender.sources)
    // The audio is the whole reason a bundle is worth the extra step over a
    // link, so it has to come back sample for sample.
    expect(new Map(opened.slices)).toEqual(slices)
  })

  it('names itself after the beat and blanks the recipient-owned fields a link does', async () => {
    const { project: sender, slices } = senderWithChops()
    const withProgress: ProjectState = {
      ...sender,
      lessonProgress: { 'four-on-the-floor': { completed: true, dismissed: true } },
      prefs: { reducedFlashes: true },
      activeLessonId: 'filter-sweep',
    }

    const bundle = await createBundle(withProgress, slices)

    if (bundle.status !== 'ready') throw new Error('Expected a bundle')
    expect(bundle.fileName.endsWith(BUNDLE_FILE_EXTENSION)).toBe(true)
    expect(bundle.fileName).toContain(activePattern(sender).name)
    const opened = await readBundle(await bundle.blob.arrayBuffer())
    if (opened.status !== 'ready') throw new Error('Expected a playable bundle')
    expect(opened.project.lessonProgress).toEqual({})
    expect(opened.project.prefs).toEqual({})
    expect(opened.project.activeLessonId).toBeNull()
  })

  it('refuses to write a bundle whose own pad has lost its audio, naming that pad', async () => {
    const { project: sender, slices } = senderWithChops()
    // Pad 3's slice is gone from storage: the pad is silent here and would be
    // silent there, so exporting it would produce a file this build refuses.
    slices.delete(sliceKey(sender.instrumentSettings.sampler.pad3.region!))

    const bundle = await createBundle(sender, slices)

    expect(bundle).toEqual({
      status: 'error',
      code: 'silent-pad',
      message:
        'Pad 3 (Warehouse Break) has no audio to put in a bundle. Relink it, then export again.',
    })
  })

  it('keeps four one-second stereo slices inside the size that makes a bundle sendable', async () => {
    let sender = addSource(createInitialProjectState(), BREAK)
    const slices = new Map<string, Slice>()
    for (const [index, pad] of (['pad1', 'pad2', 'pad3', 'pad4'] as PadLaneId[]).entries()) {
      const region: SampleRegion = { sourceId: BREAK.id, start: index, duration: 1 }
      sender = commitRegionToSamplerPad(sender, pad, region)
      slices.set(sliceKey(region), sliceFixture(1, 2, 48_000, index + 1))
    }

    const bytes = await exportedBytes(sender, slices)

    // Four seconds of 16-bit stereo at 48 kHz is 768 KB of PCM. Base64 inflates
    // it by a third and gzip takes that back, so the file lands near the raw
    // audio — the arithmetic the slice format in EB2-05 was chosen for. Float32
    // slices would be roughly double and would break this.
    expect(bytes.byteLength).toBeLessThan(SENDABLE_BUNDLE_LIMIT)
    // And a floor, because a bundle that quietly stopped carrying its audio
    // would pass a ceiling on its own.
    expect(bytes.byteLength).toBeGreaterThan(600_000)
  })

  it('opens a bundle written at an older schema version', async () => {
    // Bundles are files people keep, so they have to survive schema bumps. This
    // works because the decode path runs every payload through the same
    // migration a saved document takes — asserted here so a later change that
    // skips it fails loudly.
    const { project: sender, slices } = senderWithChops()
    const bytes = new Uint8Array(await exportedBytes(sender, slices))
    const older = await rewriteBundleDocument(bytes, (document) => ({
      ...(document as Record<string, unknown>),
      project: v6ShareDocument(sender),
    }))

    const opened = await readBundle(older)

    if (opened.status !== 'ready') throw new Error(`Expected an older bundle to open, got ${opened.status}`)
    expect(opened.project.version).toBe(PROJECT_STATE_VERSION)
    expect(activePattern(opened.project).lanes).toEqual(activePattern(sender).lanes)
    expect(opened.project.transport.bpm).toBe(138)
    // A version that predates the sampler brings empty pads, so the bundle
    // needs no audio to be complete.
    expect(opened.project.instrumentSettings.sampler.pad1.region).toBeNull()
  })

  it('refuses a bundle from a newer build with the unsupported-version message', async () => {
    const { project: sender, slices } = senderWithChops()
    const bytes = new Uint8Array(await exportedBytes(sender, slices))

    const opened = await readBundle(withBundleVersion(bytes, PROJECT_STATE_VERSION + 1))

    expect(opened).toEqual({
      status: 'error',
      code: 'unsupported-version',
      message:
        'This shared beat uses an incompatible version of Elevated BPM and cannot be opened here.',
    })
  })

  /**
   * The accepted cost of reusing the share pipeline is opacity: nobody can open
   * a bundle and look inside it, so the refusal message is the only diagnostic
   * anyone will ever get. Each of these has to name a different thing.
   */
  it('tells truncation, an unreadable document, missing audio and a stray file apart', async () => {
    const { project: sender, slices } = senderWithChops()
    const bytes = new Uint8Array(await exportedBytes(sender, slices))

    const truncated = await readBundle(bytes.slice(0, Math.floor(bytes.length / 2)))
    const unreadable = await rewriteBundleDocument(bytes, () => ({ project: { nonsense: true } }))
    const withoutAudio = await rewriteBundleDocument(bytes, (document) => ({
      ...(document as Record<string, unknown>),
      slices: {},
    }))
    const strayFile = new TextEncoder().encode('just a text file, not a bundle at all')

    expect(truncated).toEqual({
      status: 'error',
      code: 'truncated',
      message:
        'This bundle is incomplete — the file was cut short before it finished. Ask whoever sent it to send it again.',
    })
    expect(await readBundle(unreadable)).toEqual({
      status: 'error',
      code: 'malformed',
      message:
        'This bundle opened, but the beat inside it could not be read. Your saved project is safe.',
    })
    // Two pads chopped from one break wear the same name, so the pad each one
    // sits on is what makes the message actionable.
    expect(await readBundle(withoutAudio)).toEqual({
      status: 'error',
      code: 'missing-audio',
      message:
        'This bundle is missing the audio for Pad 1 (Warehouse Break) and Pad 3 (Warehouse Break). Ask whoever sent it to export it again.',
    })
    expect(await readBundle(strayFile.buffer as ArrayBuffer)).toEqual({
      status: 'error',
      code: 'not-a-bundle',
      message: 'This file is not an Elevated BPM bundle. Your saved project is safe.',
    })
  })

  it('refuses a slice whose audio is not the size it claims, rather than playing rubbish', async () => {
    const { project: sender, slices } = senderWithChops()
    const bytes = new Uint8Array(await exportedBytes(sender, slices))

    const shortened = await rewriteBundleDocument(bytes, (document) => {
      const payload = document as { slices: Record<string, { pcm: string }> }
      const [key] = Object.keys(payload.slices)
      return {
        ...payload,
        slices: {
          ...payload.slices,
          [key]: { ...payload.slices[key], pcm: payload.slices[key].pcm.slice(0, 8) },
        },
      }
    })

    expect(await readBundle(shortened)).toMatchObject({ status: 'error', code: 'malformed' })
  })
})

describe('link degradation', () => {
  const availableFor = (keys: string[]): AvailableAudio => ({
    slices: new Set(keys),
    sources: new Set<string>(),
  })

  it('names how many sounds could not travel and points at a bundle', async () => {
    const { project: sender, slices } = senderWithChops()
    const shared = await readSharedBeat(
      await createShareUrl(sender, 'https://elevated-bpm.example/'),
    )
    if (shared.status !== 'ready') throw new Error('Expected a playable shared beat')

    // The recipient has one of the two chops already; the other could not travel.
    const [firstKey] = [...slices.keys()]

    expect(sharedAudioNotice(shared.project, availableFor([...slices.keys()]))).toBeNull()
    expect(sharedAudioNotice(shared.project, availableFor([firstKey]))).toBe(
      '1 sound could not travel: audio is far too large to fit in a link. Ask whoever sent it for a bundle file to hear it.',
    )
    expect(sharedAudioNotice(shared.project, availableFor([]))).toBe(
      '2 sounds could not travel: audio is far too large to fit in a link. Ask whoever sent it for a bundle file to hear them.',
    )
  })

  it('says nothing about a beat that never had any audio to lose', async () => {
    const shared = await readSharedBeat(
      await createShareUrl(
        cycleActivePatternStep(createInitialProjectState(), 'kick', 0),
        'https://elevated-bpm.example/',
      ),
    )
    if (shared.status !== 'ready') throw new Error('Expected a playable shared beat')

    expect(sharedAudioNotice(shared.project, availableFor([]))).toBeNull()
  })
})
