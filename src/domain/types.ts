// All money values are integer CENTS (e.g. $12.34 => 1234).
// All dates are ISO strings "YYYY-MM-DD" (displayed as DD/MM/YYYY).

export type Cents = number;
export type ISODate = string;

export type Person = 'me' | 'patrick' | 'joint';
export type PersonFilter = Person | 'all';

export type Frequency = 'one-time' | 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly';

export type TxKind =
  | 'income' // money in to a bank/cash account
  | 'expense' // money out of a bank/cash account (counts as spending)
  | 'transfer' // between our own accounts (NOT income, NOT spending)
  | 'card_purchase' // bought on a credit card (counts as spending, adds card debt)
  | 'card_charge' // interest / fees on a card (counts as spending, adds card debt)
  | 'card_payment'; // pays a card from a bank account (NOT spending; lowers bank AND card debt)

export type TxStatus = 'paid' | 'pending';

export interface Account {
  id: string;
  name: string;
  type: 'bank' | 'savings' | 'cash';
  owner: Person;
  openingBalance: Cents;
  demo?: boolean;
}

export interface Card {
  id: string;
  name: string;
  bank: string;
  owner: Person;
  limit: Cents;
  openingBalance: Cents; // debt already on the card when added
  closingDay: number; // statement closes on this day of month (1-28)
  dueDay: number; // payment due on this day of month (1-28)
  minPaymentPercent: number; // e.g. 2 (%)
  minPaymentFloor: Cents; // e.g. 2500 ($25)
  annualFee: Cents;
  interestRate: number; // purchase APR %
  demo?: boolean;
}

export interface Transaction {
  id: string;
  kind: TxKind;
  amount: Cents; // always positive; kind defines direction
  description: string;
  date: ISODate; // date it happened / was paid (or due date when pending)
  dueDate?: ISODate; // for bills
  category: string; // category group, e.g. "Housing"
  subcategory?: string; // e.g. "Rent"
  person: Person;
  status: TxStatus; // pending = a bill not yet paid
  paymentMethod?: string;
  accountId?: string; // bank account (income/expense/transfer from/card_payment from)
  toAccountId?: string; // transfer destination
  cardId?: string; // card_purchase / card_charge / card_payment target
  incomeSource?: string;
  notes?: string;
  recurringId?: string; // created from a recurring rule
  occurrence?: ISODate; // which occurrence of the rule this settles
  groupId?: string; // instalment group
  instalment?: { n: number; of: number };
  demo?: boolean;
  createdAt: string;
}

export interface RecurringRule {
  id: string;
  kind: 'income' | 'expense';
  description: string;
  amount: Cents;
  frequency: Exclude<Frequency, 'one-time'>;
  startDate: ISODate;
  endDate?: ISODate;
  category: string;
  subcategory?: string;
  person: Person;
  accountId?: string;
  cardId?: string; // expense charged to a card (subscription)
  incomeSource?: string;
  paymentMethod?: string;
  notes?: string;
  skipped?: ISODate[]; // occurrences the user chose to skip
  demo?: boolean;
}

export interface Goal {
  id: string;
  name: string;
  target: Cents;
  current: Cents;
  deadline?: ISODate;
  monthlyContribution: Cents;
  person: Person;
  demo?: boolean;
}

export interface PlannedPurchase {
  id: string;
  name: string;
  price: Cents;
  saved: Cents;
  priority: 'high' | 'medium' | 'low';
  person: Person;
  deadline?: ISODate;
  category: string;
  status: 'planned' | 'saving' | 'purchased';
  paymentMethod: string;
  demo?: boolean;
}

/** Budget period aligned to when we get paid (e.g. weekly from Thursday). */
export interface BudgetCycle {
  frequency: 'weekly' | 'fortnightly' | 'monthly';
  anchor: ISODate; // any payday; cycles start on this date and repeat
  incomeRuleId?: string; // optional: follow a recurring income's schedule
}

export interface Settings {
  myName: string;
  partnerName: string;
  theme: 'light' | 'dark' | 'system';
  budgets: Record<string, Cents>; // budget per category group, PER CYCLE (see budgetCycle)
  budgetCycle?: BudgetCycle;
  customSubcategories?: Record<string, string[]>; // our own subcategories, per category
}

export interface AppData {
  version: 1;
  accounts: Account[];
  cards: Card[];
  transactions: Transaction[];
  recurring: RecurringRule[];
  goals: Goal[];
  purchases: PlannedPurchase[];
  settings: Settings;
  deletedIds?: string[]; // tombstones so a deletion isn't undone by syncing with the other device
}
