import { useMemo, useState } from 'react';
import { useStore } from '../store/StoreContext';
import { REPORTS, buildReport, reportToCSVRows, type ReportId } from '../domain/reports';
import { addMonths, monthKey, startOfMonth } from '../domain/dates';
import { Money, PageHeader, Section } from '../components/ui';
import { IncomeExpenseChart } from '../components/charts';
import { Icon } from '../components/Icon';
import { downloadFile, toCSV } from '../components/exporters';

export default function Reports() {
  const { data, month, person } = useStore();
  const [id, setId] = useState<ReportId>('monthly');
  const [compare, setCompare] = useState(() => monthKey(addMonths(startOfMonth(month), -1, 1)));
  const report = useMemo(() => buildReport(id, data, month, person, compare + '-01'), [id, data, month, person, compare]);

  function exportCSV() {
    const rows = reportToCSVRows(report);
    downloadFile(`${report.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, '﻿' + toCSV([], rows).replace(/^\r\n/, ''), 'text/csv;charset=utf-8');
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        subtitle="Uses the month and person selected at the top."
        actions={
          <>
            <button className="btn-secondary" onClick={exportCSV}><Icon name="download" className="h-4 w-4" />CSV</button>
            <button className="btn-secondary" onClick={() => window.print()} title="Opens the print dialog — choose “Save as PDF”"><Icon name="download" className="h-4 w-4" />PDF</button>
          </>
        }
      />
      <div className="no-print flex flex-wrap items-end gap-2">
        <select className="input w-auto" value={id} onChange={(e) => setId(e.target.value as ReportId)} aria-label="Report">
          {REPORTS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        {id === 'compare' && (
          <label className="text-sm">
            <span className="label">Compare with</span>
            <input type="month" className="input w-auto" value={compare} onChange={(e) => e.target.value && setCompare(e.target.value)} />
          </label>
        )}
      </div>
      <p className="no-print text-xs muted">PDF: the button opens your browser's print dialog — pick “Save as PDF” (on iPhone: Share → Print → pinch out → Share/Save).</p>

      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold">{report.title}</h2>
          <p className="text-sm muted">{report.subtitle}{person !== 'all' ? ` · filtered: ${person === 'me' ? data.settings.myName : person === 'patrick' ? data.settings.partnerName : 'Joint'}` : ''}</p>
        </div>
        {report.chart && (
          <Section title="Income vs spending">
            <IncomeExpenseChart data={report.chart} />
          </Section>
        )}
        {report.tables.map((t) => (
          <Section key={t.title} title={t.title}>
            {t.rows.length === 0 ? (
              <p className="text-sm muted">No data recorded for this period.</p>
            ) : (
              <div className="-mx-4 overflow-x-auto px-4">
                <table className="w-full min-w-max text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs muted dark:border-slate-700">
                      {t.headers.map((h, i) => <th key={i} className={`py-2 pr-4 font-medium ${t.moneyCols?.includes(i) ? 'text-right' : ''}`}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {t.rows.map((row, ri) => (
                      <tr key={ri} className="border-b border-slate-100 dark:border-slate-800">
                        {row.map((v, i) => (
                          <td key={i} className={`py-2 pr-4 ${t.moneyCols?.includes(i) ? 'text-right tabular-nums' : ''}`}>
                            {t.moneyCols?.includes(i) && typeof v === 'number' ? <Money cents={v} /> : v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {t.totalRow && (
                    <tfoot>
                      <tr className="font-semibold">
                        {t.totalRow.map((v, i) => (
                          <td key={i} className={`py-2 pr-4 ${t.moneyCols?.includes(i) ? 'text-right tabular-nums' : ''}`}>
                            {t.moneyCols?.includes(i) && typeof v === 'number' ? <Money cents={v} /> : v}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </Section>
        ))}
      </div>
    </div>
  );
}
