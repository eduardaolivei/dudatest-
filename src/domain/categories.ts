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

export const CATEGORY_COLORS: Record<string, string> = {
  Housing: '#4f6bed',
  Education: '#8b5cf6',
  Transportation: '#0ea5e9',
  Groceries: '#10b981',
  Personal: '#f59e0b',
  Financial: '#ef4444',
  Other: '#64748b',
};

export const categoryNames = Object.keys(EXPENSE_CATEGORIES);
