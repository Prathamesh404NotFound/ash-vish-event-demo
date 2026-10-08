import React from 'react';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

/** Backdrop wrapper: click outside (or Escape) closes the dialog. */
export const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, children }) => {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in"
      onClick={() => onOpenChange(false)}
      role="dialog"
      aria-modal="true"
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
};

interface DialogContentProps {
  className?: string;
  children: React.ReactNode;
}

export const DialogContent: React.FC<DialogContentProps> = ({ className = '', children }) => (
  <div
    className={`bg-[#181818] border border-[#D4AF37]/30 rounded-3xl p-5 sm:p-7 max-w-lg w-full max-h-[calc(100dvh-2rem)] overflow-y-auto shadow-2xl relative ${className}`}
  >
    {children}
  </div>
);

export const DialogHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="border-b border-white/10 pb-4 mb-4">{children}</div>
);

export const DialogTitle: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className = '',
  children,
}) => (
  <h3 className={`font-heading font-bold text-lg text-white ${className}`}>{children}</h3>
);

export const DialogFooter: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className = '',
  children,
}) => <div className={`border-t border-white/10 pt-4 mt-4 ${className}`}>{children}</div>;
