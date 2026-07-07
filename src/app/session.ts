import type { Bill, ExtractedItem } from '../domain/types'

export type QueuedBill = { name: string; value: number; category: string; status: string; obs: string }

export const session = {
  currentMonth: '',
  currentBills: [] as Bill[],
  extractedData: [] as ExtractedItem[],
  rawText: '',
  editingBillIndex: null as number | null,
  editingAccountId: null as string | null,
  editingCategoryId: null as string | null,
  editingFonteId: null as string | null,
  importAccountId: '' as string,
  importStep: 0 as number,
  importProjection: {} as Record<string, ExtractedItem[]>,
  currentPage: 'dashboard' as string,
  billsFilter: '' as string,
  filterCategoria: '' as string,
  filterConta: '' as string,
  filterStatus: '' as string,
  pendingBillQueue: [] as QueuedBill[],
  pendingBillTotal: 0 as number,
}
