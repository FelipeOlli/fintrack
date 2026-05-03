import type { ExtractedItem } from '../domain/types'
import { deduplicateAcrossMonths, enrichCategoriesFromHistory } from './deduplication'
import { computeInstallmentMonths } from './monthKeyUtils'

/**
 * Distribui itens selecionados por mês.
 * Parcelas geram clones nos meses futuros; itens simples ficam no mês-base.
 * Depois roda deduplicação contra bills existentes em cada mês.
 */
export function buildImportProjection(
  items: ExtractedItem[],
  baseMonthKey: string,
): Record<string, ExtractedItem[]> {
  const projection: Record<string, ExtractedItem[]> = {}

  const push = (key: string, item: ExtractedItem) => {
    if (!projection[key]) projection[key] = []
    projection[key].push(item)
  }

  for (const item of items) {
    if (!item.selected) continue

    if (item.installmentCurrent && item.installmentTotal) {
      const months = computeInstallmentMonths(
        baseMonthKey,
        item.installmentCurrent,
        item.installmentTotal,
      )
      months.forEach((mk, idx) => {
        const parcNum = item.installmentCurrent! + idx
        push(mk, {
          ...item,
          name: `${item.cleanName || item.name} · Parc ${parcNum}/${item.installmentTotal}`,
          installmentCurrent: parcNum,
          targetMonths: months,
        })
      })
    } else {
      push(baseMonthKey, { ...item })
    }
  }

  deduplicateAcrossMonths(projection)
  // herda categorias do histórico para itens ainda sem categoria definida
  enrichCategoriesFromHistory(Object.values(projection).flat())
  return projection
}
