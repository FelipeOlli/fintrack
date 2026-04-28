export type BillStatus = 'pago' | 'pendente' | 'divida' | 'vazio'

export type CardType = 'nenhum' | 'credito' | 'debito'

export type Account = {
  id: string
  name: string
  cardType: CardType
}

export type Bill = {
  name: string
  category: string
  value: number
  status: BillStatus
  obs: string
  accountId?: string
}

export type RecurringTemplate = {
  name: string
  category: string
  value: number
  status: BillStatus
  accountId?: string
}

export type Category = { id: string; name: string; color: string }

export type IncomeSource = { id: string; name: string; recurring: boolean }

export type MonthIncomeEntry = { sourceId: string; value: number }

export type ExtractedItem = {
  name: string
  value: number
  category: string
  status: BillStatus
  selected: boolean
  installmentCurrent?: number
  installmentTotal?: number
  cleanName?: string
  targetMonths?: string[]
  matchStatus?: 'new' | 'duplicate' | 'similar'
  matchedMonthKey?: string
}

export type RecurringValueMode = 'same' | 'zero'
