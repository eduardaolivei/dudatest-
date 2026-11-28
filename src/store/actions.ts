import type {
  AppData,
  Card,
  Cents,
  Goal,
  ISODate,
  RecurringRule,
  Transaction,
} from '../domain/types';
import { addMonths } from '../domain/dates';
import { splitCents } from '../domain/money';
import { budgetKey, isBuiltInSubcategory } from '../domain/categories';
import { uid } from './id';

// Pure "reducer-style" functions: (data, args) => new data. Never mutate.

type Collection = 'accounts' | 'cards' | 'transactions' | 'recurring' | 'goals' | 'purchases';
type Item<C extends Collection> = AppData[C][number];

export function upsert<C extends Collection>(data: AppData, col: C, item: Item<C>): AppData {
  const list = data[col] as Item<C>[];
  const exists = list.some((x) => x.id === item.id);
  return { ...data, [col]: exists ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item] };
}

export function remove<C extends Collection>(data: AppData, col: C, id: string): AppData {
  let next: AppData = { ...data, [col]: (data[col] as Item<C>[]).filter((x) => x.id !== id), deletedIds: tombstone(data, [id]) };
  // Keep data consistent: deleting an account/card/rule unlinks references.
  if (col === 'recurring') {
    next = { ...next, transactions: next.transactions.map((t) => (t.recurringId === id ? { ...t, recurringId: undefined, occurrence: undefined } : t)) };
  }
  return next;
}

export function newTx(p: Partial<Transaction> & Pick<Transaction, 'kind' | 'amount' | 'description' | 'date' | 'category' | 'person'>): Transaction {
  return { id: uid(), status: 'paid', createdAt: new Date().toISOString(), ...p };
}

export function duplicateTx(data: AppData, id: string, date: ISODate): AppData {
  const t = data.transactions.find((x) => x.id === id);
  if (!t) return data;
  const copy: Transaction = {
    ...t,
    id: uid(),
    date,
    dueDate: t.dueDate ? date : undefined,
    description: t.description,
    recurringId: undefined,
    occurrence: undefined,
    groupId: undefined,
    instalment: undefined,
    demo: undefined,
    createdAt: new Date().toISOString(),
  };
  return { ...data, transactions: [...data.transactions, copy] };
}

/** Mark a pending bill as paid (user-confirmed — never automatic). */
export function markPaid(data: AppData, txId: string, paidOn: ISODate, accountId?: string): AppData {
  return {
    ...data,
    transactions: data.transactions.map((t) =>
      t.id === txId ? { ...t, status: 'paid', dueDate: t.dueDate ?? t.date, date: paidOn, accountId: accountId ?? t.accountId } : t,
    ),
  };
}

/**
 * Confirm one occurrence of a recurring rule (salary received / bill paid).
 * Creates the real transaction linked to the rule + occurrence date.
 */
export function settleOccurrence(
  data: AppData,
  rule: RecurringRule,
  occurrence: ISODate,
  over: { amount?: Cents; date?: ISODate; accountId?: string } = {},
): AppData {
  const onCard = rule.kind === 'expense' && !!rule.cardId && !over.accountId;
  const tx = newTx({
    kind: rule.kind === 'income' ? 'income' : onCard ? 'card_purchase' : 'expense',
    amount: over.amount ?? rule.amount,
    description: rule.description,
    date: over.date ?? occurrence,
    dueDate: rule.kind === 'expense' ? occurrence : undefined,
    category: rule.category,
    subcategory: rule.subcategory,
    person: rule.person,
    accountId: onCard ? undefined : (over.accountId ?? rule.accountId),
    cardId: onCard ? rule.cardId : undefined,
    incomeSource: rule.incomeSource,
    paymentMethod: rule.paymentMethod,
    recurringId: rule.id,
    occurrence,
  });
  return { ...data, transactions: [...data.transactions, tx] };
}

export function skipOccurrence(data: AppData, ruleId: string, occurrence: ISODate): AppData {
  return {
    ...data,
    recurring: data.recurring.map((r) => (r.id === ruleId ? { ...r, skipped: [...(r.skipped ?? []), occurrence] } : r)),
  };
}

/**
 * Pay a credit card from a bank account.
 * ONE transaction of kind `card_payment`: it lowers the bank balance and the
 * card debt, and is excluded from spending (purchases were already counted).
 */
export function payCard(data: AppData, card: Card, amount: Cents, accountId: string, date: ISODate): AppData {
  const tx = newTx({
    kind: 'card_payment',
    amount,
    description: `${card.name} payment`,
    date,
    category: 'Financial',
    subcategory: 'Credit Card Payments',
    person: card.owner,
    accountId,
    cardId: card.id,
    paymentMethod: 'Bank transfer',
  });
  return { ...data, transactions: [...data.transactions, tx] };
}

/** Instalment purchase: split into N monthly card purchases that sum exactly to the total. */
export function addInstalments(data: AppData, base: Transaction, n: number): AppData {
  if (n <= 1) return { ...data, transactions: [...data.transactions, base] };
  const parts = splitCents(base.amount, n);
  const groupId = uid();
  const txs = parts.map((amount, i) =>
    newTx({
      ...base,
      id: undefined as unknown as string,
      amount,
      date: addMonths(base.date, i),
      groupId,
      instalment: { n: i + 1, of: n },
      description: `${base.description} (${i + 1}/${n})`,
    }),
  );
  return { ...data, transactions: [...data.transactions, ...txs.map((t) => ({ ...t, id: uid() }))] };
}

export function contributeGoal(data: AppData, goal: Goal, amount: Cents): AppData {
  return upsert(data, 'goals', { ...goal, current: Math.max(0, goal.current + amount) });
}

export function removeDemo(data: AppData): AppData {
  const demoIds = [data.accounts, data.cards, data.transactions, data.recurring, data.goals, data.purchases].flatMap((l) => l.filter((x) => x.demo).map((x) => x.id));
  return {
    ...data,
    deletedIds: tombstone(data, demoIds),
    accounts: data.accounts.filter((x) => !x.demo),
    cards: data.cards.filter((x) => !x.demo),
    transactions: data.transactions.filter((x) => !x.demo),
    recurring: data.recurring.filter((x) => !x.demo),
    goals: data.goals.filter((x) => !x.demo),
    purchases: data.purchases.filter((x) => !x.demo),
  };
}

export const hasDemo = (d: AppData) =>
  [d.accounts, d.cards, d.transactions, d.recurring, d.goals, d.purchases].some((l) => l.some((x) => x.demo));

/** Remember deleted ids (newest last, capped) so cloud sync never brings them back. */
export const MAX_TOMBSTONES = 5000;
export function tombstone(data: AppData, ids: string[]): string[] {
  const set = new Set(data.deletedIds ?? []);
  for (const id of ids) set.add(id);
  return [...set].slice(-MAX_TOMBSTONES);
}

// ---------------------------------------------------------------------------
// Subcategories (per category): add, rename, remove
// ---------------------------------------------------------------------------
const withoutItem = (m: Record<string, string[]> | undefined, cat: string, name: string) => ({ ...(m ?? {}), [cat]: (m?.[cat] ?? []).filter((x) => x !== name) });
const withItem = (m: Record<string, string[]> | undefined, cat: string, name: string) => ({ ...(m ?? {}), [cat]: [...new Set([...(m?.[cat] ?? []), name])] });

export function addSubcategory(data: AppData, category: string, name: string): AppData {
  const n = name.trim();
  const s = data.settings;
  return {
    ...data,
    settings: {
      ...s,
      customSubcategories: isBuiltInSubcategory(category, n) ? s.customSubcategories : withItem(s.customSubcategories, category, n),
      hiddenSubcategories: withoutItem(s.hiddenSubcategories, category, n), // adding back a removed one un-hides it
    },
  };
}

/** Remove from the lists. Past transactions keep their label; a budget for it is removed. */
export function removeSubcategory(data: AppData, category: string, name: string): AppData {
  const s = data.settings;
  const budgets = { ...s.budgets };
  delete budgets[budgetKey(category, name)];
  return {
    ...data,
    settings: {
      ...s,
      budgets,
      customSubcategories: withoutItem(s.customSubcategories, category, name),
      hiddenSubcategories: withItem(s.hiddenSubcategories, category, name),
    },
  };
}

/** Rename everywhere: lists, transactions, recurring items and the budget for it. */
export function renameSubcategory(data: AppData, category: string, from: string, to: string): AppData {
  const n = to.trim();
  if (!n || n === from) return data;
  let next = addSubcategory(removeSubcategory(data, category, from), category, n);
  const oldBudget = data.settings.budgets[budgetKey(category, from)];
  if (oldBudget) next = { ...next, settings: { ...next.settings, budgets: { ...next.settings.budgets, [budgetKey(category, n)]: oldBudget } } };
  const fix = <T extends { category: string; subcategory?: string }>(x: T): T => (x.category === category && x.subcategory === from ? { ...x, subcategory: n } : x);
  return { ...next, transactions: next.transactions.map(fix), recurring: next.recurring.map(fix) };
}

export const subcategoryUsage = (data: AppData, category: string, name: string) =>
  data.transactions.filter((t) => t.category === category && t.subcategory === name).length +
  data.recurring.filter((r) => r.category === category && r.subcategory === name).length;

// ---------------------------------------------------------------------------
// Credit cards: close (keep history) or delete with its transactions
// ---------------------------------------------------------------------------
export function setCardClosed(data: AppData, cardId: string, closed: boolean): AppData {
  return { ...data, cards: data.cards.map((c) => (c.id === cardId ? { ...c, closed } : c)) };
}

/** Delete a card and every purchase/fee/payment on it; subscriptions charged to it are unlinked. */
export function deleteCardWithHistory(data: AppData, cardId: string): AppData {
  const txIds = data.transactions.filter((t) => t.cardId === cardId).map((t) => t.id);
  return {
    ...data,
    cards: data.cards.filter((c) => c.id !== cardId),
    transactions: data.transactions.filter((t) => t.cardId !== cardId),
    recurring: data.recurring.map((r) => (r.cardId === cardId ? { ...r, cardId: undefined } : r)),
    deletedIds: tombstone(data, [cardId, ...txIds]),
  };
}

// ---------------------------------------------------------------------------
// Payment plans on a credit card (new or already running)
// ---------------------------------------------------------------------------
export interface PlanInput {
  cardId: string;
  name: string;
  monthly: Cents;
  months: number; // total number of instalments, e.g. 24
  alreadyPaid: number; // instalments paid before adding to the app
  nextDate: ISODate; // date of the next instalment
  category: string;
  subcategory?: string;
  person: Transaction['person'];
  alreadyInCardBalance: boolean; // the card's balance in the app already includes what's left of this plan
}

/**
 * Creates the remaining instalments as monthly card purchases. Each one counts
 * as spending in its month and is billed on that month's statement; together
 * they make up the plan's remaining debt (they use the card limit until paid).
 */
export function addPlan(data: AppData, p: PlanInput): AppData {
  const groupId = uid();
  const first = p.alreadyPaid + 1;
  const txs: Transaction[] = [];
  for (let n = first; n <= p.months; n++) {
    txs.push(
      newTx({
        kind: 'card_purchase',
        amount: p.monthly,
        description: `${p.name} (${n}/${p.months})`,
        date: addMonths(p.nextDate, n - first),
        category: p.category,
        subcategory: p.subcategory,
        person: p.person,
        cardId: p.cardId,
        paymentMethod: 'Credit card',
        groupId,
        instalment: { n, of: p.months },
      }),
    );
  }
  const remaining = txs.reduce((a, t) => a + t.amount, 0);
  const cards = p.alreadyInCardBalance
    ? data.cards.map((c) => (c.id === p.cardId ? { ...c, openingBalance: Math.max(0, c.openingBalance - remaining) } : c))
    : data.cards;
  return { ...data, cards, transactions: [...data.transactions, ...txs] };
}

/** Remove a plan and all its instalments (e.g. added by mistake). */
export function deletePlan(data: AppData, groupId: string): AppData {
  const ids = data.transactions.filter((t) => t.groupId === groupId).map((t) => t.id);
  return { ...data, transactions: data.transactions.filter((t) => t.groupId !== groupId), deletedIds: tombstone(data, ids) };
}
