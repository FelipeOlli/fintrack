import { CAT_KW } from '../constants/categories'
import type { BillStatus, ExtractedItem } from '../domain/types'

/**
 * Normaliza texto colado de tabela web para uso no parser regex (fallback offline).
 * A IA recebe o texto cru e não precisa desta normalização.
 * Insere quebra de linha antes de cada data reconhecida, remove cabeçalhos de tabela.
 */
export function normalizeInvoiceText(txt: string): string {
  return txt
    // remove cabeçalho de tabela "DataMovimentaçãoValor" (colagem direta de tabela web)
    .replace(/Data\s*Movimenta[çc][aã]o\s*Valor/gi, '\n')
    // quebra antes de datas: DD/MM/YYYY, DD/MM/YY, DD/MM
    .replace(/([^\n])(\d{2}\/\d{2}\/(?:\d{4}|\d{2}|\d{0}))/g, '$1\n$2')
    // quebra antes de formato "14 de fev. 2026" ou "14 de fevereiro de 2026"
    .replace(/([^\n])(\d{1,2}\s+de\s+\w{3,}\.?(?:\s+\d{4})?)/gi, '$1\n$2')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

export function guessCategoryFromDescription(d: string): string {
  const dl = d.toLowerCase()
  for (const [cat, kws] of Object.entries(CAT_KW)) {
    if (kws.some((k) => dl.includes(k))) return cat
  }
  return 'Outros'
}

/** Detecta padrão de parcela em descrição (ex: "AMAZON 03/12", "PARC 2/6"). */
export function detectInstallment(
  desc: string,
): { current: number; total: number; cleanName: string } | null {
  const patterns: RegExp[] = [
    /PARC(?:ELA)?\s*(\d{1,2})\s*[/\\]\s*(\d{1,2})/i,
    /\(Parcela\s+(\d{1,2})\s+de\s+(\d{1,2})\)/i,
    /(\d{1,2})\s*[/\\]\s*(\d{1,2})\s*$/,
  ]
  for (const re of patterns) {
    const m = desc.match(re)
    if (!m) continue
    const current = parseInt(m[1], 10)
    const total = parseInt(m[2], 10)
    if (current < 1 || current > total || total < 2 || total > 48) continue
    const cleanName = desc.replace(m[0], '').trim().replace(/\s{2,}/g, ' ')
    return { current, total, cleanName: cleanName || desc }
  }
  return null
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
  const dateExtRe = /\d{1,2}\s+de\s+\w{3,4}\.?\s+\d{4}/g
  let skipRest = false
  lines.forEach((line) => {
    if (skipRest) return
    if (/pr[oó]xima fatura/i.test(line)) { skipRest = true; return }
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
    if (lower.includes('+ r$')) return
    if (/\bpagamento on line\b|\biof\b|\bjuros pgto\b|total cart.o/i.test(lower)) return
    if (/^(despesas da fatura|pr[oó]xima fatura|encargos financeiros|parcelamento|resumo da fatura)/i.test(lower)) return
    if (/cart.o\s+\d{4}\*+/i.test(lower)) return
    if (/\d{4}\*{4}\d+/.test(line)) return
    if (/^\d\s*\+\s*\d+\s+de\s+r\$/i.test(lower)) return
    if (/\b(pagamento m.nimo|limite de cr.dito|valor total financiado|valor total de juros|fatura atual|despesas do m.s|valor antecipado)\b/i.test(lower)) return
    if (/\b(valor do documento|valor cobrado|encargos rotativos|encargos m.ximo)\b/i.test(lower)) return
    money.forEach((m) => {
      const val = parseFloat(m[1].replace(/\./g, '').replace(',', '.'))
      if (val < 1 || val > 99999) return
      let desc = line
        .replace(m[0], '')
        .replace(dateRe, '')
        .replace(dateExtRe, '')
        .replace(/\d{5,}/g, '')
        .replace(/[*#|_-]{2,}/g, '')
        .trim()
        .replace(/\s*-\s*$/, '')
        .replace(/\s{2,}/g, ' ')
        .slice(0, 60)
      if (desc.length < 3) desc = 'Lançamento'
      const cat = guessCategoryFromDescription(desc)
      const key = desc.toLowerCase().slice(0, 20) + val
      if (seen.has(key)) return
      seen.add(key)
      const inst = detectInstallment(desc)
      results.push({
        name: desc,
        value: val,
        category: cat,
        status: 'pendente' as BillStatus,
        selected: true,
        ...(inst && {
          installmentCurrent: inst.current,
          installmentTotal: inst.total,
          cleanName: inst.cleanName,
        }),
      })
    })
  })
  return results.slice(0, 80)
}
