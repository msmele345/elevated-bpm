interface ShareStripsProps {
  previewing: boolean
  errorMessage: string | null
  /** What an incoming beat could not bring with it, when anything could not. */
  degradedNotice: string | null
  onKeep: () => void
  onRestore: () => void
  onDismissError: () => void
}

/**
 * The share strips that ask for a decision: an incoming beat's "keep it or go
 * back" and any link or bundle error. They are event-driven, full-width, and
 * never folded into the Share menu — a choice the user must make is never
 * hidden behind a click.
 */
export function ShareStrips({
  previewing,
  errorMessage,
  degradedNotice,
  onKeep,
  onRestore,
  onDismissError,
}: ShareStripsProps) {
  if (!previewing && !errorMessage) return null
  return (
    <div className="share-strips">
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
    </div>
  )
}
