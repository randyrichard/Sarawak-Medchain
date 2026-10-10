import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'

interface Props {
  children: ReactNode
  /** Optional label so nested boundaries can say what failed (e.g. "the Training module"). */
  scope?: string
}
interface State {
  error: Error | null
}

/**
 * Is this the "you are running last week's build" error?
 *
 * Routes are lazy-loaded, and Vite fingerprints every chunk. After a deploy the old
 * filenames stop existing, so any tab still holding the previous index.html fails the
 * moment somebody navigates to a route they had not already visited. The browser reports
 * it differently per engine, hence the three shapes.
 */
function isStaleChunkError(error: Error): boolean {
  const m = `${error?.message ?? ''}`
  return /Failed to fetch dynamically imported module/i.test(m)      // Chrome, Edge
    || /error loading dynamically imported module/i.test(m)          // Firefox
    || /Importing a module script failed/i.test(m)                   // Safari
}

/**
 * One automatic reload, remembered for the tab.
 *
 * A reload fixes a stale chunk completely - it fetches the current index.html and the
 * filenames it names. Doing it automatically means an ordinary deploy is invisible to
 * whoever is mid-session rather than showing them a crash screen.
 *
 * sessionStorage, not a counter in memory: the reload destroys memory. And it is a guard
 * against a reload loop, which is the one way this could be worse than the bug - if the
 * second load fails too, the cause is not staleness and the user sees the normal message.
 */
const RELOAD_KEY = 'safeops.staleChunkReload'

/**
 * App-wide safety net. A render/lifecycle error in any child unmounts that subtree
 * and shows a recoverable fallback instead of a blank white screen. Uses raw CSS
 * variables (not the UI kit) so the fallback still renders even if a shared
 * component is what threw.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No telemetry backend yet — surface it in the console for now so it is never silent.
    console.error('[SafeChain] Unhandled UI error:', error, info.componentStack)

    /*
     * A stale chunk is not a bug in the screen that failed - it is a deploy that happened
     * underneath an open tab. Reload once and the user never learns it occurred.
     */
    if (isStaleChunkError(error) && !sessionStorage.getItem(RELOAD_KEY)) {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
      window.location.reload()
    }
  }

  /*
   * Clearing the error re-renders the same subtree, which is right for a transient render
   * failure and useless for a missing chunk: the import is retried, the file is still gone,
   * and it fails identically. That is what the button used to do here, so the one recovery
   * offered could never work for the most likely error in production.
   */
  private reset = () => {
    if (this.state.error && isStaleChunkError(this.state.error)) {
      sessionStorage.removeItem(RELOAD_KEY)
      window.location.reload()
      return
    }
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const scope = this.props.scope
    /*
     * A stale chunk gets its own wording. Calling a routine deployment "an unexpected
     * error" invites a support ticket for something that is not wrong with anything, and
     * "your data is safe" reads as alarming rather than reassuring when nothing was ever at
     * risk. Reaching this screen at all means the automatic reload already ran and did not
     * settle it, so the button is the manual version of the same thing.
     */
    const stale = isStaleChunkError(error)

    return (
      <div
        role="alert"
        className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-12 text-center"
      >
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}
        >
          <AlertTriangle size={26} />
        </div>
        <h1 className="mt-5 text-lg font-semibold tracking-tight text-ink">
          {stale
            ? 'A new version of SafeChain is available'
            : scope ? `${scope} hit a problem` : 'Something went wrong'}
        </h1>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-2">
          {stale
            ? 'SafeChain was updated while this tab was open, so part of the old version is no '
              + 'longer available. Reload to pick up the new one — nothing you were working on '
              + 'has been lost.'
            : 'The screen stopped responding after an unexpected error. Your data is safe — '
              + 'nothing was lost. You can retry this view or return to Home.'}
        </p>

        {/* Focusable, so a long message that scrolls sideways can be scrolled from the keyboard. */}
        <pre tabIndex={0} aria-label="Error details" className="mt-4 max-w-md relative overflow-x-auto rounded-lg border px-3.5 py-2.5 text-left font-mono text-2xs text-ink-2">
          {error.message || String(error)}
        </pre>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          <button
            onClick={this.reset}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition-colors"
            style={{ background: 'var(--accent-solid)' }}
          >
            <RotateCw size={14} aria-hidden /> {stale ? 'Reload' : 'Try again'}
          </button>
          <button
            onClick={() => { window.location.href = '/' }}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-semibold text-ink-2 transition-colors hover:bg-accent-soft"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }
}
