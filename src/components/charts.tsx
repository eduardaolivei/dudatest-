import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { formatMoney } from '../domain/money';
import { monthLabel } from '../domain/dates';
import { CATEGORY_COLORS } from '../domain/categories';

// Shared chart styling. Colours come from CSS variables so dark mode works.
const axis = { stroke: 'var(--chart-axis)', fontSize: 11, tickLine: false, axisLine: false } as const;
const money = (v: number) => formatMoney(v, { short: true });

function ChartTooltip({ active, payload, label, labelFormatter }: TooltipProps<number, string> & { labelFormatter?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-1 font-semibold">{labelFormatter ? labelFormatter(String(label)) : label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: (p.color || (p.payload as { fill?: string })?.fill) as string }} />
          <span className="text-slate-600 dark:text-slate-300">{p.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums">{formatMoney(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

const ml = (k: string) => monthLabel(k, true);

/** Income vs Spending per month (grouped bars). */
export function IncomeExpenseChart({ data }: { data: { key: string; income: number; spending: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barGap={2} margin={{ left: -8, right: 4, top: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="key" tickFormatter={ml} {...axis} />
        <YAxis tickFormatter={money} width={64} {...axis} />
        <Tooltip content={<ChartTooltip labelFormatter={(l) => monthLabel(l)} />} cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar isAnimationActive={false} dataKey="income" name="Income" fill="var(--s1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar isAnimationActive={false} dataKey="spending" name="Spending" fill="var(--s2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Single series monthly spending. */
export function MonthlySpendingChart({ data }: { data: { key: string; spending: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ left: -8, right: 4, top: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="key" tickFormatter={ml} {...axis} />
        <YAxis tickFormatter={money} width={64} {...axis} />
        <Tooltip content={<ChartTooltip labelFormatter={(l) => monthLabel(l)} />} cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }} />
        <Bar isAnimationActive={false} dataKey="spending" name="Spending" fill="var(--s2)" radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars: magnitude comparison by category (easier to read than a pie). */
export function CategoryChart({ data }: { data: { category: string; amount: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 56 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="category" width={104} {...axis} fontSize={12} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }} />
        <Bar isAnimationActive={false} dataKey="amount" name="Spent" radius={[0, 4, 4, 0]} maxBarSize={20} label={{ position: 'right', formatter: money, fontSize: 11, fill: 'var(--chart-axis)' }}>
          {data.map((d) => <Cell key={d.category} fill={CATEGORY_COLORS[d.category] ?? 'var(--s8)'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Multi-line chart over months (e.g. net position, card balances). One y-axis only. */
export function LinesChart({ data, series, height = 220 }: { data: Record<string, string | number>[]; series: { key: string; name: string; color: string }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: -8, right: 8, top: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="key" tickFormatter={ml} {...axis} />
        <YAxis tickFormatter={money} width={64} {...axis} />
        <Tooltip content={<ChartTooltip labelFormatter={(l) => monthLabel(l)} />} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => (
          <Line isAnimationActive={false} key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, stroke: 'var(--chart-surface)', fill: s.color }} activeDot={{ r: 5 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
