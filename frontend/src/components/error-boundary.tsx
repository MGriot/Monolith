import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Render a compact message inside the page instead of taking over the whole screen. */
  inline?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Stops a render error in one component from blanking the whole app (the cause of the "white screen" bugs
 * fixed in the last few commits). Mount it with a `key` that changes on navigation so it resets by itself.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className={
          this.props.inline
            ? 'flex flex-col items-center justify-center gap-3 p-10 text-center'
            : 'flex min-h-screen flex-col items-center justify-center gap-3 p-10 text-center'
        }
      >
        <AlertTriangle className="h-10 w-10 text-amber-500" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-slate-800">Something went wrong on this page</h2>
        <p className="max-w-md text-sm text-slate-500">
          The rest of the app is still working. You can try again, or reload if the problem persists.
        </p>
        <pre className="max-h-24 max-w-xl overflow-auto rounded bg-slate-100 p-2 text-left text-xs text-slate-600">
          {this.state.error.message}
        </pre>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={this.reset}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
