import { sectionTitleId } from '../model/deckSections'

interface PanelTitleProps {
  /** The deck section this titles; the heading takes its derived id. */
  sectionId: string
  /** The instrument's name, silkscreened on the panel. */
  name: string
  /** Its model number, the way hardware wears one. */
  model: string
}

/**
 * The name/model plate every panel wears. The name is a real heading, so the
 * silkscreen a sighted user reads and the outline a screen reader navigates by
 * are the same thing rather than two descriptions that can drift apart.
 */
export function PanelTitle({ sectionId, name, model }: PanelTitleProps) {
  return (
    <div className="panel-title">
      <h2 className="panel-title-name" id={sectionTitleId(sectionId)}>
        {name}
      </h2>
      <span className="panel-title-model">{model}</span>
    </div>
  )
}
