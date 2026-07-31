import { describe, expect, it } from 'vitest'
import {
  createMasterSettings,
  DEFAULT_MASTER_SETTINGS,
  MASTER_PARAMS,
  masterBusParams,
  setMasterParam,
} from './master'
import { formatParam } from './knob'

describe('MASTER_PARAMS', () => {
  it('describes the filter and drive macros the master strip renders', () => {
    expect(MASTER_PARAMS.map((param) => param.id)).toEqual(['filter', 'drive'])
  })

  it('rests neutral: the filter fully open and the drive clean, so the untouched deck sounds unprocessed', () => {
    const filter = MASTER_PARAMS.find((param) => param.id === 'filter')!
    const drive = MASTER_PARAMS.find((param) => param.id === 'drive')!

    expect(DEFAULT_MASTER_SETTINGS.filter).toBe(filter.max)
    expect(DEFAULT_MASTER_SETTINGS.drive).toBe(drive.min)
  })
})

describe('drive readout', () => {
  it('formats as a whole percent, like a hardware amount dial', () => {
    const drive = MASTER_PARAMS.find((param) => param.id === 'drive')!

    expect(formatParam(drive, 35.4)).toBe('35 %')
  })
})

describe('setMasterParam', () => {
  it('sets one macro and leaves the other alone', () => {
    const settings = setMasterParam(DEFAULT_MASTER_SETTINGS, 'filter', 800)

    expect(settings.filter).toBe(800)
    expect(settings.drive).toBe(DEFAULT_MASTER_SETTINGS.drive)
    expect(DEFAULT_MASTER_SETTINGS.filter).not.toBe(800)
  })

  it('clamps to the knob’s range so no value can drive the bus out of bounds', () => {
    expect(setMasterParam(DEFAULT_MASTER_SETTINGS, 'drive', 1e6).drive).toBe(100)
    expect(setMasterParam(DEFAULT_MASTER_SETTINGS, 'drive', -5).drive).toBe(0)
  })
})

describe('createMasterSettings', () => {
  it('defaults every macro when nothing was saved', () => {
    expect(createMasterSettings(undefined)).toEqual(DEFAULT_MASTER_SETTINGS)
    expect(createMasterSettings({ nonsense: true })).toEqual(DEFAULT_MASTER_SETTINGS)
  })

  it('keeps saved macro values, repairing any that are missing or out of range', () => {
    const restored = createMasterSettings({ filter: 800, drive: 1e6 })

    expect(restored.filter).toBe(800)
    expect(restored.drive).toBe(100)
  })
})

describe('masterBusParams', () => {
  it('is bit-transparent at rest: filter wide open and the drive stage fully dry', () => {
    const bus = masterBusParams(DEFAULT_MASTER_SETTINGS)

    expect(bus.cutoff).toBe(18_000)
    expect(bus.wet).toBe(0)
  })

  it('fades saturation in with the knob, fully wet and hard-driven at the top', () => {
    const half = masterBusParams({ ...DEFAULT_MASTER_SETTINGS, drive: 50 })
    const full = masterBusParams({ ...DEFAULT_MASTER_SETTINGS, drive: 100 })

    expect(half.wet).toBeCloseTo(0.5)
    expect(full.wet).toBe(1)
    expect(half.distortion).toBeGreaterThan(0)
    expect(full.distortion).toBeGreaterThan(half.distortion)
    expect(full.distortion).toBeLessThanOrEqual(1)
  })

  it('passes the filter cutoff through to the bus', () => {
    expect(masterBusParams({ ...DEFAULT_MASTER_SETTINGS, filter: 640 }).cutoff).toBe(640)
  })
})
