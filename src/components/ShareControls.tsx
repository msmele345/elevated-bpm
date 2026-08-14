import { BUNDLE_FILE_EXTENSION } from '../model/bundle'

interface ShareControlsProps {
  previewing: boolean
  errorMessage: string | null
  shareReady: boolean
  isSharing: boolean
  /** Assembling a bundle reads audio out of storage, so it is not instant. */
  isBundling: boolean
  sharedUrl: string | null
  copied: boolean
  /** What an incoming beat could not bring with it, when anything could not. */
  degradedNotice: string | null
  onShare: () => void
  onExportBundle: () => void
  onOpenBundle: (file: File) => void
  onKeep: () => void
  onRestore: () => void
  onDismissError: () => void
}

export function ShareControls({
  previewing,
  errorMessage,
  shareReady,
  isSharing,
  isBundling,
  sharedUrl,
  copied,
  degradedNotice,
  onShare,
  onExportBundle,
  onOpenBundle,
  onKeep,
  onRestore,
  onDismissError,
}: ShareControlsProps) {
  return (
    <section className="share-controls" aria-label="Share beat">
      <div className="share-action">
        <span className="share-action-label">LINK OUT</span>
        <button
          type="button"
          className="share-button"
          aria-label="Share beat"
          disabled={!shareReady || isSharing}
          onClick={onShare}
        >
          {!shareReady ? 'Loading…' : isSharing ? 'Encoding…' : 'Share beat'}
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
            disabled={!shareReady || isBundling}
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
                if (file) onOpenBundle(file)
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

      {previewing && (
        <div className="share-notice is-preview" role="status">
          <div>
            <strong>Shared beat preview</strong>
            <p>Your saved project is untouched until you choose to keep this beat.</p>
            {degradedNotice && <p className="share-degraded">{degradedNotice}</p>}
          </div>
          <div className="share-notice-actions">
            <button type="button" className="share-keep" onClick={onKeep}>
              Keep this beat
            </button>
            <button type="button" className="share-restore" onClick={onRestore}>
              Back to my project
            </button>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="share-notice is-error" role="alert">
          <p>{errorMessage}</p>
          <button type="button" className="share-restore" onClick={onDismissError}>
            Dismiss
          </button>
        </div>
      )}

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
    </section>
  )
}
