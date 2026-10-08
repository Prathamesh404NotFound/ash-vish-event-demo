import React from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '../../components/Button';
import type { ExportFormat } from '../../lib/exportFile';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/Dialog/Dialog';


export interface ExportSetup {
  title: string;
  format: ExportFormat;
  columns: string[];
  defaultColumns: string[];
}

interface ColumnCheckbox {
  id: string;
  label: string;
  checked: boolean;
}

export interface ExportSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setup: ExportSetup;
  onConfirm: (columns: string[], format: ExportFormat) => void;
}

export const ExportSetupDialog: React.FC<ExportSetupDialogProps> = ({
  open,
  onOpenChange,
  setup,
  onConfirm,
}) => {
  const [columns, setColumns] = React.useState<ColumnCheckbox[]>(() =>
    setup.defaultColumns.map((id) => ({ id, label: id, checked: setup.columns.includes(id) }))
  );
  const [format, setFormat] = React.useState<ExportFormat>(setup.format);

  React.useEffect(() => {
    setColumns(
      setup.defaultColumns.map((id) => ({
        id,
        label: id,
        checked: setup.columns.includes(id),
      }))
    );
    setFormat(setup.format);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (id: string) => {
    setColumns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, checked: !c.checked } : c))
    );
  };

  const selectAll = () => setColumns((prev) => prev.map((c) => ({ ...c, checked: true })));
  const clearAll = () => setColumns((prev) => prev.map((c) => ({ ...c, checked: false })));

  const selectedCount = columns.filter((c) => c.checked).length;

  const confirm = () => {
    onConfirm(columns.filter((c) => c.checked).map((c) => c.id), format);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#D4AF37]">
            <Download className="w-5 h-5" />
            {setup.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400 mr-1">Format:</span>
            <button
              type="button"
              onClick={() => setFormat('csv')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                format === 'csv'
                  ? 'bg-[#D4AF37] text-black'
                  : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              type="button"
              onClick={() => setFormat('excel')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                format === 'excel'
                  ? 'bg-[#D4AF37] text-black'
                  : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
            </button>
          </div>

          <div className="flex items-center justify-between text-sm text-gray-400">
            <span>{selectedCount} of {columns.length} selected</span>
            <div className="flex gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={selectAll}
                className="text-[#D4AF37] hover:bg-[#D4AF37]/10"
              >
                Select all
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="text-gray-400 hover:text-white"
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-[#0e0e0e] p-2 space-y-1">
            {columns.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-white/5 cursor-pointer transition-all"
              >
                <input
                  type="checkbox"
                  checked={c.checked}
                  onChange={() => toggle(c.id)}
                  className="h-4 w-4 rounded border-white/20 bg-[#1a1a1a] accent-[#D4AF37] text-[#D4AF37] focus:ring-[#D4AF37]/50"
                />
                <span className="text-sm text-gray-200">{c.label}</span>
              </label>
            ))}
          </div>
        </div>

        <DialogFooter className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-gray-400">
            Cancel
          </Button>
          <Button
            onClick={confirm}
            disabled={selectedCount === 0}
            className="bg-[#D4AF37] hover:bg-[#F3E5AB] text-black"
          >
            Export ({selectedCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
