import { CAT_COLORS, MONTHS } from '../constants/categories'
import type { Bill } from '../domain/types'
import { session } from '../app/session'
import { billsStorageKey } from '../storage/keys'
import { listBillsStorageKeysSorted, readBillsMonth } from '../storage/persistence'

export type MonthPoint = {
  monthKey: string
  label: string
  total: number
  pago: number
  pend: number
  div: number
}

function billsForMonth(monthKey: string): Bill[] {
  if (monthKey === session.currentMonth) return session.currentBills
  return readBillsMonth(monthKey) ?? []
}

function summarizeBills(bills: Bill[]) {
  let total = 0
  let pago = 0
  let pend = 0
  let div = 0
  for (const b of bills) {
    const v = b.value || 0
    total += v
    if (b.status === 'pago') pago += v
    else if (b.status === 'pendente') pend += v
    else if (b.status === 'divida') div += v
  }
  return { total, pago, pend, div }
}

function labelFromKey(monthKey: string) {
  const p = monthKey.split('_')
  const monthNum = parseInt(p[1], 10)
  const short =
    monthNum >= 1 && monthNum <= 12 ? MONTHS[monthNum - 1].slice(0, 3) : '—'
  return `${short}/${(p[0] || '').slice(-2)}`
}

/** Últimos N meses com dados salvos + mês atual em edição. */
export function getMonthlyPointsLast(maxMonths: number): MonthPoint[] {
  let keys = listBillsStorageKeysSorted().slice(-maxMonths)
  const cur = session.currentMonth
  if (cur && !keys.some((k) => k.replace('bills_', '') === cur)) {
    keys = [...keys, billsStorageKey(cur)].sort()
    keys = keys.slice(-maxMonths)
  }
  if (keys.length === 0 && cur) {
    keys = [billsStorageKey(cur)]
  }
  const slice = keys
  return slice.map((k) => {
    const monthKey = k.replace('bills_', '')
    const sums = summarizeBills(billsForMonth(monthKey))
    return {
      monthKey,
      label: labelFromKey(monthKey),
      ...sums,
    }
  })
}

export function currentMonthTotals() {
  return summarizeBills(session.currentBills)
}

export type CategorySlice = { name: string; value: number; color: string }

const PALETTE = [
  '#2563eb', '#16a34a', '#f97316', '#6366f1', '#0ea5e9',
  '#ec4899', '#eab308', '#14b8a6', '#8b5cf6', '#f43f5e',
  '#84cc16', '#a855f7', '#22d3ee', '#fb923c', '#64748b',
]

function categoryColor(name: string, idx: number): string {
  return CAT_COLORS[name] || PALETTE[idx % PALETTE.length]
}

/** Gastos agrupados por categoria no mês atual. */
export function getCategoryBreakdown(): CategorySlice[] {
  const map = new Map<string, number>()
  for (const b of session.currentBills) {
    const cat = b.category || 'Outros'
    map.set(cat, (map.get(cat) || 0) + (b.value || 0))
  }
  return Array.from(map.entries())
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({ name, value, color: categoryColor(name, i) }))
}

export type YearCategoryBar = { name: string; value: number; color: string }

/** Totais anuais por categoria de gasto para o ano do mês selecionado. */
export function getYearCategoryData(): { bars: YearCategoryBar[] } {
  const [yearStr] = session.currentMonth.split('_')
  const year = parseInt(yearStr, 10)
  const allCats = new Map<string, number>()

  for (let m = 1; m <= 12; m++) {
    const mk = `${year}_${String(m).padStart(2, '0')}`
    const bills = billsForMonth(mk)
    for (const b of bills) {
      const cat = b.category || 'Outros'
      allCats.set(cat, (allCats.get(cat) || 0) + (b.value || 0))
    }
  }

  const bars: YearCategoryBar[] = Array.from(allCats.entries())
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({ name, value, color: categoryColor(name, i) }))

  return { bars }
}
