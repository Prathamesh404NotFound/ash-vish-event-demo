// @ts-nocheck
import React from 'react';
import { Ticket, RefreshCw, Home, AlertTriangle } from 'lucide-react';

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
 * no longer goes blank — a branded fallback with retry options is shown.
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
      <div className="min-h-screen bg-[#070707] flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-3xl bg-[#121214] border border-white/[0.06] p-8 sm:p-10 text-center space-y-5">
          {/* Icon */}
          <div className="relative mx-auto w-16 h-16">
            <div className="absolute inset-0 rounded-2xl bg-[#D4AF37]/5 blur-xl scale-150" />
            <div className="relative w-full h-full rounded-2xl bg-[#1A1A1C] border border-white/[0.08] flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-[#D4AF37]" strokeWidth={1.5} />
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <h1 className="font-heading font-bold text-xl text-white leading-snug">
              Something went wrong
            </h1>
            <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">
              We hit an unexpected error while loading this page. Your data is safe — this is a display issue.
            </p>
          </div>

          {/* Error Details (collapsed) */}
          {error && (
            <details className="group">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400 transition-colors select-none">
                Technical details
              </summary>
              <div className="mt-2 p-3 bg-[#0D0D0F] rounded-xl border border-white/[0.04] text-left">
                <p className="text-[10px] font-mono text-gray-500 break-all leading-relaxed">
                  {error.toString()}
                </p>
              </div>
            </details>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
            <button
              onClick={() => window.location.reload()}
              className="group w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#E3C456] text-black font-bold text-xs flex items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500" />
              Reload page
            </button>
            <button
              onClick={() => window.location.href = '/'}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] text-gray-300 font-semibold text-xs flex items-center justify-center gap-2 border border-white/[0.08] transition-all duration-200"
            >
              <Home className="w-3.5 h-3.5" />
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
