import { describe, expect, it } from 'vitest'
import { guessCategoryFromDescription, parseTransactionsFromText } from './pdfImportFromText'

describe('pdfImportFromText', () => {
  it('guessCategoryFromDescription maps keywords', () => {
    expect(guessCategoryFromDescription('pagamento enel luz')).toBe('Moradia')
    expect(guessCategoryFromDescription('Uber viagem')).toBe('Transporte')
    expect(guessCategoryFromDescription('ifood pedido')).toBe('Alimentação')
    expect(guessCategoryFromDescription('compra sem match xyzabc')).toBe('Outros')
  })

  it('parseTransactionsFromText extracts BRL amounts', () => {
    const text = `
      02/03/2026 MERCADO EXTRA R$ 45,90
      03/03/2026 PIX NUBANK 120,50
    `
    const items = parseTransactionsFromText(text)
    expect(items.length).toBeGreaterThanOrEqual(1)
    expect(items.every((i) => i.selected)).toBe(true)
    expect(items.some((i) => i.value > 0)).toBe(true)
  })
})
