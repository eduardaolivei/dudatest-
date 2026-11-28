import type { AppData } from '../domain/types';

const COLLECTIONS = ['accounts', 'cards', 'transactions', 'recurring', 'goals', 'purchases'] as const;

/**
 * Combine two versions of the household data when both people changed it at
 * the same time. Records are matched by id:
 *  - anything deleted on either side stays deleted (tombstones),
 *  - records that exist on only one side are kept,
 *  - when the same record was edited on both sides, `preferred` wins.
 * Settings come from `preferred`, with budgets and custom subcategories combined.
 */
export function mergeData(preferred: AppData, other: AppData): AppData {
  const deleted = new Set([...(other.deletedIds ?? []), ...(preferred.deletedIds ?? [])]);
  const out: AppData = { ...preferred, deletedIds: [...deleted] };
  for (const col of COLLECTIONS) {
    const byId = new Map<string, unknown>();
    for (const item of other[col]) if (!deleted.has(item.id)) byId.set(item.id, item);
    for (const item of preferred[col]) if (!deleted.has(item.id)) byId.set(item.id, item);
    (out as unknown as Record<string, unknown[]>)[col] = [...byId.values()];
  }
  const custom: Record<string, string[]> = { ...(other.settings.customSubcategories ?? {}) };
  for (const [k, v] of Object.entries(preferred.settings.customSubcategories ?? {})) custom[k] = [...new Set([...(custom[k] ?? []), ...v])];
  const hidden: Record<string, string[]> = { ...(other.settings.hiddenSubcategories ?? {}) };
  for (const [k, v] of Object.entries(preferred.settings.hiddenSubcategories ?? {})) hidden[k] = [...new Set([...(hidden[k] ?? []), ...v])];
  out.settings = {
    ...preferred.settings,
    budgets: { ...other.settings.budgets, ...preferred.settings.budgets },
    customSubcategories: custom,
    hiddenSubcategories: hidden,
    wishlistCategories: [...new Set([...(other.settings.wishlistCategories ?? []), ...(preferred.settings.wishlistCategories ?? [])])],
  };
  return out;
}
