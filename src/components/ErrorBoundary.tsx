// @ts-nocheck
import React from 'react';
import { Ticket, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

/**
 * Catch-all runtime error boundary. If any descendant component throws
 * (e.g. a TypeError from a malformed database record), the whole page
 * no longer goes blank — a branded fallback with a retry button is shown.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught rendering error:', error, info);
  }

  render(): React.ReactNode {
    const { hasError, error } = this.state;
    const { children } = this.props;
    if (!hasError) return children;
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-3xl bg-[#141414] border border-white/10 p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center mx-auto">
            <Ticket className="w-7 h-7 text-[#D4AF37]" />
          </div>
          <h1 className="font-heading font-extrabold text-xl text-white">
            Something went wrong on this page
          </h1>
          <p className="text-xs text-gray-400 leading-relaxed">
            We encountered an unexpected error while loading this view. Please
            try reloading — if the problem persists, contact support.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-bold text-xs flex items-center gap-2 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload page
            </button>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/15 transition-all"
            >
              Try again
            </button>
          </div>
          {error && (
            <p className="text-[10px] font-mono text-gray-500 break-all">
              {error.toString()}
            </p>
          )}
        </div>
      </div>
    );
  }
}
