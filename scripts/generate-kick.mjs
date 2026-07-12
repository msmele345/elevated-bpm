// Generates public/samples/kick-909.wav — a synthesized 909-style kick
// one-shot (pitch-swept sine with soft saturation). Run: node scripts/generate-kick.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 44100
const DURATION = 0.6
const N = Math.floor(SR * DURATION)

const samples = new Float64Array(N)
let phase = 0
for (let i = 0; i < N; i++) {
  const t = i / SR
  // Pitch: fast click-thump sweep settling on a 45 Hz fundamental.
  const freq = 45 + 400 * Math.exp(-t / 0.012) + 60 * Math.exp(-t / 0.05)
  phase += (2 * Math.PI * freq) / SR
  // Amplitude: ~2 ms attack, exponential body decay, soft-clipped for punch.
  const attack = Math.min(1, t / 0.002)
  const env = attack * Math.exp(-t / 0.22)
  samples[i] = Math.tanh(1.4 * Math.sin(phase) * env) * 0.95
}

// De-click the tail.
const fadeSamples = Math.floor(SR * 0.01)
for (let i = 0; i < fadeSamples; i++) {
  samples[N - 1 - i] *= i / fadeSamples
}

// 16-bit PCM mono WAV.
const dataSize = N * 2
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
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2)
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'kick-909.wav'), buf)
console.log(`wrote ${join(outDir, 'kick-909.wav')} (${buf.length} bytes)`)
