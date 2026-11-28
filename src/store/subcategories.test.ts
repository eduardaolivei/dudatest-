import { describe, expect, it } from 'vitest';
import { emptyData } from './storage';
import { addSubcategory, newTx, removeSubcategory, renameSubcategory, subcategoryUsage } from './actions';
import { subcategoriesFor } from '../domain/categories';
import { mergeData } from './merge';

describe('subcategories', () => {
  it('adds a new one to a category', () => {
    const d = addSubcategory(emptyData(), 'Groceries', 'Uber Eats');
    expect(subcategoriesFor('Groceries', d.settings)).toContain('Uber Eats');
    expect(subcategoriesFor('Housing', d.settings)).not.toContain('Uber Eats');
  });
  it('removes built-in and custom ones, and can bring them back', () => {
    let d = addSubcategory(emptyData(), 'Personal', 'Gym');
    d = removeSubcategory(d, 'Personal', 'Gym');
    d = removeSubcategory(d, 'Personal', 'Beauty');
    expect(subcategoriesFor('Personal', d.settings)).not.toContain('Gym');
    expect(subcategoriesFor('Personal', d.settings)).not.toContain('Beauty');
    d = addSubcategory(d, 'Personal', 'Beauty');
    expect(subcategoriesFor('Personal', d.settings)).toContain('Beauty');
  });
  it('renames everywhere: transactions, recurring and budget', () => {
    let d = addSubcategory(emptyData(), 'Groceries', 'Ubereats');
    d.transactions.push(newTx({ kind: 'expense', amount: 2000, description: 'dinner', date: '2026-11-28', category: 'Groceries', subcategory: 'Ubereats', person: 'joint' }));
    d.recurring.push({ id: 'r', kind: 'expense', description: 'x', amount: 1, frequency: 'monthly', startDate: '2026-11-01', category: 'Groceries', subcategory: 'Ubereats', person: 'joint' });
    d.settings.budgets['Groceries › Ubereats'] = 5000;
    expect(subcategoryUsage(d, 'Groceries', 'Ubereats')).toBe(2);
    d = renameSubcategory(d, 'Groceries', 'Ubereats', 'Uber Eats');
    expect(d.transactions[0].subcategory).toBe('Uber Eats');
    expect(d.recurring[0].subcategory).toBe('Uber Eats');
    expect(d.settings.budgets['Groceries › Uber Eats']).toBe(5000);
    expect(d.settings.budgets['Groceries › Ubereats']).toBeUndefined();
    expect(subcategoriesFor('Groceries', d.settings)).toContain('Uber Eats');
    expect(subcategoriesFor('Groceries', d.settings)).not.toContain('Ubereats');
  });
  it('removing keeps past transactions labelled', () => {
    let d = emptyData();
    d.transactions.push(newTx({ kind: 'expense', amount: 500, description: 'c', date: '2026-11-28', category: 'Groceries', subcategory: 'Coffee', person: 'me' }));
    d = removeSubcategory(d, 'Groceries', 'Coffee');
    expect(d.transactions[0].subcategory).toBe('Coffee');
  });
  it('a removal on one phone is not undone by syncing with the other', () => {
    const base = addSubcategory(emptyData(), 'Groceries', 'Snacks');
    const mine = removeSubcategory(base, 'Groceries', 'Snacks');
    const merged = mergeData(base, mine);
    expect(subcategoriesFor('Groceries', merged.settings)).not.toContain('Snacks');
  });
});

describe('wishlist categories', () => {
  it('offers built-in wish categories plus ours and ones already used', async () => {
    const { wishlistCategoriesFor } = await import('../domain/categories');
    const cats = wishlistCategoriesFor({ wishlistCategories: ['Brazil trip'] }, [{ category: 'Household expenses' }]);
    expect(cats).toEqual(expect.arrayContaining(['Travel', 'Tech', 'Just want', 'Brazil trip', 'Household expenses']));
  });
  it('custom wish categories survive syncing', () => {
    const a = emptyData(); a.settings.wishlistCategories = ['Wedding'];
    const b = emptyData(); b.settings.wishlistCategories = ['Brazil trip'];
    expect(mergeData(a, b).settings.wishlistCategories?.sort()).toEqual(['Brazil trip', 'Wedding']);
  });
});
