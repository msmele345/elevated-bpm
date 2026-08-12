import { describe, expect, it } from 'vitest'
import {
  INTAKE_LIMITS_HINT,
  MAX_SOURCE_BYTES,
  MAX_SOURCE_SECONDS,
  rejectionForDuration,
  rejectionForSize,
  sourceNameFromFileName,
} from './intake'

describe('the intake size gate', () => {
  it('refuses a file over the limit, naming the limit it broke', () => {
    const rejection = rejectionForSize('long-mix.wav', MAX_SOURCE_BYTES + 1)

    expect(rejection?.code).toBe('too-large')
    expect(rejection?.message).toContain('long-mix.wav')
    expect(rejection?.message).toContain('50 MB')
  })

  it('accepts a file sitting exactly on the limit', () => {
    expect(rejectionForSize('exactly-fifty.wav', MAX_SOURCE_BYTES)).toBeNull()
  })
})

describe('the intake duration gate', () => {
  it('refuses a file over the limit, naming the limit it broke', () => {
    const rejection = rejectionForDuration('warehouse-set.mp3', MAX_SOURCE_SECONDS + 1)

    expect(rejection?.code).toBe('too-long')
    expect(rejection?.message).toContain('warehouse-set.mp3')
    expect(rejection?.message).toContain('6 minutes')
  })

  it('treats a probe that learned nothing as a file the browser cannot read', () => {
    const rejection = rejectionForDuration('broken.aiff', Number.NaN)

    expect(rejection?.code).toBe('undecodable')
    expect(rejection?.message).toContain('broken.aiff')
  })

  it('accepts a file sitting exactly on the limit', () => {
    expect(rejectionForDuration('exactly-six.wav', MAX_SOURCE_SECONDS)).toBeNull()
  })

  it('refuses an endless stream as over-long rather than unreadable', () => {
    expect(rejectionForDuration('live-stream.mp3', Number.POSITIVE_INFINITY)?.code).toBe(
      'too-long',
    )
  })
})

describe('naming a source after its file', () => {
  it('drops the extension, which is not part of what the sound is called', () => {
    expect(sourceNameFromFileName('Warehouse Break.wav')).toBe('Warehouse Break')
  })

  it('always yields a name, even from a file that is nothing but an extension', () => {
    expect(sourceNameFromFileName('.wav').trim()).not.toBe('')
    expect(sourceNameFromFileName('   ').trim()).not.toBe('')
  })
})

describe('the stated limits', () => {
  it('names both limits in the copy shown where audio is loaded', () => {
    expect(INTAKE_LIMITS_HINT).toContain('50 MB')
    expect(INTAKE_LIMITS_HINT).toContain('6 minutes')
  })
})
