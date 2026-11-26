import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Trash2, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

// Props interface for React error boundary container
interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

// State structure tracking caught runtime exception details and UI collapse states
interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
  copied: boolean;
}

// React error boundary intercepting unhandled client errors with diagnostic report recovery
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
    copied: false,
  };

  // Derives error boundary state when a child component throws an exception
  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  // Logs caught exception and captures React component stack trace
  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('FixCraft Client Error Caught by Boundary:', error, errorInfo);
  }

  // Triggers hard browser reload to recover application runtime
  private handleReload = () => {
    window.location.reload();
  };

  // Clears persisted session token and reloads application
  private handleResetSessionAndReload = () => {
    try {
      localStorage.removeItem('fixcraft_token');
    } catch {
      // Ignore storage access error
    }
    window.location.reload();
  };

  // Toggles expansion of technical stack trace details
  private toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  // Copies diagnostic trace and environment metadata to clipboard
  private handleCopyDiagnostics = async () => {
    const { error, errorInfo } = this.state;
    const diagnostics = [
      `Error: ${error?.name || 'Error'}: ${error?.message || 'Unknown error'}`,
      `Stack:\n${error?.stack || 'No stack trace available'}`,
      `Component Stack:\n${errorInfo?.componentStack || 'No component stack available'}`,
      `User Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}`,
      `Timestamp: ${new Date().toISOString()}`,
    ].join('\n\n');

    try {
      await navigator.clipboard.writeText(diagnostics);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // Ignore clipboard write failure
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorInfo, showDetails, copied } = this.state;

      return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-neutral-50 dark:bg-[#050505] text-neutral-900 dark:text-neutral-100 font-sans transition-colors">
          <div className="w-full max-w-xl bg-white dark:bg-[#0a0a0a] border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-lg bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-900 dark:text-neutral-100 shrink-0">
                <AlertTriangle className="w-6 h-6 text-neutral-900 dark:text-neutral-100" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
                  Client Application Error
                </h1>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 font-mono mt-0.5">
                  Runtime Boundary Intercept
                </p>
              </div>
            </div>

            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 mb-2">
              An unexpected client runtime error occurred.
            </p>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-6 leading-relaxed">
              FixCraft caught an unhandled exception during view rendering. Your local database and session data are safe. Choose an option below to recover.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reload Application
              </button>

              <button
                type="button"
                onClick={this.handleResetSessionAndReload}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-neutral-500" />
                Reset Session & Reload
              </button>
            </div>

            <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4">
              <button
                type="button"
                onClick={this.toggleDetails}
                className="w-full flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors py-1 cursor-pointer"
                aria-expanded={showDetails}
              >
                <span className="font-medium">
                  {showDetails ? 'Hide Diagnostics & Stack Trace' : 'Show Diagnostics & Stack Trace'}
                </span>
                {showDetails ? (
                  <ChevronUp className="w-4 h-4 text-neutral-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-neutral-500" />
                )}
              </button>

              {showDetails && (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-neutral-500">
                      Exception Detail
                    </span>
                    <button
                      type="button"
                      onClick={this.handleCopyDiagnostics}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-900 text-[11px] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Diagnostics</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 overflow-x-auto max-h-60 overflow-y-auto">
                    <p className="font-mono text-xs text-neutral-900 dark:text-neutral-100 font-bold mb-2">
                      {error?.name || 'Error'}: {error?.message || 'Unknown runtime error'}
                    </p>
                    {error?.stack && (
                      <pre className="font-mono text-[11px] text-neutral-600 dark:text-neutral-400 leading-relaxed whitespace-pre-wrap">
                        {error.stack}
                      </pre>
                    )}
                    {errorInfo?.componentStack && (
                      <div className="mt-3 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
                          Component Tree
                        </p>
                        <pre className="font-mono text-[10px] text-neutral-600 dark:text-neutral-400 leading-tight whitespace-pre-wrap">
                          {errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
