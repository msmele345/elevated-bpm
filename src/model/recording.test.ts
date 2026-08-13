import { describe, expect, it } from 'vitest'
import { sourceNameFromFileName } from './intake'
import type { SampleSource } from './sampler'
import {
  IDLE_RECORDING,
  MIC_LIVE_ANNOUNCEMENT,
  MIC_OFF_ANNOUNCEMENT,
  elapsedSeconds,
  formatElapsed,
  isMicrophoneLive,
  microphoneOpened,
  microphoneReleased,
  recordingFileName,
  requestMicrophone,
  stopRequested,
} from './recording'

/** Only a source's name and origin matter to the naming rule. */
function source(name: string, origin: SampleSource['origin']): SampleSource {
  return { id: name, name, origin, duration: 1, channels: 1 }
}

/** The machine at the moment capture began, which most behavior starts from. */
function recording(startedAt = 0) {
  return microphoneOpened(requestMicrophone(IDLE_RECORDING), startedAt)
}

describe('whether the microphone is live', () => {
  it('is not live while the browser is still asking, and is once it opened', () => {
    const asking = requestMicrophone(IDLE_RECORDING)
    expect(isMicrophoneLive(asking)).toBe(false)

    expect(isMicrophoneLive(microphoneOpened(asking, 0))).toBe(true)
  })

  it('stays live from asking it to stop until it is actually released', () => {
    // The gap between the two is a real one — the recorder has to flush what it
    // captured — and the indicator must not go dark while the mic is still on.
    const stopping = stopRequested(recording())
    expect(isMicrophoneLive(stopping)).toBe(true)

    expect(isMicrophoneLive(microphoneReleased(stopping))).toBe(false)
  })
})

describe('what a recording is called', () => {
  it('numbers each take, and strips back to that name through the file gate', () => {
    // A recording travels as a file so it can take the same path an upload
    // does, which means its name has to survive that path's own naming rule.
    const first = recordingFileName([], 'audio/webm;codecs=opus')
    expect(sourceNameFromFileName(first)).toBe('Recording 1')

    const second = recordingFileName([source('Recording 1', 'recording')], 'audio/webm')
    expect(sourceNameFromFileName(second)).toBe('Recording 2')
  })

  it('counts past takes that were deleted, so two sources never share a name', () => {
    const sources = [source('Recording 3', 'recording'), source('Warehouse Break', 'upload')]

    expect(sourceNameFromFileName(recordingFileName(sources, 'audio/webm'))).toBe('Recording 4')
  })

  it('names a recording the browser gave no container for', () => {
    // Safari and Chrome disagree about containers, and a blob can arrive with
    // no type at all; a nameless source would show as “Untitled sample”.
    expect(sourceNameFromFileName(recordingFileName([], ''))).toBe('Recording 1')
  })
})

describe('how long it has been recording', () => {
  it('measures from the moment the microphone opened, and keeps measuring while stopping', () => {
    const running = recording(10_000)
    expect(elapsedSeconds(running, 17_500)).toBeCloseTo(7.5)

    // The flush is part of what was captured, so the clock does not stop when
    // the user asks it to — it stops when the microphone does.
    expect(elapsedSeconds(stopRequested(running), 20_000)).toBeCloseTo(10)
  })

  it('is zero before the microphone ever opened', () => {
    expect(elapsedSeconds(requestMicrophone(IDLE_RECORDING), 99_000)).toBe(0)
  })

  it('reads as minutes and seconds, so a long take is legible at a glance', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(7.9)).toBe('0:07')
    expect(formatElapsed(65)).toBe('1:05')
    expect(formatElapsed(600)).toBe('10:00')
  })
})

describe('what is announced', () => {
  it('says the microphone went live, and then that it went off', () => {
    const running = recording()
    expect(running.announcement).toBe(MIC_LIVE_ANNOUNCEMENT)

    expect(microphoneReleased(stopRequested(running)).announcement).toBe(MIC_OFF_ANNOUNCEMENT)
  })

  it('says nothing about a microphone that never opened', () => {
    // A refused permission is a dismissible message, not news that the mic is
    // off: announcing that to someone who was never told it was on is noise.
    expect(microphoneReleased(requestMicrophone(IDLE_RECORDING)).announcement).toBe('')
  })
})

describe('transitions that were never asked for', () => {
  it('leaves a running recording alone when record is pressed again', () => {
    const running = recording(1_000)

    // Otherwise a second click would restart the elapsed clock the indicator
    // reads, and ask the browser for a microphone it already has.
    expect(requestMicrophone(running)).toEqual(running)
    expect(requestMicrophone(stopRequested(running))).toEqual(stopRequested(running))
  })

  it('ignores an opened microphone that nothing asked for', () => {
    expect(microphoneOpened(IDLE_RECORDING, 5)).toEqual(IDLE_RECORDING)
  })

  it('ignores a stop while the browser is still asking permission', () => {
    // There is nothing to stop yet, and pretending otherwise would show a
    // stop control for a microphone that never opened.
    const asking = requestMicrophone(IDLE_RECORDING)
    expect(stopRequested(asking)).toEqual(asking)
  })
})
