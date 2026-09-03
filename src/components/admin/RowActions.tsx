import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, X } from 'lucide-react';

export interface RowAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'warning' | 'success';
  disabled?: boolean;
}

interface RowActionsProps {
  actions: RowAction[];
  /** Optional key to force-close the menu when the row re-renders */
  closeKey?: string;
}

/**
 * A compact three-dot (⋮) overflow menu for table row actions.
 * Clicking the ⋮ icon opens a small dropdown with all action items.
 * Clicking outside or pressing Escape closes it.
 */
export const RowActions: React.FC<RowActionsProps> = ({ actions, closeKey }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close when the row data changes (e.g. after an action completes)
  useEffect(() => {
    setOpen(false);
  }, [closeKey]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-xl bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
        aria-label="Actions"
        aria-expanded={open}
      >
        {open ? <X className="w-4 h-4" /> : <MoreVertical className="w-4 h-4" />}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-[#1C1C1C] border border-white/10 rounded-2xl shadow-2xl py-1.5 animate-in fade-in">
          {actions.map((action, idx) => (
            <button
              key={idx}
              onClick={() => {
                action.onClick();
                setOpen(false);
              }}
              disabled={action.disabled}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold transition-colors cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed ${
                action.variant === 'danger'
                  ? 'text-red-400 hover:bg-red-500/10'
                  : action.variant === 'warning'
                    ? 'text-amber-400 hover:bg-amber-500/10'
                    : action.variant === 'success'
                      ? 'text-emerald-400 hover:bg-emerald-500/10'
                      : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default RowActions;
