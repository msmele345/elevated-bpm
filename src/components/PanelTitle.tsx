import type { ReactNode } from 'react'
import { sectionTitleId } from '../model/deckSections'

interface PanelTitleProps {
  /** The deck section this titles; the heading takes its derived id. */
  sectionId: string
  /** The instrument's name, silkscreened on the panel. */
  name: string
  /** Its model number, the way hardware wears one. */
  model: string
  /** Controls that belong on the plate itself — an instrument's mixer strip. */
  children?: ReactNode
}

/**
 * The name/model plate every panel wears. The name is a real heading, so the
 * silkscreen a sighted user reads and the outline a screen reader navigates by
 * are the same thing rather than two descriptions that can drift apart.
 */
export function PanelTitle({ sectionId, name, model, children }: PanelTitleProps) {
  return (
    <div className={children ? 'panel-title has-controls' : 'panel-title'}>
      <h2 className="panel-title-name" id={sectionTitleId(sectionId)}>
        {name}
      </h2>
      <span className="panel-title-model">{model}</span>
      {children}
    </div>
  )
}
