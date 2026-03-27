import { CAT_COLORS } from '../constants/categories'
import type {
  Account,
  Bill,
  Category,
  IncomeSource,
  MonthIncomeEntry,
  RecurringTemplate,
} from '../domain/types'
import {
  ACCOUNTS_STORAGE_KEY,
  billsStorageKey,
  CATEGORIES_STORAGE_KEY,
  INCOME_SOURCES_KEY,
  incomeStorageKey,
  RECURRING_STORAGE_KEY,
} from './keys'

function defaultCategoriesFromPalette(): Category[] {
  return Object.entries(CAT_COLORS).map(([name], i) => ({
    id: `cat_${i}`,
    name,
    color: CAT_COLORS[name] || '#94a3b8',
  }))
}

export function getCategories(): Category[] {
  try {
    const raw = localStorage.getItem(CATEGORIES_STORAGE_KEY)
    if (!raw) return defaultCategoriesFromPalette()
    const parsed = JSON.parse(raw) as Category[]
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed
      : defaultCategoriesFromPalette()
  } catch {
    return defaultCategoriesFromPalette()
  }
}

export function saveCategories(cats: Category[]): void {
  localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(cats))
}

export function getIncomeSources(): IncomeSource[] {
  try {
    const raw = localStorage.getItem(INCOME_SOURCES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as IncomeSource[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveIncomeSources(sources: IncomeSource[]): void {
  localStorage.setItem(INCOME_SOURCES_KEY, JSON.stringify(sources))
}

export function getMonthIncome(monthKey: string): MonthIncomeEntry[] {
  try {
    const raw = localStorage.getItem(incomeStorageKey(monthKey))
    if (!raw) return []
    const parsed = JSON.parse(raw) as MonthIncomeEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function setMonthIncome(monthKey: string, entries: MonthIncomeEntry[]): void {
  localStorage.setItem(incomeStorageKey(monthKey), JSON.stringify(entries))
}

export function getTotalMonthIncome(monthKey: string): number {
  return getMonthIncome(monthKey).reduce((s, e) => s + e.value, 0)
}

export function getRecurringTemplates(): RecurringTemplate[] {
  try {
    const raw = localStorage.getItem(RECURRING_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecurringTemplate[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveRecurringTemplates(templates: RecurringTemplate[]): void {
  localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(templates))
}

export function getRecurringBillsAsBills(): Bill[] {
  return getRecurringTemplates().map((r) => ({
    name: r.name,
    category: r.category,
    value: r.value,
    status: r.status,
    obs: '',
    accountId: r.accountId,
  }))
}

export function getAccounts(): Account[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Account[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveAccounts(accounts: Account[]): void {
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts))
}

export function readBillsMonth(monthKey: string): Bill[] | null {
  const raw = localStorage.getItem(billsStorageKey(monthKey))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Bill[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeBillsMonth(monthKey: string, bills: Bill[]): void {
  localStorage.setItem(billsStorageKey(monthKey), JSON.stringify(bills))
}

/** Chaves `bills_*` ordenadas (lexicográfico = ordem cronológica com YYYY_MM). */
export function listBillsStorageKeysSorted(): string[] {
  return Object.keys(localStorage).filter((k) => k.startsWith('bills_')).sort()
}

export function clearAllBillsMonths(): void {
  Object.keys(localStorage)
    .filter((k) => k.startsWith('bills_'))
    .forEach((k) => localStorage.removeItem(k))
}

export function getValorUnicoFonte(monthKey: string, sourceId: string): number {
  const entries = getMonthIncome(monthKey).filter((e) => e.sourceId === sourceId)
  if (entries.length === 0) return 0
  return entries.reduce((s, e) => s + e.value, 0)
}

export function setValorUnicoFonte(monthKey: string, sourceId: string, value: number): void {
  const list = getMonthIncome(monthKey).filter((e) => e.sourceId !== sourceId)
  if (value > 0) list.push({ sourceId, value })
  setMonthIncome(monthKey, list)
}
