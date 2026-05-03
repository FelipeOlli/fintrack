import type { Bill, ExtractedItem } from '../domain/types'
import { listBillsStorageKeysSorted, readBillsMonth } from '../storage/persistence'

/** Remove acentos, lowercase, separadores e ruído para comparação de nomes. */
export function normalizeBillName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(pag|pagamento|compra|parc|parcela)\b/g, '')
    .replace(/\d{1,2}\s*[/\\]\s*\d{1,2}/g, '')
    .replace(/[·\-|]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function matchAgainstExisting(
  item: ExtractedItem,
  existingBills: Bill[],
): 'new' | 'duplicate' | 'similar' {
  const itemName = normalizeBillName(item.cleanName || item.name)
  if (!itemName) return 'new'

  for (const bill of existingBills) {
    const billName = normalizeBillName(bill.name)
    const valueMatch = Math.abs(item.value - bill.value) < 0.01

    if (!valueMatch) continue

    if (itemName === billName) return 'duplicate'

    if (
      itemName.length >= 4 &&
      billName.length >= 4 &&
      (billName.includes(itemName) || itemName.includes(billName))
    ) {
      return 'similar'
    }
  }
  return 'new'
}

/**
 * Verifica duplicatas em TODOS os meses da projeção.
 * Muta os items diretamente (matchStatus, matchedMonthKey, selected).
 */
export function deduplicateAcrossMonths(
  projection: Record<string, ExtractedItem[]>,
): void {
  for (const [monthKey, items] of Object.entries(projection)) {
    const existing = readBillsMonth(monthKey) ?? []
    for (const item of items) {
      const status = matchAgainstExisting(item, existing)
      item.matchStatus = status
      if (status === 'duplicate') {
        item.selected = false
        item.matchedMonthKey = monthKey
      } else if (status === 'similar') {
        item.matchedMonthKey = monthKey
      } else {
        item.matchStatus = 'new'
      }
    }
  }
}

/** Lê todos os bills salvos em todos os meses. */
function getAllHistoricalBills(): Bill[] {
  const bills: Bill[] = []
  for (const storageKey of listBillsStorageKeysSorted()) {
    const mk = storageKey.replace('bills_', '')
    const monthBills = readBillsMonth(mk)
    if (monthBills) bills.push(...monthBills)
  }
  return bills
}

/**
 * Para cada item com categoria "Outros" ou vazia, busca no histórico completo
 * de bills se já existe um lançamento com nome similar categorizado. Se sim,
 * herda a categoria.
 */
export function enrichCategoriesFromHistory(items: ExtractedItem[]): void {
  const historical = getAllHistoricalBills()
  if (!historical.length) return

  for (const item of items) {
    if (item.category && item.category !== 'Outros') continue
    const normItem = normalizeBillName(item.cleanName || item.name)
    if (!normItem) continue

    for (const b of historical) {
      if (!b.category || b.category === 'Outros') continue
      const normB = normalizeBillName(b.name)
      if (!normB) continue
      if (
        normItem === normB ||
        (normItem.length >= 4 && normB.length >= 4 &&
          (normItem.includes(normB) || normB.includes(normItem)))
      ) {
        item.category = b.category
        break
      }
    }
  }
}
