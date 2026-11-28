export const EXPENSE_CATEGORIES: Record<string, string[]> = {
  Housing: ['Rent', 'Electricity', 'Gas', 'Internet', 'Household expenses'],
  Education: ['University Tuition', 'University Fees', 'English Course', 'Books and Materials'],
  Transportation: ['Fuel', 'Public Transport', 'Car Rental', 'Car Insurance', 'Registration'],
  Groceries: ['Supermarket', 'Restaurants', 'Coffee', 'Food Delivery'],
  Personal: ['Clothing', 'Beauty', 'Haircare', 'Health', 'Entertainment'],
  Financial: ['Loan Payments', 'Bank Fees', 'Subscriptions', 'Interest', 'Card Fees'],
  Other: ['Brazil Expenses', 'Family Support', 'Unexpected Expenses'],
};

export const INCOME_SOURCES = ['Salary', 'Cleaning Business', 'Government', 'Refund', 'Other Income'];

export const PAYMENT_METHODS = ['Debit card', 'Bank transfer', 'BPAY', 'Direct debit', 'Cash', 'Credit card'];

// Fixed category -> palette slot (colour follows the entity, never its rank).
export const CATEGORY_COLORS: Record<string, string> = {
  Housing: 'var(--s1)',
  Education: 'var(--s2)',
  Transportation: 'var(--s3)',
  Groceries: 'var(--s4)',
  Personal: 'var(--s5)',
  Financial: 'var(--s6)',
  Other: 'var(--s7)',
};

export const categoryNames = Object.keys(EXPENSE_CATEGORIES);

/** Budget keys: "Groceries" (whole category) or "Groceries › Coffee" (one subcategory). */
export const SUB_SEP = ' › ';
export const budgetKey = (category: string, sub?: string) => (sub ? `${category}${SUB_SEP}${sub}` : category);
export function parseBudgetKey(key: string): { category: string; subcategory?: string } {
  const i = key.indexOf(SUB_SEP);
  return i === -1 ? { category: key } : { category: key.slice(0, i), subcategory: key.slice(i + SUB_SEP.length) };
}

/** Built-in subcategories plus the ones we created, minus the ones we removed. */
export function subcategoriesFor(category: string, settings?: { customSubcategories?: Record<string, string[]>; hiddenSubcategories?: Record<string, string[]> }): string[] {
  const base = EXPENSE_CATEGORIES[category] ?? [];
  const extra = (settings?.customSubcategories?.[category] ?? []).filter((s) => !base.includes(s));
  const hidden = new Set(settings?.hiddenSubcategories?.[category] ?? []);
  return [...base, ...extra].filter((s) => !hidden.has(s));
}

export const isBuiltInSubcategory = (category: string, sub: string) => (EXPENSE_CATEGORIES[category] ?? []).includes(sub);

/**
 * Soft pastel look per category (Tailwind class names written in full so the
 * build keeps them). Category = tinted card; subcategories = lighter rows.
 */
export interface CategoryTheme {
  emoji: string;
  card: string; // category container
  chip: string; // emoji bubble / count badge
  title: string; // category title text
  sub: string; // subcategory row
  bar: string; // progress fill
  track: string; // progress background
  button: string; // soft action button
}

const theme = (emoji: string, c: string): CategoryTheme => THEMES[c](emoji);
const THEMES: Record<string, (e: string) => CategoryTheme> = {
  sky: (emoji) => ({ emoji, card: 'bg-sky-50/80 border-sky-100 dark:bg-sky-950/30 dark:border-sky-900/40', chip: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-200', title: 'text-sky-900 dark:text-sky-100', sub: 'bg-white/80 border-sky-100 dark:bg-slate-900/50 dark:border-sky-900/40', bar: 'bg-sky-300 dark:bg-sky-400/80', track: 'bg-sky-100/80 dark:bg-sky-900/40', button: 'bg-white text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100 dark:bg-sky-900/40 dark:text-sky-100 dark:ring-sky-800' }),
  violet: (emoji) => ({ emoji, card: 'bg-violet-50/80 border-violet-100 dark:bg-violet-950/30 dark:border-violet-900/40', chip: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-200', title: 'text-violet-900 dark:text-violet-100', sub: 'bg-white/80 border-violet-100 dark:bg-slate-900/50 dark:border-violet-900/40', bar: 'bg-violet-300 dark:bg-violet-400/80', track: 'bg-violet-100/80 dark:bg-violet-900/40', button: 'bg-white text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100 dark:bg-violet-900/40 dark:text-violet-100 dark:ring-violet-800' }),
  emerald: (emoji) => ({ emoji, card: 'bg-emerald-50/80 border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/40', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200', title: 'text-emerald-900 dark:text-emerald-100', sub: 'bg-white/80 border-emerald-100 dark:bg-slate-900/50 dark:border-emerald-900/40', bar: 'bg-emerald-300 dark:bg-emerald-400/80', track: 'bg-emerald-100/80 dark:bg-emerald-900/40', button: 'bg-white text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-100 dark:ring-emerald-800' }),
  amber: (emoji) => ({ emoji, card: 'bg-amber-50/80 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900/40', chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200', title: 'text-amber-900 dark:text-amber-100', sub: 'bg-white/80 border-amber-100 dark:bg-slate-900/50 dark:border-amber-900/40', bar: 'bg-amber-300 dark:bg-amber-400/80', track: 'bg-amber-100/80 dark:bg-amber-900/40', button: 'bg-white text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-100 dark:ring-amber-800' }),
  rose: (emoji) => ({ emoji, card: 'bg-rose-50/80 border-rose-100 dark:bg-rose-950/30 dark:border-rose-900/40', chip: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200', title: 'text-rose-900 dark:text-rose-100', sub: 'bg-white/80 border-rose-100 dark:bg-slate-900/50 dark:border-rose-900/40', bar: 'bg-rose-300 dark:bg-rose-400/80', track: 'bg-rose-100/80 dark:bg-rose-900/40', button: 'bg-white text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 dark:bg-rose-900/40 dark:text-rose-100 dark:ring-rose-800' }),
  teal: (emoji) => ({ emoji, card: 'bg-teal-50/80 border-teal-100 dark:bg-teal-950/30 dark:border-teal-900/40', chip: 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-200', title: 'text-teal-900 dark:text-teal-100', sub: 'bg-white/80 border-teal-100 dark:bg-slate-900/50 dark:border-teal-900/40', bar: 'bg-teal-300 dark:bg-teal-400/80', track: 'bg-teal-100/80 dark:bg-teal-900/40', button: 'bg-white text-teal-700 ring-1 ring-teal-200 hover:bg-teal-100 dark:bg-teal-900/40 dark:text-teal-100 dark:ring-teal-800' }),
  slate: (emoji) => ({ emoji, card: 'bg-slate-50 border-slate-200/70 dark:bg-slate-800/40 dark:border-slate-700/60', chip: 'bg-slate-200/70 text-slate-700 dark:bg-slate-700 dark:text-slate-200', title: 'text-slate-800 dark:text-slate-100', sub: 'bg-white/80 border-slate-200/70 dark:bg-slate-900/50 dark:border-slate-700/60', bar: 'bg-slate-300 dark:bg-slate-400/80', track: 'bg-slate-200/70 dark:bg-slate-700/60', button: 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700' }),
};

export const CATEGORY_THEME: Record<string, CategoryTheme> = {
  Housing: theme('🏠', 'sky'),
  Education: theme('🎓', 'violet'),
  Transportation: theme('🚗', 'emerald'),
  Groceries: theme('🛒', 'amber'),
  Personal: theme('💅', 'rose'),
  Financial: theme('💳', 'teal'),
  Other: theme('📦', 'slate'),
};
export const themeFor = (category: string) => CATEGORY_THEME[category] ?? CATEGORY_THEME.Other;
