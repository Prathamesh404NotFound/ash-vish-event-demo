import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

export function ChunkErrorBoundary({ children }: Props) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const errorHandler = (event: ErrorEvent) => {
      // Catch chunk load failures (Failed to fetch dynamically imported module)
      if (
        event.message?.includes('Failed to fetch dynamically imported module') ||
        event.message?.includes('Loading chunk') ||
        event.message?.includes('Importing a module script failed')
      ) {
        console.warn('[ChunkErrorBoundary] Route chunk failed to load:', event.message);
        setHasError(true);
        event.preventDefault();
      }
    };
    window.addEventListener('error', errorHandler);
    return () => window.removeEventListener('error', errorHandler);
  }, []);

  const handleRetry = useCallback(() => {
    window.location.reload();
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white mb-2">Page Failed to Load</h2>
            <p className="text-sm text-gray-400">
              A required resource couldn't be loaded. This usually happens after a
              deployment. Please refresh the page.
            </p>
          </div>
          <button
            onClick={handleRetry}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#D4AF37] text-black font-bold text-sm hover:bg-[#E3C456] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
