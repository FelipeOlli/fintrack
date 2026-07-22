export type BillStatus = 'pago' | 'pendente' | 'divida' | 'vazio'

export type CardType = 'nenhum' | 'credito' | 'debito'

export type Account = {
  id: string
  name: string
  cardType: CardType
  closingDay?: number
  dueDay?: number
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

export type IncomeSource = { id: string; name: string; recurring: boolean; defaultValue?: number }

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

export type AppNotification = {
  id: string
  text: string
  level: number       // 80 | 90 | 100
  monthKey: string
  createdAt: number   // Date.now()
  read: boolean
}
