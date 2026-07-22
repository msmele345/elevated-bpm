// Generates the synthesized 909/808-style kit into public/samples/.
// The kick keeps its own script (generate-kick.mjs); this covers the four
// lanes added in Phase 4. Run: node scripts/generate-kit.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 44100

/** Deterministic white noise so regenerating the kit is reproducible. */
function noiseSource(seed) {
  let state = seed
  return () => {
    // xorshift32
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) / 0xffffffff) * 2 - 1
  }
}

/** One-pole high-pass, used to thin noise into hat/clap territory. */
function highpass(samples, cutoffHz) {
  const rc = 1 / (2 * Math.PI * cutoffHz)
  const alpha = rc / (rc + 1 / SR)
  const out = new Float64Array(samples.length)
  let prevIn = 0
  let prevOut = 0
  for (let i = 0; i < samples.length; i++) {
    prevOut = alpha * (prevOut + samples[i] - prevIn)
    prevIn = samples[i]
    out[i] = prevOut
  }
  return out
}

function render(duration, fn) {
  const n = Math.floor(SR * duration)
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i)
  return out
}

/** Fade the tail so one-shots never click when they end. */
function deClick(samples, fadeSeconds = 0.005) {
  const fade = Math.floor(SR * fadeSeconds)
  for (let i = 0; i < fade; i++) samples[samples.length - 1 - i] *= i / fade
  return samples
}

function normalize(samples, peak = 0.95) {
  let max = 0
  for (const s of samples) max = Math.max(max, Math.abs(s))
  if (max === 0) return samples
  for (let i = 0; i < samples.length; i++) samples[i] = (samples[i] / max) * peak
  return samples
}

// --- Clap: four noise bursts in quick succession, then a longer tail. ---
function clap() {
  const rand = noiseSource(0x9e3779b9)
  const bursts = [0, 0.009, 0.018, 0.027]
  return render(0.4, (t) => {
    const n = rand()
    let env = 0
    for (const offset of bursts) {
      if (t >= offset) env = Math.max(env, Math.exp(-(t - offset) / 0.006))
    }
    // The reverberant tail that makes a clap read as a clap, not a snare.
    if (t >= 0.027) env = Math.max(env, 0.5 * Math.exp(-(t - 0.027) / 0.09))
    return n * env
  })
}

/** Metallic tone cluster: six detuned squares, the 909 hat/cymbal recipe. */
function metallic(t) {
  const partials = [263, 400, 421, 474, 587, 845]
  let sum = 0
  for (const f of partials) sum += Math.sign(Math.sin(2 * Math.PI * f * t))
  return sum / partials.length
}

function hat(decaySeconds) {
  const rand = noiseSource(0x1234567)
  const raw = render(decaySeconds * 4, (t) => {
    const env = Math.exp(-t / decaySeconds)
    return (metallic(t) * 0.8 + rand() * 0.2) * env
  })
  return highpass(raw, 6000)
}

// --- Perc: a short pitched rim/cowbell-style blip. ---
function perc() {
  return render(0.25, (t) => {
    const env = Math.min(1, t / 0.001) * Math.exp(-t / 0.045)
    const tone = Math.sin(2 * Math.PI * 587 * t) + 0.7 * Math.sin(2 * Math.PI * 845 * t)
    return Math.tanh(1.6 * tone * env) * 0.6
  })
}

function toWav(samples) {
  const dataSize = samples.length * 2
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(SR, 24)
  buf.writeUInt32LE(SR * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2)
  }
  return buf
}

const kit = {
  'clap-909.wav': clap(),
  'hat-closed-909.wav': hat(0.032),
  'hat-open-909.wav': hat(0.24),
  'perc-909.wav': perc(),
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples')
mkdirSync(outDir, { recursive: true })
for (const [name, samples] of Object.entries(kit)) {
  const buf = toWav(normalize(deClick(samples)))
  writeFileSync(join(outDir, name), buf)
  console.log(`wrote ${name} (${buf.length} bytes)`)
}
