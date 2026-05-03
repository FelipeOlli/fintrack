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

/** Versão compactada: remove todos os espaços para comparação insensível a espaçamento. */
function compact(normalized: string): string {
  return normalized.replace(/\s/g, '')
}

/** Retorna true se dois nomes normalizados são considerados equivalentes. */
function namesMatch(a: string, b: string): boolean {
  if (a === b) return true
  const ca = compact(a)
  const cb = compact(b)
  if (ca === cb) return true
  const minLen = 4
  if (a.length >= minLen && b.length >= minLen && (a.includes(b) || b.includes(a))) return true
  if (ca.length >= minLen && cb.length >= minLen && (ca.includes(cb) || cb.includes(ca))) return true
  return false
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
    if (namesMatch(itemName, billName)) return 'duplicate'
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
 * Para cada item importado, busca no histórico completo de bills se já existe
 * um lançamento com nome similar categorizado. O histórico tem prioridade sobre
 * a categorização automática (Claude/keywords), pois reflete escolhas anteriores
 * do usuário. O usuário pode ainda corrigir na tela de revisão.
 */
export function enrichCategoriesFromHistory(items: ExtractedItem[]): void {
  const historical = getAllHistoricalBills()
  if (!historical.length) return

  // Índice: nome normalizado → categoria (prioriza categorias não-"Outros")
  const catByNorm = new Map<string, string>()
  for (const b of historical) {
    if (!b.category || b.category === 'Outros') continue
    const normB = normalizeBillName(b.name)
    if (normB && !catByNorm.has(normB)) catByNorm.set(normB, b.category)
  }

  for (const item of items) {
    const normItem = normalizeBillName(item.cleanName || item.name)
    if (!normItem) continue

    // Busca exata primeiro
    if (catByNorm.has(normItem)) {
      item.category = catByNorm.get(normItem)!
      continue
    }

    // Busca por similaridade (substring ou compactado)
    for (const [normB, cat] of catByNorm) {
      if (namesMatch(normItem, normB)) {
        item.category = cat
        break
      }
    }
  }
}
