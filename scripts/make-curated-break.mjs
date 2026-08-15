/**
 * Build the curated break the Sampling Arc teaches against.
 *
 * The arc needs a source the app *knows*: a lesson can only say "start your
 * chop on the snare" if the snare is at a time this repo can point at. So the
 * break is generated rather than sourced — the same 909 one-shots the deck
 * already ships, resampled and laid onto a known grid, which makes every
 * transient a computed number rather than something measured off a waveform.
 *
 * Run with `node scripts/make-curated-break.mjs`. It prints the duration and
 * the onset times; those numbers are what `CURATED_SAMPLE_SOURCE` and the
 * region-window lessons are authored from.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const SAMPLE_RATE = 44100
const BPM = 130
const BARS = 2
const STEPS_PER_BAR = 16
const STEPS = BARS * STEPS_PER_BAR
const SECONDS_PER_STEP = 60 / BPM / 4
const FRAMES = Math.round(STEPS * SECONDS_PER_STEP * SAMPLE_RATE)

/** Read a mono 16-bit PCM WAV into floats in [-1, 1]. */
function readWav(path) {
  const bytes = readFileSync(path)
  let at = 12
  while (at < bytes.length - 8) {
    const id = bytes.toString('ascii', at, at + 4)
    const size = bytes.readUInt32LE(at + 4)
    if (id === 'data') {
      const samples = new Float32Array(size / 2)
      for (let i = 0; i < samples.length; i += 1) {
        samples[i] = bytes.readInt16LE(at + 8 + i * 2) / 32768
      }
      return samples
    }
    at += 8 + size + (size % 2)
  }
  throw new Error(`no data chunk in ${path}`)
}

/**
 * Record-style pitching: one rate moves speed and pitch together, as the deck
 * does — plus a decay, which is doing real work rather than decoration.
 *
 * The 909 kick rings for over a second. Left alone it sits under the hits that
 * follow it, and an onset detector reading the *rise* between frames cannot see
 * a clap that lands inside a kick's tail. A break whose hits cannot be found is
 * the wrong source for an arc that teaches finding them, so every voice is
 * tightened the way a sampled break already would be.
 */
function mixIn(track, hit, atFrame, rate, gain, decay) {
  const length = Math.floor(hit.length / rate)
  for (let i = 0; i < length; i += 1) {
    const target = atFrame + i
    if (target >= track.length) break
    const source = i * rate
    const low = Math.floor(source)
    const frac = source - low
    const sample = (hit[low] ?? 0) * (1 - frac) + (hit[low + 1] ?? 0) * frac
    track[target] += sample * gain * Math.exp(-(i / SAMPLE_RATE) / decay)
  }
}

const kit = {
  kick: readWav('public/samples/kick-909.wav'),
  clap: readWav('public/samples/clap-909.wav'),
  closedHat: readWav('public/samples/hat-closed-909.wav'),
  openHat: readWav('public/samples/hat-open-909.wav'),
  perc: readWav('public/samples/perc-909.wav'),
}

/**
 * Two bars with a break's syncopation rather than the deck's own four-to-the-
 * floor: the point is a loop worth chopping, with backbeats that stand out as
 * obvious chop targets and offbeat perc between them.
 *
 * Each voice is resampled off its 909 original so the loop reads as somebody
 * else's record rather than as the kit sitting next to it on the deck.
 */
const VOICES = [
  { sound: 'kick', rate: 0.94, gain: 1, decay: 0.09, steps: [0, 6, 16, 22, 26] },
  { sound: 'clap', rate: 0.88, gain: 0.95, decay: 0.1, steps: [4, 12, 20, 28] },
  { sound: 'closedHat', rate: 1.08, gain: 0.45, decay: 0.03, steps: [2, 6, 10, 14, 18, 22, 26, 30] },
  { sound: 'openHat', rate: 0.96, gain: 0.4, decay: 0.12, steps: [14, 30] },
  { sound: 'perc', rate: 1.18, gain: 0.6, decay: 0.06, steps: [7, 19, 23] },
]

const track = new Float32Array(FRAMES)
for (const voice of VOICES) {
  for (const step of voice.steps) {
    mixIn(
      track,
      kit[voice.sound],
      Math.round(step * SECONDS_PER_STEP * SAMPLE_RATE),
      voice.rate,
      voice.gain,
      voice.decay,
    )
  }
}

// Peak-normalize, leaving the headroom a real record would have.
let peak = 0
for (const sample of track) peak = Math.max(peak, Math.abs(sample))
const scale = 0.89 / peak

const data = Buffer.alloc(FRAMES * 2)
for (let i = 0; i < FRAMES; i += 1) {
  const clamped = Math.max(-1, Math.min(1, track[i] * scale))
  data.writeInt16LE(Math.round(clamped * 32767), i * 2)
}

const header = Buffer.alloc(44)
header.write('RIFF', 0, 'ascii')
header.writeUInt32LE(36 + data.length, 4)
header.write('WAVE', 8, 'ascii')
header.write('fmt ', 12, 'ascii')
header.writeUInt32LE(16, 16)
header.writeUInt16LE(1, 20)
header.writeUInt16LE(1, 22)
header.writeUInt32LE(SAMPLE_RATE, 24)
header.writeUInt32LE(SAMPLE_RATE * 2, 28)
header.writeUInt16LE(2, 32)
header.writeUInt16LE(16, 34)
header.write('data', 36, 'ascii')
header.writeUInt32LE(data.length, 40)

writeFileSync('public/samples/break-909.wav', Buffer.concat([header, data]))

// The measured shape of what was just written, emitted rather than printed for
// transcription. The lesson parser validates every region window against this
// duration, so a hand-copied number that drifted from the file would leave the
// shipped lessons pointing into audio that is no longer there — while the
// parser went on passing, because it would be checking the stale number itself.
writeFileSync(
  'src/model/curatedBreak.json',
  `${JSON.stringify(
    {
      durationSeconds: Number((FRAMES / SAMPLE_RATE).toFixed(6)),
      sampleRate: SAMPLE_RATE,
      channels: 1,
      bpm: BPM,
      bars: BARS,
    },
    null,
    2,
  )}\n`,
)

const onsets = [...new Set(VOICES.flatMap((voice) => voice.steps))].sort((a, b) => a - b)
console.log(`frames ${FRAMES}  duration ${(FRAMES / SAMPLE_RATE).toFixed(6)} s  ${BPM} BPM`)
console.log(`seconds per step ${SECONDS_PER_STEP.toFixed(6)}`)
console.log(
  'onsets:',
  onsets.map((step) => `${step}@${(step * SECONDS_PER_STEP).toFixed(4)}`).join(' '),
)
