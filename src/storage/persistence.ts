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

/** UUID do workspace default no Postgres (schema.sql). */
export const WORKSPACE_ID =
  import.meta.env.VITE_WORKSPACE_ID || '00000000-0000-0000-0000-000000000001'

function apiBase(): string {
  const v = import.meta.env.VITE_API_URL
  if (v == null || String(v).trim() === '') return ''
  const t = String(v).trim()
  if (t.startsWith('http://') || t.startsWith('https://')) return t.replace(/\/$/, '')
  const path = t.startsWith('/') ? t : `/${t}`
  if (typeof window === 'undefined') return path.replace(/\/$/, '') || ''
  return `${window.location.origin}${path}`.replace(/\/$/, '')
}

export function persistenceUsesApi(): boolean {
  return apiBase() !== ''
}

type ApiCache = {
  accounts: Account[]
  categories: Category[]
  incomeSources: IncomeSource[]
  recurringTemplates: RecurringTemplate[]
  monthIncome: Record<string, MonthIncomeEntry[]>
  billsByMonth: Record<string, Bill[]>
}

// Inicializa com arrays vazios em modo API para evitar erros antes do bootstrap
let apiCache: ApiCache | null = persistenceUsesApi()
  ? { accounts: [], categories: [], incomeSources: [], recurringTemplates: [], monthIncome: {}, billsByMonth: {} }
  : null

function buildUrl(rel: string): string {
  const base = apiBase()
  const path = rel.startsWith('/') ? rel.slice(1) : rel
  const u = new URL(path, `${base}/`)
  u.searchParams.set('workspaceId', WORKSPACE_ID)
  return u.toString()
}

async function apiPut(rel: string, body: unknown): Promise<void> {
  const r = await fetch(buildUrl(rel), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error(`FinTrack API ${rel}: ${r.status} ${t}`)
  }
}

async function apiDelete(rel: string): Promise<void> {
  const r = await fetch(buildUrl(rel), { method: 'DELETE' })
  if (!r.ok) throw new Error(`FinTrack API DELETE ${rel}: ${r.status}`)
}

/** Chamar antes de initMonthSel/loadMonth quando VITE_API_URL está definido. */
export async function initPersistence(): Promise<void> {
  if (!persistenceUsesApi()) {
    apiCache = null
    return
  }
  const r = await fetch(buildUrl('api/bootstrap'))
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error(`FinTrack API bootstrap: ${r.status} ${t}`)
  }
  apiCache = (await r.json()) as ApiCache
}

function needCache(): ApiCache {
  if (!apiCache) {
    throw new Error('Persistência API não inicializada (initPersistence)')
  }
  return apiCache
}

function defaultCategoriesFromPalette(): Category[] {
  return Object.entries(CAT_COLORS).map(([name], i) => ({
    id: `cat_${i}`,
    name,
    color: CAT_COLORS[name] || '#94a3b8',
  }))
}

/* ─── localStorage (modo offline) ─── */

function localGetCategories(): Category[] {
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

export function getCategories(): Category[] {
  if (!persistenceUsesApi()) return localGetCategories()
  const c = needCache().categories
  return c.length === 0 ? defaultCategoriesFromPalette() : c
}

export function saveCategories(cats: Category[]): void {
  if (!persistenceUsesApi()) {
    localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(cats))
    return
  }
  needCache().categories = cats
  void apiPut('api/categories', { categories: cats })
}

export function getIncomeSources(): IncomeSource[] {
  if (!persistenceUsesApi()) {
    try {
      const raw = localStorage.getItem(INCOME_SOURCES_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as IncomeSource[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return needCache().incomeSources
}

export function saveIncomeSources(sources: IncomeSource[]): void {
  if (!persistenceUsesApi()) {
    localStorage.setItem(INCOME_SOURCES_KEY, JSON.stringify(sources))
    return
  }
  needCache().incomeSources = sources
  void apiPut('api/income-sources', { sources })
}

export function getMonthIncome(monthKey: string): MonthIncomeEntry[] {
  if (!persistenceUsesApi()) {
    try {
      const raw = localStorage.getItem(incomeStorageKey(monthKey))
      if (!raw) return []
      const parsed = JSON.parse(raw) as MonthIncomeEntry[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return needCache().monthIncome[monthKey] ?? []
}

export function setMonthIncome(monthKey: string, entries: MonthIncomeEntry[]): void {
  if (!persistenceUsesApi()) {
    localStorage.setItem(incomeStorageKey(monthKey), JSON.stringify(entries))
    return
  }
  const c = needCache()
  c.monthIncome[monthKey] = entries
  void apiPut(`api/month-income/${encodeURIComponent(monthKey)}`, { entries })
}

export function getTotalMonthIncome(monthKey: string): number {
  return getMonthIncome(monthKey).reduce((s, e) => s + e.value, 0)
}

/** Total considerando fallback de fontes recorrentes sem valor no mês. */
export function getTotalMonthIncomeWithFallback(monthKey: string): number {
  const sources = getIncomeSources()
  return sources.reduce((sum, s) => sum + getValorFonteComFallback(monthKey, s.id, s.recurring), 0)
}

export function getRecurringTemplates(): RecurringTemplate[] {
  if (!persistenceUsesApi()) {
    try {
      const raw = localStorage.getItem(RECURRING_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as RecurringTemplate[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return needCache().recurringTemplates
}

export function saveRecurringTemplates(templates: RecurringTemplate[]): void {
  if (!persistenceUsesApi()) {
    localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(templates))
    return
  }
  needCache().recurringTemplates = templates
  void apiPut('api/recurring-templates', { templates })
}

export function getRecurringBillsAsBills(): Bill[] {
  return getRecurringTemplates().map((r) => ({
    name: r.name,
    category: r.category,
    value: r.value,
    status: r.status as Bill['status'],
    obs: '',
    accountId: r.accountId,
  }))
}

export function getAccounts(): Account[] {
  if (!persistenceUsesApi()) {
    try {
      const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as Account[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return needCache().accounts
}

export function saveAccounts(accounts: Account[]): void {
  if (!persistenceUsesApi()) {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts))
    return
  }
  needCache().accounts = accounts
  void apiPut('api/accounts', { accounts })
}

export function readBillsMonth(monthKey: string): Bill[] | null {
  if (!persistenceUsesApi()) {
    const raw = localStorage.getItem(billsStorageKey(monthKey))
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as Bill[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  const v = needCache().billsByMonth[monthKey]
  return v === undefined ? null : v
}

export function writeBillsMonth(monthKey: string, bills: Bill[]): void {
  if (!persistenceUsesApi()) {
    localStorage.setItem(billsStorageKey(monthKey), JSON.stringify(bills))
    return
  }
  const c = needCache()
  c.billsByMonth[monthKey] = bills
  void apiPut(`api/bills/${encodeURIComponent(monthKey)}`, { bills })
}

/** Lê bills existentes, concatena novos, e salva. */
export function appendBillsToMonth(monthKey: string, newBills: Bill[]): void {
  const existing = readBillsMonth(monthKey) ?? []
  writeBillsMonth(monthKey, [...existing, ...newBills])
}

/** Propaga mudança de categoria para todos os meses onde o lançamento (por nome) existe. */
export function propagateCategoryChange(billName: string, oldCategory: string, newCategory: string, skipMonthKey?: string): void {
  const keys = listBillsStorageKeysSorted()
  for (const storageKey of keys) {
    const monthKey = storageKey.replace(/^bills_/, '')
    if (monthKey === skipMonthKey) continue
    const bills = readBillsMonth(monthKey)
    if (!bills) continue
    let changed = false
    for (const b of bills) {
      if (b.name === billName && b.category === oldCategory) {
        b.category = newCategory
        changed = true
      }
    }
    if (changed) writeBillsMonth(monthKey, bills)
  }
}

/** Chaves `bills_*` ordenadas (lexicográfico = ordem cronológica com YYYY_MM). */
export function listBillsStorageKeysSorted(): string[] {
  if (!persistenceUsesApi()) {
    return Object.keys(localStorage).filter((k) => k.startsWith('bills_')).sort()
  }
  return Object.keys(needCache().billsByMonth)
    .sort()
    .map((k) => `bills_${k}`)
}

export function clearAllBillsMonths(): void {
  if (!persistenceUsesApi()) {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('bills_'))
      .forEach((k) => localStorage.removeItem(k))
    return
  }
  const c = needCache()
  c.billsByMonth = {}
  void apiDelete('api/bills')
}

export function getValorUnicoFonte(monthKey: string, sourceId: string): number {
  const entries = getMonthIncome(monthKey).filter((e) => e.sourceId === sourceId)
  if (entries.length === 0) return 0
  return entries.reduce((s, e) => s + e.value, 0)
}

/**
 * Retorna o valor da fonte para o mês.
 * Se não houver valor explícito e a fonte for recorrente,
 * busca o último valor salvo em meses anteriores.
 */
export function getValorFonteComFallback(
  monthKey: string,
  sourceId: string,
  recurring: boolean,
): number {
  const explicit = getValorUnicoFonte(monthKey, sourceId)
  if (explicit > 0) return explicit
  if (!recurring) return 0

  // Busca em meses anteriores (ordem decrescente)
  const pastMonthKeys = listPastMonthKeys(monthKey)
  for (const mk of pastMonthKeys) {
    const v = getValorUnicoFonte(mk, sourceId)
    if (v > 0) return v
  }
  return 0
}

/** Lista chaves de mês com income salvo, antes de monthKey, em ordem decrescente. */
function listPastMonthKeys(beforeMonthKey: string): string[] {
  let keys: string[]
  if (!persistenceUsesApi()) {
    keys = Object.keys(localStorage)
      .filter((k) => k.startsWith('income_'))
      .map((k) => k.slice('income_'.length))
  } else {
    keys = Object.keys(needCache().monthIncome)
  }
  return keys.filter((k) => k < beforeMonthKey).sort().reverse()
}

export function setValorUnicoFonte(monthKey: string, sourceId: string, value: number): void {
  const list = getMonthIncome(monthKey).filter((e) => e.sourceId !== sourceId)
  if (value > 0) list.push({ sourceId, value })
  setMonthIncome(monthKey, list)
}
