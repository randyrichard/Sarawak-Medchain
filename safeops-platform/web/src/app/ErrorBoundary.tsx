import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCw, Home } from 'lucide-react'

interface Props {
  children: ReactNode
  /** Optional label so nested boundaries can say what failed (e.g. "the Training module"). */
  scope?: string
}
interface State {
  error: Error | null
}

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
    console.error('[SafeOps] Unhandled UI error:', error, info.componentStack)
  }

  private reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const scope = this.props.scope

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
          {scope ? `${scope} hit a problem` : 'Something went wrong'}
        </h1>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-2">
          The screen stopped responding after an unexpected error. Your data is safe — nothing was
          lost. You can retry this view or return to Mission Control.
        </p>

        <pre className="mt-4 max-w-md overflow-x-auto rounded-lg border px-3.5 py-2.5 text-left font-mono text-2xs text-ink-2">
          {error.message || String(error)}
        </pre>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          <button
            onClick={this.reset}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition-colors"
            style={{ background: 'var(--accent)' }}
          >
            <RotateCw size={14} /> Try again
          </button>
          <button
            onClick={() => { window.location.href = '/' }}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-semibold text-ink-2 transition-colors hover:bg-accent-soft"
          >
            <Home size={14} /> Back to Mission Control
          </button>
        </div>
      </div>
    )
  }
}
