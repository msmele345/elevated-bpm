import { useEffect, useId, useRef, useState } from 'react'
import { BUNDLE_FILE_EXTENSION } from '../model/bundle'

interface ShareMenuProps {
  /** The deck has hydrated: there is a real project to share. */
  shareReady: boolean
  isSharing: boolean
  /** Assembling a bundle reads audio out of storage, so it is not instant. */
  isBundling: boolean
  sharedUrl: string | null
  copied: boolean
  onShare: () => void
  onExportBundle: () => void
  onOpenBundle: (file: File) => void
}

/**
 * Share ▾: the header's way out for a beat — a link, a bundle out, a bundle in —
 * folded behind one button so sharing is a click away without permanently
 * standing between the user and the instrument.
 *
 * A disclosure rather than an ARIA menu: it holds a file picker and a URL field,
 * which a `role="menu"` may not. Escape and a press anywhere outside put it
 * away; Escape hands focus back to the trigger it came from.
 */
export function ShareMenu({
  shareReady,
  isSharing,
  isBundling,
  sharedUrl,
  copied,
  onShare,
  onExportBundle,
  onOpenBundle,
}: ShareMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const putAwayOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', putAwayOnOutsidePress)
    return () => document.removeEventListener('pointerdown', putAwayOnOutsidePress)
  }, [open])

  return (
    <div
      className="share-menu"
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        event.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }}
    >
      <button
        type="button"
        ref={triggerRef}
        className="share-menu-trigger"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        // Nothing in the menu can work on the placeholder document the deck
        // mounts with, so the menu waits for the real one.
        disabled={!shareReady}
        onClick={() => setOpen((was) => !was)}
      >
        Share
        <span className="share-menu-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="share-menu-panel" id={panelId}>
          <div className="share-action">
            <span className="share-action-label">LINK OUT</span>
            <button
              type="button"
              className="share-button"
              aria-label="Share beat"
              disabled={isSharing}
              onClick={onShare}
            >
              {isSharing ? 'Encoding…' : 'Share beat'}
            </button>
            <p className="share-hint">
              A link carries the programming. Uploaded audio is far too large for a URL.
            </p>
          </div>

          <div className="share-action">
            <span className="share-action-label">BUNDLE</span>
            <div className="share-bundle-controls">
              <button
                type="button"
                className="share-button"
                disabled={isBundling}
                onClick={onExportBundle}
              >
                {isBundling ? 'Packing…' : 'Export bundle'}
              </button>
              <label className="share-bundle-open">
                <span className="share-bundle-open-label">Open a bundle</span>
                <input
                  type="file"
                  accept={BUNDLE_FILE_EXTENSION}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    // Clear the control either way, so choosing the same file again
                    // is still a change the browser will report.
                    event.target.value = ''
                    if (!file) return
                    // The beat arrives as a preview strip that asks for a decision;
                    // the menu steps aside so that strip is what the user sees.
                    setOpen(false)
                    onOpenBundle(file)
                  }}
                />
              </label>
            </div>
            {/*
              Sampling on your own machine is your own business; a bundle makes
              passing the audio on a feature of the product. One line, where the
              export happens, is the whole of what that warrants.
            */}
            <p className="share-hint">
              A bundle carries your sounds with it — only send audio you have the right to share.
            </p>
          </div>

          {sharedUrl && (
            <div className="share-result" role="status">
              {copied ? (
                <span>Share URL copied to your clipboard.</span>
              ) : (
                <label>
                  Copy this share URL
                  <input
                    type="text"
                    readOnly
                    value={sharedUrl}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </label>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
