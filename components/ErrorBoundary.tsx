"use client";

import { Component, ErrorInfo, ReactNode } from "react";
import { RefreshCw } from "lucide-react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Catches render-time errors anywhere in the tree so a single failure (e.g.
 * malformed OCR markdown breaking the preview) shows a recovery affordance
 * instead of unmounting the whole UI to a blank page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("UI error boundary caught:", error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-cursor-bg flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-cursor-surface border border-red-500/30 rounded-2xl p-6 text-center">
          <h1 className="text-lg font-semibold text-cursor-text mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-cursor-muted mb-5">
            The interface hit an unexpected error. Your file was processed
            locally, so reloading is safe.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-cursor-border bg-cursor-bg hover:border-cursor-muted text-sm text-cursor-text transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        </div>
      </div>
    );
  }
}
