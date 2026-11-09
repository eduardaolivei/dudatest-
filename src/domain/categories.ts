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
