export const ACCOUNTS_STORAGE_KEY = 'fintrack_accounts'
export const RECURRING_STORAGE_KEY = 'recurring_bills'
export const CATEGORIES_STORAGE_KEY = 'fintrack_categories'
export const INCOME_SOURCES_KEY = 'fintrack_income_sources'

export function incomeStorageKey(monthKey: string): string {
  return `income_${monthKey}`
}

export function billsStorageKey(monthKey: string): string {
  return `bills_${monthKey}`
}

export function mkKey(y: number, m: number): string {
  return `${y}_${String(m + 1).padStart(2, '0')}`
}
