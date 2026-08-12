/**
 * A six-minute source for verifying the editor's memory behaviour — the one
 * claim unit tests cannot make.
 *
 * Mono, 22.05 kHz, 16-bit, so the file lands around 16 MB and passes the
 * 50 MB intake gate while still being the full six minutes the duration cap
 * allows. Hits every half second, so onset detection has real structure to
 * find rather than a drone.
 *
 * Written to a temp path by default; it is deliberately not a repo asset.
 *
 *   node scripts/generate-long-source.mjs [outPath]
 */
import { writeFileSync } from 'node:fs'

const SAMPLE_RATE = 22050
const SECONDS = 6 * 60
const HIT_EVERY = 0.5

const frames = SAMPLE_RATE * SECONDS
const samples = new Float32Array(frames)

for (let hit = 0; hit * HIT_EVERY < SECONDS; hit += 1) {
  const start = Math.round(hit * HIT_EVERY * SAMPLE_RATE)
  const length = Math.round(SAMPLE_RATE * 0.18)
  // Alternating pitch and level, so the hits are distinguishable by ear and
  // the detector is not just finding one repeated impulse.
  const freq = hit % 4 === 0 ? 60 : hit % 2 === 0 ? 210 : 900
  const peak = hit % 4 === 0 ? 0.9 : 0.45
  for (let i = 0; i < length && start + i < frames; i += 1) {
    const decay = Math.exp(-14 * (i / SAMPLE_RATE))
    samples[start + i] += peak * decay * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE)
  }
}

const data = Buffer.alloc(frames * 2)
for (let i = 0; i < frames; i += 1) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2)
}

const header = Buffer.alloc(44)
header.write('RIFF', 0)
header.writeUInt32LE(36 + data.length, 4)
header.write('WAVE', 8)
header.write('fmt ', 12)
header.writeUInt32LE(16, 16)
header.writeUInt16LE(1, 20)
header.writeUInt16LE(1, 22)
header.writeUInt32LE(SAMPLE_RATE, 24)
header.writeUInt32LE(SAMPLE_RATE * 2, 28)
header.writeUInt16LE(2, 32)
header.writeUInt16LE(16, 34)
header.write('data', 36)
header.writeUInt32LE(data.length, 40)

const out = process.argv[2] ?? '/tmp/six-minute-source.wav'
writeFileSync(out, Buffer.concat([header, data]))
console.log(`${out} — ${(header.length + data.length) / 1024 / 1024} MB, ${SECONDS}s`)
