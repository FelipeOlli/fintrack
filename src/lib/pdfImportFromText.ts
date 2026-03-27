import { CAT_KW } from '../constants/categories'
import type { BillStatus, ExtractedItem } from '../domain/types'

export function guessCategoryFromDescription(d: string): string {
  const dl = d.toLowerCase()
  for (const [cat, kws] of Object.entries(CAT_KW)) {
    if (kws.some((k) => dl.includes(k))) return cat
  }
  return 'Outros'
}

/**
 * Heurística de linhas de extrato; limita a 80 itens.
 * Testável sem PDF.js (ver testes com string de exemplo).
 */
export function parseTransactionsFromText(text: string): ExtractedItem[] {
  const lines = text
    .split(/\n|\r/)
    .map((l) => l.trim())
    .filter((l) => l.length > 3)
  const results: ExtractedItem[] = []
  const seen = new Set<string>()
  const dateRe = /\b\d{2}[/-]\d{2}(?:[/-]\d{2,4})?\b/
  lines.forEach((line) => {
    const money = [...line.matchAll(/(?:R\$\s*)?(\d{1,3}(?:[.]\d{3})*,\d{2})(?!\d)/g)]
    if (money.length === 0) return
    const lower = line.toLowerCase()
    if (lower.includes('saldo') && money.length < 2) return
    if (
      lower.match(
        /^(data|histórico|descrição|agência|conta|extrato|período|banco|cliente|cpf|cnpj)/,
      )
    )
      return
    money.forEach((m) => {
      const val = parseFloat(m[1].replace(/\./g, '').replace(',', '.'))
      if (val < 1 || val > 99999) return
      let desc = line
        .replace(m[0], '')
        .replace(dateRe, '')
        .replace(/\d{5,}/g, '')
        .replace(/[*#|_-]{2,}/g, '')
        .trim()
        .replace(/\s{2,}/g, ' ')
        .slice(0, 60)
      if (desc.length < 3) desc = 'Lançamento'
      const cat = guessCategoryFromDescription(desc)
      const key = desc.toLowerCase().slice(0, 20) + val
      if (seen.has(key)) return
      seen.add(key)
      results.push({
        name: desc,
        value: val,
        category: cat,
        status: 'pago' as BillStatus,
        selected: true,
      })
    })
  })
  return results.slice(0, 80)
}
