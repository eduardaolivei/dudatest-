/** Escape a value for CSV (quotes, commas, newlines) and guard against spreadsheet formula injection. */
function cell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

export function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCSV(name: string, headers: string[], rows: (string | number)[][]) {
  // BOM so Excel opens UTF-8 correctly
  downloadFile(name, '﻿' + toCSV(headers, rows), 'text/csv;charset=utf-8');
}
