import { levelParamForVoice, type LevelParamId, type VoiceId } from '../model/mixer'
import { Knob } from './Knob'

interface VoiceMixStripProps<Id extends VoiceId> {
  voiceId: Id
  /** The voice's name, as its lane or panel prints it. */
  label: string
  muted: boolean
  soloed: boolean
  level: number
  /** The active lesson is pointing at this voice's Level knob. */
  levelSpotlit?: boolean
  /** Named callbacks, so a deck can hand every strip the same three handlers. */
  onToggleMute: (voiceId: Id) => void
  onToggleSolo: (voiceId: Id) => void
  onLevelChange: (id: LevelParamId, value: number) => void
}

/**
 * One voice's mixer strip: mute, solo and Level, side by side, the way a
 * channel strip keeps the controls for one sound in one place. The same strip
 * sits at the end of every drum and pad lane label and in the bass and stab
 * panel headers, so all eleven voices are mixed with one set of controls.
 */
export function VoiceMixStrip<Id extends VoiceId>({
  voiceId,
  label,
  muted,
  soloed,
  level,
  levelSpotlit = false,
  onToggleMute,
  onToggleSolo,
  onLevelChange,
}: VoiceMixStripProps<Id>) {
  return (
    <span className="lane-mix">
      <button
        type="button"
        className="lane-mix-btn is-mute"
        aria-pressed={muted}
        aria-label={`Mute ${label}`}
        onClick={() => onToggleMute(voiceId)}
      >
        M
      </button>
      <button
        type="button"
        className="lane-mix-btn is-solo"
        aria-pressed={soloed}
        aria-label={`Solo ${label}`}
        onClick={() => onToggleSolo(voiceId)}
      >
        S
      </button>
      <Knob
        spec={levelParamForVoice(voiceId)}
        value={level}
        size="small"
        spotlit={levelSpotlit}
        onChange={onLevelChange}
      />
    </span>
  )
}
