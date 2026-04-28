import type { Bill, ExtractedItem } from '../domain/types'
import { readBillsMonth } from '../storage/persistence'

/** Remove acentos, lowercase, colapsa espaços, remove ruído. */
export function normalizeBillName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(pag|pagamento|compra|parc|parcela)\b/g, '')
    .replace(/\d{1,2}\s*[/\\]\s*\d{1,2}/g, '')
    .trim()
    .replace(/\s{2,}/g, ' ')
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
