import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CAT_COLORS } from '../constants/categories'
import { billsStorageKey, mkKey } from './keys'
import {
  clearAllBillsMonths,
  getCategories,
  listBillsStorageKeysSorted,
  readBillsMonth,
  writeBillsMonth,
} from './persistence'

describe('persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('readBillsMonth returns null when key missing', () => {
    expect(readBillsMonth('2026_03')).toBeNull()
  })

  it('writeBillsMonth and readBillsMonth round-trip', () => {
    const bills = [
      { name: 'Luz', category: 'Moradia', value: 120, status: 'pendente' as const, obs: '' },
    ]
    writeBillsMonth('2026_03', bills)
    expect(readBillsMonth('2026_03')).toEqual(bills)
    expect(localStorage.getItem(billsStorageKey('2026_03'))).toBe(JSON.stringify(bills))
  })

  it('clearAllBillsMonths removes only bills_ keys', () => {
    localStorage.setItem(billsStorageKey('2026_01'), '[]')
    localStorage.setItem('fintrack_accounts', '[]')
    clearAllBillsMonths()
    expect(localStorage.getItem(billsStorageKey('2026_01'))).toBeNull()
    expect(localStorage.getItem('fintrack_accounts')).toBe('[]')
  })

  it('listBillsStorageKeysSorted is sorted', () => {
    localStorage.setItem('bills_2025_12', '[]')
    localStorage.setItem('bills_2026_01', '[]')
    localStorage.setItem('fintrack_accounts', '[]')
    expect(listBillsStorageKeysSorted()).toEqual(['bills_2025_12', 'bills_2026_01'])
  })

  it('getCategories falls back to CAT_COLORS when empty', () => {
    const cats = getCategories()
    expect(cats.length).toBe(Object.keys(CAT_COLORS).length)
    expect(cats.map((c) => c.name).sort()).toEqual(Object.keys(CAT_COLORS).sort())
  })
})

describe('mkKey', () => {
  it('formats YYYY_MM with zero-padded month', () => {
    expect(mkKey(2026, 0)).toBe('2026_01')
    expect(mkKey(2026, 11)).toBe('2026_12')
  })
})
