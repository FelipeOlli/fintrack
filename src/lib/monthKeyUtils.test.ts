import { describe, expect, it } from 'vitest'
import { creditCardTargetMonth } from './monthKeyUtils'

describe('creditCardTargetMonth', () => {
  // Formato: "YYYY_MM" onde MM é 1-indexed (mkKey usa getMonth() que é 0-indexed,
  // mas aqui testamos a lógica pura passando todayKey já formatado)

  describe('fechamento dia 3 (Inter PF)', () => {
    it('compra no dia 18/06 → Junho (meio do ciclo 04/06–03/07)', () => {
      expect(creditCardTargetMonth('2026_06', 18, 3)).toBe('2026_06')
    })
    it('compra no dia 04/06 → Junho (início do ciclo)', () => {
      expect(creditCardTargetMonth('2026_06', 4, 3)).toBe('2026_06')
    })
    it('compra no dia 03/06 → Maio (ainda no ciclo 04/05–03/06)', () => {
      expect(creditCardTargetMonth('2026_06', 3, 3)).toBe('2026_05')
    })
    it('compra no dia 01/06 → Maio (ciclo anterior)', () => {
      expect(creditCardTargetMonth('2026_06', 1, 3)).toBe('2026_05')
    })
    it('compra no dia 02/07 → Junho (ainda no ciclo 04/06–03/07)', () => {
      expect(creditCardTargetMonth('2026_07', 2, 3)).toBe('2026_06')
    })
    it('compra no dia 04/07 → Julho (novo ciclo 04/07–03/08)', () => {
      expect(creditCardTargetMonth('2026_07', 4, 3)).toBe('2026_07')
    })
  })

  describe('fechamento dia 10', () => {
    it('compra no dia 15/06 → Junho (ciclo 11/06–10/07)', () => {
      expect(creditCardTargetMonth('2026_06', 15, 10)).toBe('2026_06')
    })
    it('compra no dia 10/06 → Maio (ainda no ciclo 11/05–10/06)', () => {
      expect(creditCardTargetMonth('2026_06', 10, 10)).toBe('2026_05')
    })
    it('compra no dia 11/06 → Junho (início do novo ciclo)', () => {
      expect(creditCardTargetMonth('2026_06', 11, 10)).toBe('2026_06')
    })
    it('compra no dia 09/07 → Junho (fim do ciclo 11/06–10/07)', () => {
      expect(creditCardTargetMonth('2026_07', 9, 10)).toBe('2026_06')
    })
  })

  describe('fechamento dia 20', () => {
    it('compra no dia 25/06 → Junho (ciclo 21/06–20/07)', () => {
      expect(creditCardTargetMonth('2026_06', 25, 20)).toBe('2026_06')
    })
    it('compra no dia 20/06 → Maio (ainda no ciclo 21/05–20/06)', () => {
      expect(creditCardTargetMonth('2026_06', 20, 20)).toBe('2026_05')
    })
    it('compra no dia 21/06 → Junho (início do novo ciclo)', () => {
      expect(creditCardTargetMonth('2026_06', 21, 20)).toBe('2026_06')
    })
    it('compra no dia 19/07 → Junho (fim do ciclo 21/06–20/07)', () => {
      expect(creditCardTargetMonth('2026_07', 19, 20)).toBe('2026_06')
    })
  })

  describe('fechamento dia 25', () => {
    it('compra no dia 28/06 → Junho (ciclo 26/06–25/07)', () => {
      expect(creditCardTargetMonth('2026_06', 28, 25)).toBe('2026_06')
    })
    it('compra no dia 25/06 → Maio (ciclo 26/05–25/06)', () => {
      expect(creditCardTargetMonth('2026_06', 25, 25)).toBe('2026_05')
    })
    it('compra no dia 26/06 → Junho (início do novo ciclo)', () => {
      expect(creditCardTargetMonth('2026_06', 26, 25)).toBe('2026_06')
    })
  })

  describe('virada de ano', () => {
    it('fechamento dia 15, compra no dia 10/01 → Dezembro do ano anterior', () => {
      expect(creditCardTargetMonth('2026_01', 10, 15)).toBe('2025_12')
    })
    it('fechamento dia 15, compra no dia 16/01 → Janeiro', () => {
      expect(creditCardTargetMonth('2026_01', 16, 15)).toBe('2026_01')
    })
    it('fechamento dia 3, compra no dia 02/01 → Dezembro do ano anterior', () => {
      expect(creditCardTargetMonth('2026_01', 2, 3)).toBe('2025_12')
    })
  })
})
