import { describe, expect, it } from 'vitest'
import { detectInstallment, guessCategoryFromDescription, parseTransactionsFromText } from './pdfImportFromText'

describe('pdfImportFromText', () => {
  it('guessCategoryFromDescription maps keywords', () => {
    expect(guessCategoryFromDescription('pagamento enel luz')).toBe('Moradia')
    expect(guessCategoryFromDescription('Uber viagem')).toBe('Transporte')
    expect(guessCategoryFromDescription('ifood pedido')).toBe('Alimentação')
    expect(guessCategoryFromDescription('compra sem match xyzabc')).toBe('Outros')
  })

  it('guessCategoryFromDescription maps Inter merchants', () => {
    expect(guessCategoryFromDescription('POSTO SHELL')).toBe('Transporte')
    expect(guessCategoryFromDescription('ASSAI ATACADISTA LJ128')).toBe('Alimentação')
    expect(guessCategoryFromDescription('SUPER MARKT PILARES')).toBe('Alimentação')
    expect(guessCategoryFromDescription('DROGARIAS PACHECO')).toBe('Saúde')
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

  it('detectInstallment recognizes Inter format "(Parcela 02 de 02)"', () => {
    const result = detectInstallment('RODALIVRE (Parcela 02 de 02)')
    expect(result).not.toBeNull()
    expect(result!.current).toBe(2)
    expect(result!.total).toBe(2)
    expect(result!.cleanName).toBe('RODALIVRE')
  })

  it('detectInstallment recognizes "(Parcela 05 de 10)"', () => {
    const result = detectInstallment('JIM.COM* BARTO COMERC (Parcela 05 de 10)')
    expect(result).not.toBeNull()
    expect(result!.current).toBe(5)
    expect(result!.total).toBe(10)
    expect(result!.cleanName).toBe('JIM.COM* BARTO COMERC')
  })

  it('parseTransactionsFromText filters Inter noise lines', () => {
    const text = `
      14 de fev. 2026 RODALIVRE (Parcela 02 de 02) - R$ 75,00
      06 de mar. 2026 PGTO BOLETO A VISTA MERCADO PAGO INSTITU R$ 749,46
      04 de mar. 2026 PAGAMENTO ON LINE - + R$ 2.883,03
      07 de mar. 2026 IOF - R$ 5,00
      Total CARTÃO 5555****1674 R$ 5,00
      CARTÃO 5555****0742 R$ 2.702,35
    `
    const items = parseTransactionsFromText(text)
    expect(items.length).toBe(2)
    expect(items[0].value).toBe(75)
    expect(items[0].installmentCurrent).toBe(2)
    expect(items[0].installmentTotal).toBe(2)
    expect(items[1].value).toBe(749.46)
  })
})
