import { mkKey } from '../storage/keys'

/**
 * Determina o mês-alvo de um lançamento de cartão de crédito.
 * O gasto pertence ao mês em que o ciclo está correndo, não ao mês de vencimento.
 * Ex: fechamento dia 3, compra em 18/06 → ciclo 04/06–03/07 → pertence a Junho.
 */
export function creditCardTargetMonth(todayKey: string, dayOfMonth: number, closingDay: number): string {
  return dayOfMonth > closingDay ? todayKey : advanceMonthKey(todayKey, -1)
}

/** Avança (ou retrocede) um monthKey por `offset` meses. */
export function advanceMonthKey(monthKey: string, offset: number): string {
  const [y, m] = monthKey.split('_').map(Number)
  const d = new Date(y, m - 1 + offset, 1)
  return mkKey(d.getFullYear(), d.getMonth())
}

/**
 * Retorna os meses-alvo das parcelas restantes (inclui o mês-base).
 * Ex: baseMonth="2026_05", current=3, total=12 → 10 meses (parcelas 3..12).
 */
export function computeInstallmentMonths(
  baseMonthKey: string,
  currentInstallment: number,
  totalInstallments: number,
): string[] {
  const remaining = totalInstallments - currentInstallment + 1
  const months: string[] = []
  for (let i = 0; i < remaining; i++) {
    months.push(advanceMonthKey(baseMonthKey, i))
  }
  return months
}
