interface ShareControlsProps {
  previewing: boolean
  errorMessage: string | null
  shareReady: boolean
  isSharing: boolean
  sharedUrl: string | null
  copied: boolean
  onShare: () => void
  onKeep: () => void
  onRestore: () => void
  onDismissError: () => void
}

export function ShareControls({
  previewing,
  errorMessage,
  shareReady,
  isSharing,
  sharedUrl,
  copied,
  onShare,
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
      </div>

      {previewing && (
        <div className="share-notice is-preview" role="status">
          <div>
            <strong>Shared beat preview</strong>
            <p>Your saved project is untouched until you choose to keep this beat.</p>
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
