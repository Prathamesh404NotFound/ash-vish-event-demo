/**
 * Shared download helpers for the export buttons.
 *
 * Every export in the app funnels through here so a "CSV" and an "Excel"
 * choice behave identically: CSV is written as RFC-4180 quoted text, Excel is
 * written as an HTML table workbook (mime application/vnd.ms-excel) which
 * Excel/WPS/Sheets open natively — no xlsx dependency required.
 */

export type ExportFormat = 'csv' | 'excel';

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

const escapeHtml = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/** Build a CSV or Excel workbook blob from a header list + row matrices. */
export const buildExportBlob = (
  headers: string[],
  rows: (string | number | null | undefined)[][],
  format: ExportFormat
): Blob => {
  if (format === 'excel') {
    const html =
      '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8" /></head><body><table border="1"><thead><tr>' +
      headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('') +
      '</tr></thead><tbody>' +
      rows
        .map(
          (r) =>
            `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`
        )
        .join('') +
      '</tbody></table></body></html>';
    return new Blob(['\ufeff' + html], {
      type: 'application/vnd.ms-excel;charset=utf-8;',
    });
  }
  const csv = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');
  return new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
};

/** Build the blob from an already-assembled CSV string (server responses). */
export const csvTextToBlob = (csv: string, format: ExportFormat): Blob => {
  if (format !== 'excel') return new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  // Naive RFC-4180 parser: our servers always quote every cell, so a state
  // machine over quotes/commas/newlines round-trips correctly.
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && csv[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [headers = [], ...body] = rows;
  return buildExportBlob(headers, body, 'excel');
};

/** Download a table in the chosen format with a stable filename. */
export const downloadTable = (
  headers: string[],
  rows: (string | number | null | undefined)[][],
  format: ExportFormat,
  baseName: string
) => {
  const ext = format === 'excel' ? 'xls' : 'csv';
  triggerDownload(buildExportBlob(headers, rows, format), `${baseName}.${ext}`);
};

/** Download raw CSV text (e.g. straight from an API) as CSV or Excel. */
export const downloadCsvText = (csv: string, format: ExportFormat, baseName: string) => {
  const ext = format === 'excel' ? 'xls' : 'csv';
  triggerDownload(csvTextToBlob(csv, format), `${baseName}.${ext}`);
};
