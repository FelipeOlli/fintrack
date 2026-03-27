import { MONTHS } from '../constants/categories'
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
