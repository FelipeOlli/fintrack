import { useEffect, useMemo } from 'react'
import './App.css'

import { FinTrackProvider } from './app/FinTrackProvider'
import type { FinTrackCtx } from './app/finTrackTypes'
import { FinTrackContent } from './components/FinTrackContent'
import { FinTrackSidebar } from './components/FinTrackSidebar'
import { FinTrackTopbar } from './components/FinTrackTopbar'
import { session } from './app/session'
import { CAT_COLORS, MONTHS } from './constants/categories'
import type { Bill, BillStatus, CardType, RecurringValueMode } from './domain/types'
import { bumpDash } from './lib/dashboardSync'
import { esc, fmt, setText } from './lib/format'
import { enrichCategoriesFromHistory } from './lib/deduplication'
import { buildImportProjection } from './lib/importProjection'
import { parseTransactionsFromText } from './lib/pdfImportFromText'
import { mkKey } from './storage/keys'
import { advanceMonthKey, creditCardTargetMonth } from './lib/monthKeyUtils'
import {
  appendBillsToMonth,
  clearAllBillsMonths,
  getAccounts,
  getCategories,
  getIncomeSources,
  getRecurringBillsAsBills,
  getRecurringTemplates,
  getTotalMonthIncomeWithFallback,
  getValorFonteComFallback,
  getValorUnicoFonte,
  initPersistence,
  listBillsStorageKeysSorted,
  persistenceUsesApi,
  propagateCategoryChange,
  propagateAccountChange,
  readBillsMonth,
  saveAccounts,
  saveCategories,
  saveIncomeSources,
  saveRecurringTemplates,
  setValorUnicoFonte,
  writeBillsMonth,
} from './storage/persistence'

/* Global from index.html CDN (pdf.js) */
declare const pdfjsLib: {
  getDocument: (opts: { data: ArrayBuffer }) => {
    promise: Promise<{
      numPages: number
      getPage: (n: number) => Promise<{
        getTextContent: () => Promise<{ items: { str: string }[] }>
      }>
    }>
  }
  GlobalWorkerOptions: { workerSrc: string }
}

function askRecurringValueMode(currentValue: number): Promise<RecurringValueMode | 'cancel'> {
  const formatted = (currentValue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return new Promise((resolve) => {
    const modal = document.getElementById('modalRecurringValue')
    const sameBtn = document.getElementById('modalRecurringValueSame') as HTMLButtonElement | null
    const zeroBtn = document.getElementById('modalRecurringValueZero')
    const cancelBtn = document.getElementById('modalRecurringValueCancel')
    const backdrop = document.getElementById('modalRecurringValueBackdrop')
    if (!modal || !sameBtn) { resolve('cancel'); return }
    sameBtn.textContent = `Manter valor atual (${formatted})`
    modal.classList.add('modal-visible')
    const close = (result: RecurringValueMode | 'cancel') => {
      modal.classList.remove('modal-visible')
      sameBtn.removeEventListener('click', onSame)
      zeroBtn?.removeEventListener('click', onZero)
      cancelBtn?.removeEventListener('click', onCancel)
      backdrop?.removeEventListener('click', onCancel)
      resolve(result)
    }
    const onSame = () => close('same')
    const onZero = () => close('zero')
    const onCancel = () => close('cancel')
    sameBtn.addEventListener('click', onSame)
    zeroBtn?.addEventListener('click', onZero)
    cancelBtn?.addEventListener('click', onCancel)
    backdrop?.addEventListener('click', onCancel)
  })
}

async function createRecurringTemplateFromBill(bill: {
  name: string
  category: string
  value: number
  status: BillStatus
  accountId?: string
}) {
  const list = getRecurringTemplates()
  const already = list.some(
    (r) => r.name === bill.name && r.category === bill.category,
  )
  if (already) return
  const mode = await askRecurringValueMode(bill.value || 0)
  if (mode === 'cancel') return
  const tplValue = mode === 'same' ? bill.value || 0 : 0
  list.push({
    name: bill.name,
    category: bill.category,
    value: tplValue,
    status: bill.status,
    accountId: bill.accountId,
  })
  saveRecurringTemplates(list)
}

function isRecurring(bill: Bill): boolean {
  return getRecurringTemplates().some(
    (r) => r.name === bill.name && r.category === bill.category,
  )
}

function showConfirm(msg: string): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.getElementById('modalConfirm')
    const msgEl = document.getElementById('modalConfirmMsg')
    const okBtn = document.getElementById('modalConfirmOk')
    const cancelBtn = document.getElementById('modalConfirmCancel')
    const backdrop = document.getElementById('modalConfirmBackdrop')
    if (!modal || !msgEl || !okBtn || !cancelBtn) { resolve(false); return }
    msgEl.textContent = msg
    modal.classList.add('modal-visible')
    const close = (result: boolean) => {
      modal.classList.remove('modal-visible')
      okBtn.removeEventListener('click', onOk)
      cancelBtn.removeEventListener('click', onCancel)
      backdrop?.removeEventListener('click', onCancel)
      resolve(result)
    }
    const onOk = () => close(true)
    const onCancel = () => close(false)
    okBtn.addEventListener('click', onOk)
    cancelBtn.addEventListener('click', onCancel)
    backdrop?.addEventListener('click', onCancel)
  })
}

function showMonthConfirm(selectedKey: string, todayKey: string): Promise<'selected' | 'today' | 'cancel'> {
  return new Promise((resolve) => {
    const modal = document.getElementById('modalConfirmMonth')
    const keepBtn = document.getElementById('modalConfirmMonthKeep')
    const todayBtn = document.getElementById('modalConfirmMonthToday')
    const cancelBtn = document.getElementById('modalConfirmMonthCancel')
    const backdrop = document.getElementById('modalConfirmMonthBackdrop')
    const keepLabel = document.getElementById('modalConfirmMonthKeepLabel')
    const todayLabel = document.getElementById('modalConfirmMonthTodayLabel')
    if (!modal || !keepBtn || !todayBtn || !cancelBtn) { resolve('cancel'); return }
    const [sy, sm] = selectedKey.split('_').map(Number)
    const [ty, tm] = todayKey.split('_').map(Number)
    if (keepLabel) keepLabel.textContent = `${MONTHS[sm - 1]} ${sy}`
    if (todayLabel) todayLabel.textContent = `${MONTHS[tm - 1]} ${ty}`
    modal.classList.add('modal-visible')
    const close = (result: 'selected' | 'today' | 'cancel') => {
      modal.classList.remove('modal-visible')
      keepBtn.removeEventListener('click', onKeep)
      todayBtn.removeEventListener('click', onToday)
      cancelBtn.removeEventListener('click', onCancel)
      backdrop?.removeEventListener('click', onCancel)
      resolve(result)
    }
    const onKeep = () => close('selected')
    const onToday = () => close('today')
    const onCancel = () => close('cancel')
    keepBtn.addEventListener('click', onKeep)
    todayBtn.addEventListener('click', onToday)
    cancelBtn.addEventListener('click', onCancel)
    backdrop?.addEventListener('click', onCancel)
  })
}

async function descontinuarRecurrente(name: string, category: string) {
  const ok = await showConfirm(`Descontinuar conta recorrente "${name}"? Ela não aparecerá nos próximos meses, mas os meses já salvos permanecem.`)
  if (!ok) return
  const list = getRecurringTemplates().filter(
    (r) => !(r.name === name && r.category === category),
  )
  saveRecurringTemplates(list)
  renderBills()
  showToast('Conta descontinuada. Meses anteriores preservados.')
}

async function tornarRecorrente(bill: Bill) {
  await createRecurringTemplateFromBill({
    name: bill.name,
    category: bill.category,
    value: bill.value || 0,
    status: bill.status,
    accountId: bill.accountId,
  })
  renderBills()
  showToast('Conta definida como recorrente.')
}

function getAccountName(id: string): string {
  const acc = getAccounts().find((a) => a.id === id)
  return acc ? acc.name : '—'
}

function getAccountCardType(id: string): string {
  const acc = getAccounts().find((a) => a.id === id)
  if (!acc) return ''
  const labels: Record<CardType, string> = {
    nenhum: 'Sem cartão',
    credito: 'Crédito',
    debito: 'Débito',
  }
  return labels[acc.cardType] || ''
}

function deleteAccount(id: string) {
  const acc = getAccounts().find((a) => a.id === id)
  if (!acc) return
  if (!confirm(`Excluir a conta "${acc.name}"? Os lançamentos vinculados ficarão sem conta.`)) return
  const list = getAccounts().filter((a) => a.id !== id)
  saveAccounts(list)
  renderContasCadastradas()
  showToast('Conta excluída.')
}

function openEditAccountModal(id: string) {
  const acc = getAccounts().find((a) => a.id === id)
  if (!acc) return
  session.editingAccountId = id
  const nameInput = document.getElementById('modalEditContaName') as HTMLInputElement | null
  const cardSelect = document.getElementById('modalEditContaCardType') as HTMLSelectElement | null
  const closingDayWrap = document.getElementById('modalEditContaClosingDayWrap')
  const closingDayInput = document.getElementById('modalEditContaClosingDay') as HTMLInputElement | null
  if (nameInput) nameInput.value = acc.name
  if (cardSelect) cardSelect.value = acc.cardType
  if (closingDayWrap) closingDayWrap.style.display = acc.cardType === 'credito' ? '' : 'none'
  if (closingDayInput) closingDayInput.value = acc.closingDay != null ? String(acc.closingDay) : ''
  document.getElementById('modalEditConta')?.classList.add('modal-visible')
}

function closeEditAccountModal() {
  session.editingAccountId = null
  document.getElementById('modalEditConta')?.classList.remove('modal-visible')
}

function saveEditAccount() {
  if (!session.editingAccountId) return
  const nameInput = document.getElementById('modalEditContaName') as HTMLInputElement | null
  const cardSelect = document.getElementById('modalEditContaCardType') as HTMLSelectElement | null
  const closingDayInput = document.getElementById('modalEditContaClosingDay') as HTMLInputElement | null
  if (!nameInput || !cardSelect) return
  const name = nameInput.value.trim()
  if (!name) {
    showToast('Informe o nome da conta', true)
    return
  }
  const cardType = cardSelect.value as CardType
  const cdVal = parseInt(closingDayInput?.value || '', 10)
  const closingDay = cardType === 'credito' && !isNaN(cdVal) && cdVal >= 1 && cdVal <= 31 ? cdVal : undefined
  const list = getAccounts().map((a) =>
    a.id === session.editingAccountId
      ? { ...a, name, cardType, closingDay }
      : a,
  )
  saveAccounts(list)
  closeEditAccountModal()
  renderContasCadastradas()
  renderLancamentoModalAccounts()
  showToast('Conta atualizada!')
}

function renderCategoriasPage() {
  const wrap = document.getElementById('categoriasList')
  if (!wrap) return
  const filter = session.billsFilter.toLowerCase()
  const cats = getCategories().filter((c) => !filter || c.name.toLowerCase().includes(filter))
  wrap.innerHTML = `
    <div class="contas-cadastradas-table-wrap">
      <table>
        <thead><tr><th>Nome</th><th>Cor</th><th>Ações</th></tr></thead>
        <tbody>
          ${cats
            .map(
              (c) => `
            <tr>
              <td class="td-name">${esc(c.name)}</td>
              <td><span class="cat-color-dot" style="background:${c.color}"></span> ${esc(c.color)}</td>
              <td class="td-actions">
                <button type="button" class="btn-ghost-sm btn-edit-cat" data-id="${c.id}">Editar</button>
                <button type="button" class="btn-icon btn-del-cat" data-id="${c.id}">🗑</button>
              </td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `
  wrap.querySelectorAll('.btn-edit-cat').forEach((btn) => {
    btn.addEventListener('click', () => openEditCategoryModal((btn as HTMLElement).dataset.id || ''))
  })
  wrap.querySelectorAll('.btn-del-cat').forEach((btn) => {
    btn.addEventListener('click', () => deleteCategory((btn as HTMLElement).dataset.id || ''))
  })
}

function openCategoryModal() {
  session.editingCategoryId = null
  setText('modalCategoriaTitle', 'Nova categoria')
  const modal = document.getElementById('modalCategoria')
  const nameInput = document.getElementById('modalCategoriaName') as HTMLInputElement | null
  const colorInput = document.getElementById('modalCategoriaColor') as HTMLInputElement | null
  if (modal) modal.classList.add('modal-visible')
  if (nameInput) nameInput.value = ''
  if (colorInput) colorInput.value = '#6366f1'
  nameInput?.focus()
}

function closeCategoryModal() {
  session.editingCategoryId = null
  document.getElementById('modalCategoria')?.classList.remove('modal-visible')
}

function openEditCategoryModal(id: string) {
  const cat = getCategories().find((c) => c.id === id)
  if (!cat) return
  session.editingCategoryId = id
  setText('modalCategoriaTitle', 'Editar categoria')
  const nameInput = document.getElementById('modalCategoriaName') as HTMLInputElement | null
  const colorInput = document.getElementById('modalCategoriaColor') as HTMLInputElement | null
  if (nameInput) nameInput.value = cat.name
  if (colorInput) colorInput.value = cat.color
  document.getElementById('modalCategoria')?.classList.add('modal-visible')
}

function saveCategory() {
  const nameInput = document.getElementById('modalCategoriaName') as HTMLInputElement | null
  const colorInput = document.getElementById('modalCategoriaColor') as HTMLInputElement | null
  if (!nameInput || !colorInput) return
  const name = nameInput.value.trim()
  if (!name) {
    showToast('Informe o nome da categoria', true)
    return
  }
  const color = colorInput.value || '#94a3b8'
  const cats = getCategories()
  if (session.editingCategoryId) {
    const idx = cats.findIndex((c) => c.id === session.editingCategoryId)
    if (idx >= 0) {
      cats[idx] = { ...cats[idx], name, color }
      saveCategories(cats)
    }
  } else {
    cats.push({ id: `cat_${Date.now()}`, name, color })
    saveCategories(cats)
  }
  const wasEdit = Boolean(session.editingCategoryId)
  closeCategoryModal()
  renderCategoriasPage()
  renderLancamentoModalCategories()
  showToast(wasEdit ? 'Categoria atualizada!' : 'Categoria adicionada!')
}

function deleteCategory(id: string) {
  const cat = getCategories().find((c) => c.id === id)
  if (!cat) return
  if (!confirm(`Excluir a categoria "${cat.name}"? Os lançamentos que a usam continuarão com o nome.`)) return
  const list = getCategories().filter((c) => c.id !== id)
  saveCategories(list)
  renderCategoriasPage()
  renderLancamentoModalCategories()
  showToast('Categoria excluída.')
}

function renderFontesRendaPage() {
  const wrap = document.getElementById('fontesRendaList')
  if (!wrap) return
  const filter = session.billsFilter.toLowerCase()
  const sources = getIncomeSources().filter((s) => !filter || s.name.toLowerCase().includes(filter))
  if (sources.length === 0) {
    wrap.innerHTML = '<div class="empty"><p>Nenhuma fonte de renda. Use "Nova fonte" para adicionar.</p></div>'
    return
  }
  wrap.innerHTML = `
    <p style="color:var(--text2);margin-bottom:16px">O mês de referência é o selecionado na sidebar. Para adicionar ou alterar valores, use o ícone <strong>Editar</strong> em cada fonte.</p>
    <div class="contas-cadastradas-table-wrap">
      <table>
        <thead><tr><th>Nome</th><th>Recorrente</th><th>Valores no mês</th><th>Ações</th></tr></thead>
        <tbody>
          ${sources
            .map((s) => {
              const valorUnico = getValorFonteComFallback(session.currentMonth, s)
              const valoresDisplay = valorUnico > 0 ? fmt(valorUnico) : '—'
              const defaultTag = s.recurring && s.defaultValue != null ? ` <span style="font-size:0.75rem;color:var(--text3)">(padrão: ${fmt(s.defaultValue)})</span>` : ''
              return `
            <tr>
              <td class="td-name">${esc(s.name)}</td>
              <td>${s.recurring ? `🔄 Sim${defaultTag}` : '— Não'}</td>
              <td class="td-valores" style="font-weight:600;color:var(--text)">${valoresDisplay}</td>
              <td class="td-actions">
                <button type="button" class="btn-ghost-sm btn-edit-fonte" data-id="${s.id}" title="Editar fonte e valor">Editar</button>
                <button type="button" class="btn-ghost-sm btn-toggle-fonte" data-id="${s.id}">${s.recurring ? 'Desmarcar rec.' : 'Marcar rec.'}</button>
                <button type="button" class="btn-icon btn-del-fonte" data-id="${s.id}">🗑</button>
              </td>
            </tr>`
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `
  wrap.querySelectorAll('.btn-edit-fonte').forEach((btn) => {
    btn.addEventListener('click', () => openEditFonteModal((btn as HTMLElement).dataset.id || ''))
  })
  wrap.querySelectorAll('.btn-toggle-fonte').forEach((btn) => {
    btn.addEventListener('click', () => toggleFonteRecurring((btn as HTMLElement).dataset.id || ''))
  })
  wrap.querySelectorAll('.btn-del-fonte').forEach((btn) => {
    btn.addEventListener('click', () => deleteFonte((btn as HTMLElement).dataset.id || ''))
  })
}

function renderModalFonteValores(fonteId: string) {
  const wrap = document.getElementById('modalFonteValoresWrap')
  if (!wrap) return
  const source = getIncomeSources().find((s) => s.id === fonteId)
  const recurring = source?.recurring ?? false
  const explicitValue = getValorUnicoFonte(session.currentMonth, fonteId)
  const isUsingDefault = recurring && explicitValue === 0 && (source?.defaultValue ?? 0) > 0
  const hint = isUsingDefault
    ? `<p style="color:var(--text3);font-size:0.8rem;margin:6px 0 0">💰 Usando valor padrão R$ ${fmt(source!.defaultValue!)}. Salve para registrar um valor específico neste mês.</p>`
    : `<p style="color:var(--text3);font-size:0.8rem;margin:6px 0 0">Um único valor por fonte no mês. Salve para aplicar.</p>`
  const btnPadrao = recurring
    ? `<button type="button" id="btnDefinirPadrao" class="btn btn-outline" style="margin-top:8px;font-size:0.85rem">Definir como novo valor padrão</button>`
    : ''
  wrap.innerHTML = `
    <div class="modal-field" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
      <label htmlFor="modalFonteValorInput">Valor no mês (R$)</label>
      <input type="number" id="modalFonteValorInput" step="0.01" min="0" placeholder="0,00" value="${explicitValue > 0 ? explicitValue : ''}" style="width:140px" />
      ${hint}
      ${btnPadrao}
    </div>
  `
  if (recurring) {
    document.getElementById('btnDefinirPadrao')?.addEventListener('click', () => definirValorPadrao(fonteId))
  }
}

function definirValorPadrao(fonteId: string) {
  const valorInput = document.getElementById('modalFonteValorInput') as HTMLInputElement | null
  const value = parseFloat(valorInput?.value || '0') || 0
  if (value <= 0) {
    showToast('Informe um valor maior que zero', true)
    return
  }
  const list = getIncomeSources()
  const idx = list.findIndex((x) => x.id === fonteId)
  if (idx < 0) return
  list[idx] = { ...list[idx], defaultValue: value }
  saveIncomeSources(list)
  setValorUnicoFonte(session.currentMonth, fonteId, 0)
  updateKPIs()
  renderDashCharts()
  renderModalFonteValores(fonteId)
  renderFontesRendaPage()
  showToast('Valor padrão atualizado!')
}

function toggleDefaultValueWrap(show: boolean) {
  const wrap = document.getElementById('modalFonteDefaultValueWrap')
  if (wrap) wrap.style.display = show ? '' : 'none'
}

function openFonteModal() {
  session.editingFonteId = null
  setText('modalFonteTitle', 'Nova fonte de renda')
  const modal = document.getElementById('modalFonte')
  const nameInput = document.getElementById('modalFonteName') as HTMLInputElement | null
  const recCheck = document.getElementById('modalFonteRecurring') as HTMLInputElement | null
  const defaultInput = document.getElementById('modalFonteDefaultValue') as HTMLInputElement | null
  const valoresSection = document.getElementById('modalFonteValoresSection')
  if (valoresSection) valoresSection.style.display = 'none'
  if (modal) modal.classList.add('modal-visible')
  if (nameInput) nameInput.value = ''
  if (recCheck) {
    recCheck.checked = false
    recCheck.onchange = () => toggleDefaultValueWrap(recCheck.checked)
  }
  if (defaultInput) defaultInput.value = ''
  toggleDefaultValueWrap(false)
  nameInput?.focus()
}

function closeFonteModal() {
  session.editingFonteId = null
  document.getElementById('modalFonte')?.classList.remove('modal-visible')
}

function openEditFonteModal(id: string) {
  const s = getIncomeSources().find((x) => x.id === id)
  if (!s) return
  session.editingFonteId = id
  setText('modalFonteTitle', 'Editar fonte')
  const nameInput = document.getElementById('modalFonteName') as HTMLInputElement | null
  const recCheck = document.getElementById('modalFonteRecurring') as HTMLInputElement | null
  const defaultInput = document.getElementById('modalFonteDefaultValue') as HTMLInputElement | null
  if (nameInput) nameInput.value = s.name
  if (recCheck) {
    recCheck.checked = s.recurring
    recCheck.onchange = () => toggleDefaultValueWrap(recCheck.checked)
  }
  if (defaultInput) defaultInput.value = s.defaultValue != null ? String(s.defaultValue) : ''
  toggleDefaultValueWrap(s.recurring)
  const valoresSection = document.getElementById('modalFonteValoresSection')
  if (valoresSection) valoresSection.style.display = 'block'
  document.getElementById('modalFonte')?.classList.add('modal-visible')
  renderModalFonteValores(id)
}

function saveFonte() {
  const nameInput = document.getElementById('modalFonteName') as HTMLInputElement | null
  const recCheck = document.getElementById('modalFonteRecurring') as HTMLInputElement | null
  if (!nameInput) return
  const name = nameInput.value.trim()
  if (!name) {
    showToast('Informe o nome da fonte', true)
    return
  }
  const recurring = recCheck?.checked ?? false
  const defaultInput = document.getElementById('modalFonteDefaultValue') as HTMLInputElement | null
  const dvRaw = parseFloat(defaultInput?.value || '')
  const defaultValue = recurring && !isNaN(dvRaw) && dvRaw >= 0 ? dvRaw : undefined
  const list = getIncomeSources()
  if (session.editingFonteId) {
    const idx = list.findIndex((x) => x.id === session.editingFonteId)
    if (idx >= 0) {
      list[idx] = { ...list[idx], name, recurring, defaultValue }
      saveIncomeSources(list)
    }
    const valorInput = document.getElementById('modalFonteValorInput') as HTMLInputElement | null
    const value = parseFloat(valorInput?.value || '0') || 0
    setValorUnicoFonte(session.currentMonth, session.editingFonteId, value)
    updateKPIs()
    renderDashCharts()
  } else {
    list.push({ id: `fonte_${Date.now()}`, name, recurring, defaultValue })
    saveIncomeSources(list)
  }
  const wasEditFonte = Boolean(session.editingFonteId)
  closeFonteModal()
  renderFontesRendaPage()
  showToast(wasEditFonte ? 'Fonte atualizada!' : 'Fonte adicionada!')
}

function toggleFonteRecurring(id: string) {
  const list = getIncomeSources()
  const s = list.find((x) => x.id === id)
  if (!s) return
  s.recurring = !s.recurring
  if (!s.recurring) s.defaultValue = undefined
  saveIncomeSources(list)
  renderFontesRendaPage()
  showToast(s.recurring ? 'Fonte marcada como recorrente' : 'Recorrência desmarcada')
}

function deleteFonte(id: string) {
  const s = getIncomeSources().find((x) => x.id === id)
  if (!s) return
  if (!confirm(`Excluir a fonte "${s.name}"?`)) return
  const list = getIncomeSources().filter((x) => x.id !== id)
  saveIncomeSources(list)
  renderFontesRendaPage()
  showToast('Fonte excluída.')
}

function renderContasCadastradas() {
  const wrap = document.getElementById('contasCadastradasList')
  if (!wrap) return
  const filter = session.billsFilter.toLowerCase()
  const accounts = getAccounts().filter((a) => !filter || a.name.toLowerCase().includes(filter))
  if (accounts.length === 0) {
    wrap.innerHTML = '<div class="empty"><p>Nenhuma conta cadastrada. Use "Nova conta" para adicionar.</p></div>'
    return
  }
  wrap.innerHTML = `
    <div class="contas-cadastradas-table-wrap">
      <table>
        <thead><tr><th>Nome</th><th>Tipo de cartão</th><th>Dia de fechamento</th><th>Ações</th></tr></thead>
        <tbody>
          ${accounts
            .map(
              (a) => {
                const closingDayCell = a.cardType === 'credito' && a.closingDay ? `Dia ${a.closingDay}` : '—'
                return `
            <tr>
              <td class="td-name">${esc(a.name)}</td>
              <td>${esc(getAccountCardType(a.id))}</td>
              <td>${esc(closingDayCell)}</td>
              <td class="td-actions">
                <button type="button" class="btn-ghost-sm btn-edit-acc" data-id="${a.id}">Editar</button>
                <button type="button" class="btn-icon btn-del-acc" data-id="${a.id}">🗑</button>
              </td>
            </tr>`
              },
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `
  wrap.querySelectorAll('.btn-edit-acc').forEach((btn) => {
    btn.addEventListener('click', () => openEditAccountModal((btn as HTMLElement).dataset.id || ''))
  })
  wrap.querySelectorAll('.btn-del-acc').forEach((btn) => {
    btn.addEventListener('click', () => deleteAccount((btn as HTMLElement).dataset.id || ''))
  })
}

function renderBills() {
  const tb = document.getElementById('billsBody')
  if (!tb) return
  populateBillFilters()
  tb.innerHTML = ''
  const filter = session.billsFilter.toLowerCase()
  const fCat = session.filterCategoria
  const fConta = session.filterConta
  const fStatus = session.filterStatus
  session.currentBills.forEach((bill, i) => {
    if (filter) {
      const accountLabel = bill.accountId ? getAccountName(bill.accountId) : ''
      const haystack = `${bill.name} ${bill.category} ${bill.obs || ''} ${accountLabel}`.toLowerCase()
      if (!haystack.includes(filter)) return
    }
    if (fCat && bill.category !== fCat) return
    if (fConta && bill.accountId !== fConta) return
    if (fStatus && bill.status !== fStatus) return
    const rec = isRecurring(bill)
    const recorrenteCell = `<button type="button" class="btn-recorrente-toggle${rec ? ' is-active' : ''}">${
      rec ? '🔂' : '❌'
    }</button>`
    const accountLabel = bill.accountId
      ? `${getAccountName(bill.accountId)}${getAccountCardType(bill.accountId) ? ` · ${getAccountCardType(bill.accountId)}` : ''}`
      : '—'
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td class="td-account" title="${esc(accountLabel)}">${esc(accountLabel)}</td>
      <td class="td-name">${esc(bill.name)}</td>
      <td class="td-cat"><span style="color:${CAT_COLORS[bill.category] || '#94a3b8'}">${esc(bill.category)}</span></td>
      <td><input type="number" value="${bill.value || ''}" step="0.01" min="0" placeholder="0,00"></td>
      <td>
        <select>
          <option value="pendente" ${bill.status === 'pendente' ? 'selected' : ''}>⏳ Pendente</option>
          <option value="pago" ${bill.status === 'pago' ? 'selected' : ''}>✅ Pago</option>
          <option value="divida" ${bill.status === 'divida' ? 'selected' : ''}>🔴 Dívida</option>
          <option value="vazio" ${bill.status === 'vazio' ? 'selected' : ''}>— S/ info</option>
        </select>
      </td>
      <td><input type="text" value="${esc(bill.obs || '')}" placeholder="Nota..."></td>
      <td class="td-actions"><div class="td-actions-inner">${recorrenteCell}<button type="button" class="btn-ghost-sm btn-edit-bill" data-i="${i}">Editar</button><button type="button" class="btn-icon btn-del-bill">🗑</button></div></td>
    `
    const valueInput = tr.querySelector('input[type="number"]') as HTMLInputElement
    const statusSelect = tr.querySelector('select') as HTMLSelectElement
    const obsInput = tr.querySelector('input[type="text"]') as HTMLInputElement
    const removeBtn = tr.querySelector('.btn-del-bill') as HTMLButtonElement
    valueInput?.addEventListener('change', () =>
      ubill(i, 'value', valueInput.value),
    )
    statusSelect?.addEventListener('change', () =>
      ubill(i, 'status', statusSelect.value),
    )
    obsInput?.addEventListener('change', () => ubill(i, 'obs', obsInput.value))
    removeBtn?.addEventListener('click', () => rmBill(i))
    const editBtn = tr.querySelector('.btn-edit-bill') as HTMLButtonElement
    editBtn?.addEventListener('click', () => openEditBillModal(i))
    const recBtn = tr.querySelector('.btn-recorrente-toggle') as HTMLButtonElement | null
    if (recBtn) {
      recBtn.addEventListener('click', () => {
        if (isRecurring(bill)) {
          descontinuarRecurrente(bill.name, bill.category)
        } else {
          tornarRecorrente(bill)
        }
      })
    }
    tb.appendChild(tr)
  })
}

function populateBillFilters() {
  const selCat = document.getElementById('filterCategoria') as HTMLSelectElement | null
  const selConta = document.getElementById('filterConta') as HTMLSelectElement | null
  if (selCat) {
    const prev = selCat.value
    selCat.innerHTML = '<option value="">Todas as categorias</option>'
    const cats = Array.from(new Set(session.currentBills.map((b) => b.category).filter(Boolean))).sort()
    cats.forEach((c) => {
      const opt = document.createElement('option')
      opt.value = c
      opt.textContent = c
      selCat.appendChild(opt)
    })
    selCat.value = cats.includes(prev) ? prev : ''
    session.filterCategoria = selCat.value
  }
  if (selConta) {
    const prev = selConta.value
    selConta.innerHTML = '<option value="">Todas as contas</option>'
    const accounts = getAccounts()
    const usedIds = Array.from(new Set(session.currentBills.map((b) => b.accountId).filter(Boolean))) as string[]
    usedIds.forEach((id) => {
      const acc = accounts.find((a) => a.id === id)
      if (!acc) return
      const opt = document.createElement('option')
      opt.value = id
      opt.textContent = acc.name
      selConta.appendChild(opt)
    })
    selConta.value = usedIds.includes(prev) ? prev : ''
    session.filterConta = selConta.value
  }
}

function initMonthSel() {
  const sel = document.getElementById('monthSelect') as HTMLSelectElement | null
  if (!sel) return
  sel.innerHTML = ''
  const now = new Date()
  const keysSet = new Set<string>()
  const opts: { key: string; label: string }[] = []
  const addMonth = (d: Date) => {
    const key = mkKey(d.getFullYear(), d.getMonth())
    if (keysSet.has(key)) return
    keysSet.add(key)
    opts.push({ key, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` })
  }
  // Default range: 3 future + 14 past
  for (let i = 3; i >= 1; i--) addMonth(new Date(now.getFullYear(), now.getMonth() + i, 1))
  for (let i = 0; i < 14; i++) addMonth(new Date(now.getFullYear(), now.getMonth() - i, 1))
  // Extend with months that have saved data (installment projections, etc.)
  for (const raw of listBillsStorageKeysSorted()) {
    const mk = raw.replace('bills_', '')
    if (keysSet.has(mk)) continue
    const [y, m] = mk.split('_').map(Number)
    if (!y || !m) continue
    keysSet.add(mk)
    opts.push({ key: mk, label: `${MONTHS[m - 1]} ${y}` })
  }
  opts.sort((a, b) => (a.key > b.key ? -1 : a.key < b.key ? 1 : 0))
  opts.forEach((o) => {
    const e = document.createElement('option')
    e.value = o.key
    e.textContent = o.label
    sel.appendChild(e)
  })
  sel.value = mkKey(now.getFullYear(), now.getMonth())
  session.currentMonth = sel.value
}

function loadMonth() {
  const sel = document.getElementById('monthSelect') as HTMLSelectElement | null
  if (!sel) return
  session.currentMonth = sel.value
  session.billsFilter = ''
  const searchInput = document.getElementById('globalSearch') as HTMLInputElement | null
  if (searchInput) searchInput.value = ''
  const saved = readBillsMonth(session.currentMonth)
  if (saved !== null) {
    session.currentBills = saved
    // Inject missing recurring templates into existing month
    const templates = getRecurringTemplates()
    let added = false
    for (const tpl of templates) {
      const exists = session.currentBills.some(
        (b) => b.name === tpl.name && b.category === tpl.category,
      )
      if (!exists) {
        session.currentBills.push({
          name: tpl.name,
          category: tpl.category,
          value: tpl.value,
          status: tpl.status as Bill['status'],
          obs: '',
          accountId: tpl.accountId,
        })
        added = true
      }
    }
    if (added) autoSave()
  } else {
    session.currentBills = getRecurringBillsAsBills()
  }
  const parts = session.currentMonth.split('_')
  const monthNum = parseInt(parts[1], 10)
  const monthName = monthNum >= 1 && monthNum <= 12 ? MONTHS[monthNum - 1] : parts[1] || 'Mês'
  const label = `${monthName} ${parts[0] || ''}`
  setText('dashTitle', label)
  setText('contasMonthLabel', label)
  const nextMonthNum = monthNum === 12 ? 1 : monthNum + 1
  const nextYear = monthNum === 12 ? String(Number(parts[0]) + 1) : parts[0]
  const nextMonthName = MONTHS[nextMonthNum - 1]
  setText('dashFaturaLembrete', `📅 Compras deste mês vencem na fatura de ${nextMonthName} ${nextYear}`)
  renderBills()
  updateKPIs()
  renderDashCharts()
  renderHistory()

  if (session.currentPage === 'fontes-renda') renderFontesRendaPage()
  if (session.currentPage === 'contas-cadastradas') renderContasCadastradas()
  if (session.currentPage === 'categorias') renderCategoriasPage()
  if (session.currentPage === 'importar') renderImportAccountSelector()
}

function autoSave() {
  writeBillsMonth(session.currentMonth, session.currentBills)
  renderHistory()
}

function resetAllData() {
  if (!confirm('Tem certeza que deseja apagar todos os meses salvos?')) return

  clearAllBillsMonths()

  session.currentBills = []
  autoSave()
  renderBills()
  updateKPIs()
  renderDashCharts()
  renderHistory()

  showToast('🧹 Todos os dados foram limpos.')
}

function calcTotals() {
  let total = 0
  let pago = 0
  let pend = 0
  let div = 0
  let npend = 0
  let ndiv = 0
  session.currentBills.forEach((b) => {
    const v = b.value || 0
    total += v
    if (b.status === 'pago') pago += v
    else if (b.status === 'pendente') {
      pend += v
      npend++
    } else if (b.status === 'divida') {
      div += v
      ndiv++
    }
  })
  const renda = getTotalMonthIncomeWithFallback(session.currentMonth)
  const diffRenda = total - renda
  const divRenda = Math.abs(diffRenda)
  return {
    total,
    pago,
    pend,
    div,
    divRenda,
    diffRenda,
    renda,
    npend,
    ndiv,
    pct: total > 0 ? Math.round((pago / total) * 100) : 0,
  }
}

function updateKpiTrendBadges(t: ReturnType<typeof calcTotals>) {
  const setBadge = (id: string, text: string, variant: 'up' | 'down' | 'neutral') => {
    const el = document.getElementById(id)
    if (!el) return
    el.textContent = text
    el.classList.remove('kpi-trend--up', 'kpi-trend--down', 'kpi-trend--neutral')
    el.classList.add(`kpi-trend--${variant}`)
    el.style.display = 'inline-flex'
  }
  const n = session.currentBills.length
  setBadge('kpiTotalTrend', n > 0 ? String(n) : '—', n > 0 ? 'neutral' : 'neutral')
  setBadge('kpiPagoTrend', t.total > 0 ? `+${t.pct}%` : '0%', 'up')
  if (t.total > 0 && t.pend > 0) {
    const p = Math.min(999, Math.round((t.pend / t.total) * 100))
    setBadge('kpiPendTrend', `-${p}%`, 'down')
  } else {
    setBadge('kpiPendTrend', '0%', 'neutral')
  }
  const r = t.renda
  if (r > 0) {
    const pct = Math.min(999, Math.round((Math.abs(t.diffRenda) / r) * 100))
    if (t.diffRenda > 0) setBadge('kpiDivTrend', `-${pct}%`, 'down')
    else if (t.diffRenda < 0) setBadge('kpiDivTrend', `+${pct}%`, 'up')
    else setBadge('kpiDivTrend', '0%', 'neutral')
  } else {
    const el = document.getElementById('kpiDivTrend')
    if (el) {
      el.textContent = '—'
      el.classList.remove('kpi-trend--up', 'kpi-trend--down', 'kpi-trend--neutral')
      el.classList.add('kpi-trend--neutral')
    }
  }
}

function updateKPIs() {
  const t = calcTotals()
  setText('kpiTotal', fmt(t.total))
  setText(
    'kpiTotalSub',
    `${session.currentBills.length} lançamento${session.currentBills.length !== 1 ? 's' : ''} no mês`,
  )
  setText('kpiPago', fmt(t.pago))
  setText('kpiPagoSub', `${t.pct}% quitado`)
  setText('kpiPend', fmt(t.pend))
  setText('kpiPendSub', `${t.npend} conta${t.npend !== 1 ? 's' : ''} abertas`)
  // Status orçamento vs renda
  const diff = t.diffRenda || 0
  let tituloOrcamento = 'Dentro do orçamento'
  let subtituloOrcamento = 'Gastos iguais à renda'
  if (diff > 0) {
    tituloOrcamento = 'Fora do orçamento'
    subtituloOrcamento = 'Gastos acima da renda'
  } else if (diff < 0) {
    tituloOrcamento = 'Lucro'
    subtituloOrcamento = 'Renda acima dos gastos'
  }
  setText('kpiDivTotalLabel', tituloOrcamento)
  setText('kpiDivTotal', fmt(t.divRenda))
  setText('kpiDivTotalSub', subtituloOrcamento)
  setText('kpiDivTotalRenda', `Renda: ${fmt(getTotalMonthIncomeWithFallback(session.currentMonth))}`)
  const kpiDiv = document.getElementById('kpiDivTotal')
  if (kpiDiv) {
    kpiDiv.classList.remove('tone-red', 'tone-green', 'tone-yellow')
    if (diff > 0) kpiDiv.classList.add('tone-red')
    else if (diff < 0) kpiDiv.classList.add('tone-green')
    else kpiDiv.classList.add('tone-yellow')
  }
  const bar = document.getElementById('kpiPagoPct') as HTMLDivElement | null
  if (bar) bar.style.width = `${t.pct}%`
  updateKpiTrendBadges(t)
  setText('c_kpiTotal', fmt(t.total))
  setText('c_kpiPago', fmt(t.pago))
  setText('c_kpiPend', fmt(t.pend))
  setText('c_kpiDiv', fmt(t.divRenda))

  bumpDash()
}



function ubill(i: number, f: keyof Bill, v: string) {
  if (!session.currentBills[i]) return
  if (f === 'value') {
    session.currentBills[i].value = parseFloat(v) || 0
  } else if (f === 'status') {
    session.currentBills[i].status = v as BillStatus
  } else if (f === 'obs') {
    session.currentBills[i].obs = v
  }
  updateKPIs()
  renderDashCharts()
  autoSave()
  renderBills()
}

function rmBill(i: number) {
  const bill = session.currentBills[i]
  if (!bill) return
  if (!confirm(`Remover ${bill.name}?`)) return
  session.currentBills.splice(i, 1)
  renderBills()
  updateKPIs()
  renderDashCharts()
  autoSave()
}

function openAccountModal() {
  const modal = document.getElementById('modalConta')
  const nameInput = document.getElementById('modalContaName') as HTMLInputElement | null
  const cardSelect = document.getElementById('modalContaCardType') as HTMLSelectElement | null
  const closingDayWrap = document.getElementById('modalContaClosingDayWrap')
  const closingDayInput = document.getElementById('modalContaClosingDay') as HTMLInputElement | null
  if (modal) modal.classList.add('modal-visible')
  if (nameInput) nameInput.value = ''
  if (cardSelect) cardSelect.value = 'nenhum'
  if (closingDayWrap) closingDayWrap.style.display = 'none'
  if (closingDayInput) closingDayInput.value = ''
  nameInput?.focus()
}

function closeAccountModal() {
  document.getElementById('modalConta')?.classList.remove('modal-visible')
}

function saveNewAccount() {
  const nameInput = document.getElementById('modalContaName') as HTMLInputElement | null
  const cardSelect = document.getElementById('modalContaCardType') as HTMLSelectElement | null
  const closingDayInput = document.getElementById('modalContaClosingDay') as HTMLInputElement | null
  if (!nameInput || !cardSelect) return
  const name = nameInput.value.trim()
  if (!name) {
    showToast('Informe o nome da conta', true)
    return
  }
  const cardType = cardSelect.value as CardType
  const cdVal = parseInt(closingDayInput?.value || '', 10)
  const closingDay = cardType === 'credito' && !isNaN(cdVal) && cdVal >= 1 && cdVal <= 31 ? cdVal : undefined
  const accounts = getAccounts()
  const id = `acc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  accounts.push({ id, name, cardType, closingDay })
  saveAccounts(accounts)
  closeAccountModal()
  showToast('✅ Conta cadastrada!')
  renderLancamentoModalAccounts()
}

function updateParcelasHint() {
  const hint = document.getElementById('modalLancParcelasHint')
  const parcelasInput = document.getElementById('modalLancParcelas') as HTMLInputElement | null
  const valueInput = document.getElementById('modalLancValue') as HTMLInputElement | null
  if (!hint) return
  const parcelas = Math.max(1, parseInt(parcelasInput?.value || '1', 10) || 1)
  const value = parseFloat(valueInput?.value || '0') || 0
  if (parcelas <= 1 || value <= 0) { hint.style.display = 'none'; return }
  const valorParcela = Math.round((value / parcelas) * 100) / 100
  const targetMonth = calcBillTargetMonth((document.getElementById('modalLancAccount') as HTMLSelectElement | null)?.value || '')
  const [y, m] = targetMonth.split('_').map(Number)
  hint.textContent = `💳 ${parcelas}x de R$ ${valorParcela.toFixed(2).replace('.', ',')} — primeira em ${MONTHS[m - 1]}/${y}`
  hint.style.display = 'block'
}

function openLancamentoModal() {
  session.editingBillIndex = null
  renderLancamentoModalAccounts()
  renderLancamentoModalCategories()
  const modal = document.getElementById('modalLancamento')
  const titleEl = document.getElementById('modalLancTitle')
  if (titleEl) titleEl.textContent = 'Novo lançamento'
  if (modal) modal.classList.add('modal-visible')
  clearLancamentoForm()
  const parcelasInput = document.getElementById('modalLancParcelas') as HTMLInputElement | null
  const valueInput = document.getElementById('modalLancValue') as HTMLInputElement | null
  parcelasInput?.removeEventListener('input', updateParcelasHint)
  parcelasInput?.addEventListener('input', updateParcelasHint)
  valueInput?.removeEventListener('input', updateParcelasHint)
  valueInput?.addEventListener('input', updateParcelasHint)
  const nameInput = document.getElementById('modalLancName') as HTMLInputElement | null
  nameInput?.focus()
}

function clearLancamentoForm() {
  const nameInput = document.getElementById('modalLancName') as HTMLInputElement | null
  const valueInput = document.getElementById('modalLancValue') as HTMLInputElement | null
  const recCheck = document.getElementById('modalLancRecurring') as HTMLInputElement | null
  const catSelect = document.getElementById('modalLancCat') as HTMLSelectElement | null
  const statusSelect = document.getElementById('modalLancStatus') as HTMLSelectElement | null
  const accountSelect = document.getElementById('modalLancAccount') as HTMLSelectElement | null
  const obsInput = document.getElementById('modalLancObs') as HTMLInputElement | null
  if (nameInput) nameInput.value = ''
  if (valueInput) valueInput.value = ''
  if (recCheck) recCheck.checked = false
  if (catSelect && catSelect.options.length > 0) catSelect.selectedIndex = 0
  if (statusSelect) statusSelect.value = 'pendente'
  if (accountSelect && accountSelect.options.length > 0) accountSelect.selectedIndex = 0
  if (obsInput) obsInput.value = ''
  const docFile = document.getElementById('modalLancDocFile') as HTMLInputElement | null
  const docName = document.getElementById('modalLancDocName')
  if (docFile) docFile.value = ''
  if (docName) docName.textContent = ''
  const parcelasInput = document.getElementById('modalLancParcelas') as HTMLInputElement | null
  const parcelasHint = document.getElementById('modalLancParcelasHint')
  if (parcelasInput) parcelasInput.value = '1'
  if (parcelasHint) parcelasHint.style.display = 'none'
  updateLancamentoModalHint('')
}

function openEditBillModal(i: number) {
  const bill = session.currentBills[i]
  if (!bill) return
  session.editingBillIndex = i
  renderLancamentoModalAccounts()
  renderLancamentoModalCategories()
  const titleEl = document.getElementById('modalLancTitle')
  if (titleEl) titleEl.textContent = 'Editar lançamento'
  document.getElementById('modalLancamento')?.classList.add('modal-visible')
  const nameInput = document.getElementById('modalLancName') as HTMLInputElement | null
  const valueInput = document.getElementById('modalLancValue') as HTMLInputElement | null
  const catSelect = document.getElementById('modalLancCat') as HTMLSelectElement | null
  const statusSelect = document.getElementById('modalLancStatus') as HTMLSelectElement | null
  const accountSelect = document.getElementById('modalLancAccount') as HTMLSelectElement | null
  const recCheck = document.getElementById('modalLancRecurring') as HTMLInputElement | null
  const obsInput = document.getElementById('modalLancObs') as HTMLInputElement | null
  if (nameInput) nameInput.value = bill.name
  if (valueInput) valueInput.value = String(bill.value || '')
  if (catSelect) catSelect.value = bill.category
  if (statusSelect) statusSelect.value = bill.status
  if (accountSelect) accountSelect.value = bill.accountId || ''
  if (recCheck) recCheck.checked = isRecurring(bill)
  if (obsInput) obsInput.value = bill.obs || ''
  nameInput?.focus()
}

function renderLancamentoModalCategories() {
  const sel = document.getElementById('modalLancCat') as HTMLSelectElement | null
  if (!sel) return
  const cats = getCategories()
  sel.innerHTML = cats.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')
}

function calcBillTargetMonth(accountId: string): string {
  const acc = getAccounts().find((a) => a.id === accountId)
  const today = new Date()
  const todayKey = mkKey(today.getFullYear(), today.getMonth())
  if (acc?.cardType === 'credito' && acc.closingDay) {
    return creditCardTargetMonth(todayKey, today.getDate(), acc.closingDay)
  }
  return session.currentMonth
}

function updateLancamentoModalHint(accountId: string) {
  const hint = document.getElementById('modalLancAccountHint') as HTMLElement | null
  if (!hint) return
  const today = new Date()
  const todayKey = mkKey(today.getFullYear(), today.getMonth())
  const acc = accountId ? getAccounts().find((a) => a.id === accountId) : undefined
  if (acc?.cardType === 'credito' && acc.closingDay) {
    const target = calcBillTargetMonth(accountId)
    const [y, m] = target.split('_').map(Number)
    hint.textContent = `📅 Será salvo em ${MONTHS[m - 1]} ${y}`
    hint.style.display = 'block'
    return
  }
  if (session.currentMonth !== todayKey) {
    const [y, m] = session.currentMonth.split('_').map(Number)
    hint.textContent = `⚠️ Mês selecionado: ${MONTHS[m - 1]} ${y}`
    hint.style.display = 'block'
    return
  }
  hint.style.display = 'none'
}

function renderLancamentoModalAccounts() {
  const sel = document.getElementById('modalLancAccount') as HTMLSelectElement | null
  if (!sel) return
  const accounts = getAccounts()
  sel.innerHTML = accounts.length === 0
    ? '<option value="">Cadastre uma conta antes</option>'
    : '<option value="">Selecione a conta</option>' +
      accounts.map((a) => `<option value="${a.id}">${esc(a.name)} (${getAccountCardType(a.id)})</option>`).join('')
  sel.removeEventListener('change', onLancAccountChange)
  sel.addEventListener('change', onLancAccountChange)
}

function onLancAccountChange(e: Event) {
  updateLancamentoModalHint((e.target as HTMLSelectElement).value)
}

function closeLancamentoModal() {
  document.getElementById('modalLancamento')?.classList.remove('modal-visible')
}

async function saveLancamentoModal() {
  if (session.editingBillIndex !== null) {
    saveEditBill()
    return
  }
  await addBill()
}

async function addBill() {
  const accountSelect = document.getElementById('modalLancAccount') as HTMLSelectElement | null
  const nameInput = document.getElementById('modalLancName') as HTMLInputElement | null
  const valueInput = document.getElementById('modalLancValue') as HTMLInputElement | null
  const catSelect = document.getElementById('modalLancCat') as HTMLSelectElement | null
  const statusSelect = document.getElementById('modalLancStatus') as HTMLSelectElement | null
  const recurringCheck = document.getElementById('modalLancRecurring') as HTMLInputElement | null
  const obsInput = document.getElementById('modalLancObs') as HTMLInputElement | null
  if (!nameInput || !valueInput || !catSelect || !statusSelect) return
  const accountId = accountSelect?.value || ''
  if (!accountId) {
    showToast('Selecione uma conta', true)
    return
  }
  const name = nameInput.value.trim()
  if (!name) {
    showToast('Informe o nome/descrição', true)
    return
  }
  const parcelasInput = document.getElementById('modalLancParcelas') as HTMLInputElement | null
  const parcelas = Math.max(1, parseInt(parcelasInput?.value || '1', 10) || 1)
  const category = catSelect.value
  const value = parseFloat(valueInput.value) || 0
  const status = statusSelect.value as BillStatus
  const obs = obsInput?.value?.trim() || ''

  if (parcelas > 1 && recurringCheck?.checked) {
    showToast('Parcelas e recorrente são incompatíveis — escolha um', true)
    return
  }

  let targetMonth = calcBillTargetMonth(accountId)

  const acc = accountId ? getAccounts().find((a) => a.id === accountId) : undefined
  const isCreditWithClosing = acc?.cardType === 'credito' && acc.closingDay
  if (!isCreditWithClosing) {
    const todayKey = mkKey(new Date().getFullYear(), new Date().getMonth())
    if (session.currentMonth !== todayKey) {
      const choice = await showMonthConfirm(session.currentMonth, todayKey)
      if (choice === 'cancel') return
      if (choice === 'today') targetMonth = todayKey
    }
  }

  const commitBill = (tMonth: string) => {
    if (parcelas <= 1) {
      const newBill = { name, category, value, status, obs, accountId: accountId || undefined }
      if (tMonth === session.currentMonth) {
        session.currentBills.push(newBill)
        autoSave()
        showToast('✅ Lançamento adicionado!')
      } else {
        const future = readBillsMonth(tMonth) ?? []
        future.push(newBill)
        writeBillsMonth(tMonth, future)
        const [y, m] = tMonth.split('_').map(Number)
        showToast(`📅 Lançamento salvo em ${MONTHS[m - 1]} ${y}`)
      }
      if (recurringCheck?.checked) {
        const list = getRecurringTemplates()
        const already = list.some((r) => r.name === name && r.category === category)
        if (!already) {
          list.push({ name, category, value, status, accountId: accountId || undefined })
          saveRecurringTemplates(list)
        }
      }
    } else {
      const valorParcela = Math.round((value / parcelas) * 100) / 100
      for (let k = 0; k < parcelas; k++) {
        const monthKey = advanceMonthKey(tMonth, k)
        const isLast = k === parcelas - 1
        const parcelaValue = isLast ? Math.round((value - valorParcela * (parcelas - 1)) * 100) / 100 : valorParcela
        const billItem = {
          name: `${name} · Parc ${k + 1}/${parcelas}`,
          category,
          value: parcelaValue,
          status,
          obs,
          accountId: accountId || undefined,
        }
        if (monthKey === session.currentMonth) {
          session.currentBills.push(billItem)
        } else {
          const future = readBillsMonth(monthKey) ?? []
          future.push(billItem)
          writeBillsMonth(monthKey, future)
        }
      }
      autoSave()
      const [y, m] = tMonth.split('_').map(Number)
      showToast(`✅ ${parcelas}x de R$ ${valorParcela.toFixed(2).replace('.', ',')} registradas a partir de ${MONTHS[m - 1]}/${y}`)
    }
  }

  commitBill(targetMonth)
  renderBills()
  updateKPIs()
  renderDashCharts()
  closeLancamentoModal()
}

function saveEditBill() {
  if (session.editingBillIndex === null) return
  const accountSelect = document.getElementById('modalLancAccount') as HTMLSelectElement | null
  const nameInput = document.getElementById('modalLancName') as HTMLInputElement | null
  const valueInput = document.getElementById('modalLancValue') as HTMLInputElement | null
  const catSelect = document.getElementById('modalLancCat') as HTMLSelectElement | null
  const statusSelect = document.getElementById('modalLancStatus') as HTMLSelectElement | null
  const recurringCheck = document.getElementById('modalLancRecurring') as HTMLInputElement | null
  const obsInput = document.getElementById('modalLancObs') as HTMLInputElement | null
  if (!nameInput || !valueInput || !catSelect || !statusSelect) return
  const bill = session.currentBills[session.editingBillIndex]
  if (!bill) return
  const name = nameInput.value.trim()
  if (!name) {
    showToast('Informe o nome/descrição', true)
    return
  }
  const category = catSelect.value
  const value = parseFloat(valueInput.value) || 0
  const status = statusSelect.value as BillStatus
  const obs = obsInput?.value?.trim() || ''
  const accountId = accountSelect?.value || undefined
  const oldCategory = bill.category
  const wasRec = isRecurring(bill)
  const nowRec = recurringCheck?.checked ?? false
  if (nowRec && !wasRec) {
    const list = getRecurringTemplates()
    list.push({ name, category, value, status, accountId })
    saveRecurringTemplates(list)
  } else if (!nowRec && wasRec) {
    const list = getRecurringTemplates().filter((r) => !(r.name === bill.name && r.category === bill.category))
    saveRecurringTemplates(list)
  }
  session.currentBills[session.editingBillIndex] = {
    name,
    category,
    value,
    status,
    obs,
    accountId: accountId || undefined,
  }
  if (category !== oldCategory) {
    propagateCategoryChange(bill.name, oldCategory, category, session.currentMonth)
    const recTemplates = getRecurringTemplates()
    const recIdx = recTemplates.findIndex((r) => r.name === bill.name && r.category === oldCategory)
    if (recIdx >= 0) {
      recTemplates[recIdx].category = category
      saveRecurringTemplates(recTemplates)
    }
  }
  if ((accountId || undefined) !== bill.accountId) {
    propagateAccountChange(bill.name, category, accountId || undefined, session.currentMonth)
  }
  session.editingBillIndex = null
  closeLancamentoModal()
  renderBills()
  updateKPIs()
  renderDashCharts()
  autoSave()
  showToast('Lançamento atualizado!')
}

function renderDashCharts() {
  renderRendaChart()
}

function renderRendaChart() {
  const el = document.getElementById('dashRendaBars')
  if (!el) return
  const renda = getTotalMonthIncomeWithFallback(session.currentMonth)
  const t = calcTotals()
  const scale = Math.max(renda, t.total, 1)
  const rendaRestante = Math.max(0, renda - t.pago)
  const aPagar = Math.max(0, t.total - t.pago)
  const pctVerde = (rendaRestante / scale) * 100
  const pctVermelho = (aPagar / scale) * 100
  const labelVerde = rendaRestante > 0 ? `Renda restante: ${fmt(rendaRestante)}` : ''
  const labelVermelho = aPagar > 0 ? `A pagar: ${fmt(aPagar)}` : ''
  if (renda <= 0 && t.total <= 0) {
    el.innerHTML = '<div class="empty" style="padding:20px"><p>Cadastre fontes em Fontes de renda e informe os valores do mês</p></div>'
    return
  }
  el.innerHTML = `
    <div class="renda-bar-track" title="${renda > 0 ? `Renda: ${fmt(renda)}` : ''}${renda > 0 && t.total > 0 ? ' · ' : ''}${t.total > 0 ? `Gastos: ${fmt(t.total)} · Pago: ${fmt(t.pago)}` : ''}">
      ${pctVerde > 0 ? `<div class="renda-bar-fill renda-bar-verde" style="width:${pctVerde.toFixed(1)}%" title="${labelVerde}"></div>` : ''}
      ${pctVermelho > 0 ? `<div class="renda-bar-fill renda-bar-vermelho" style="width:${pctVermelho.toFixed(1)}%" title="${labelVermelho}"></div>` : ''}
    </div>
    <div class="renda-bar-legend">
      ${pctVerde > 0 ? `<span class="renda-legend-verde">● Renda restante ${fmt(rendaRestante)}</span>` : ''}
      ${pctVermelho > 0 ? `<span class="renda-legend-vermelho">● A pagar ${fmt(aPagar)}</span>` : ''}
      ${pctVerde <= 0 && pctVermelho <= 0 ? `<span class="renda-legend-ok">● Tudo quitado</span>` : ''}
    </div>
  `
}

function renderHistory() {
  const grid = document.getElementById('historyGrid')
  if (!grid) return
  const allK = [...listBillsStorageKeysSorted()].reverse()
  if (allK.length === 0) {
    grid.innerHTML =
      '<div class="empty"><div class="em-icon">📅</div><p>Nenhum mês salvo ainda.</p></div>'
    return
  }
  grid.innerHTML = allK
    .map((k) => {
      let bills: Bill[] = []
      try {
        bills = JSON.parse(localStorage.getItem(k) || '[]') as Bill[]
        if (!Array.isArray(bills)) bills = []
      } catch {
        bills = []
      }
      const total = bills.reduce((s, b) => s + (b.value || 0), 0)
      const pago = bills
        .filter((b) => b.status === 'pago')
        .reduce((s, b) => s + (b.value || 0), 0)
      const pts = k.replace('bills_', '').split('_')
      const monthNum = parseInt(pts[1], 10)
      const monthName = monthNum >= 1 && monthNum <= 12 ? MONTHS[monthNum - 1] : '???'
      const label = `${monthName} ${pts[0] || ''}`
      const pct = total > 0 ? Math.round((pago / total) * 100) : 0
      const mkey = k.replace('bills_', '')
      return `<div class="hist-card" onclick="document.getElementById('monthSelect').value='${mkey}';(${loadMonth.name})();(${navigate.name})('dashboard', document.querySelector('[data-nav-page=dashboard]'))">
      <div class="hist-month">${label}</div>
      <div class="hist-total">${fmt(total)}</div>
      <div class="hist-meta">✅ ${fmt(pago)} pago · ${bills.length} contas · ${pct}%</div>
      <div class="hist-bar"><div class="hist-bar-fill" style="width:${pct}%"></div></div>
    </div>`
    })
    .join('')
}

async function handlePdf(file: File | null | undefined) {
  if (!file) return
  const proc = document.getElementById('pdfProc')
  const status = document.getElementById('pdfStatus')
  if (!proc || !status) return
  proc.classList.add('visible')
  status.textContent = `Lendo: ${file.name}`
  try {
    const ab = await file.arrayBuffer()
    // Strip leading null bytes (Inter PDFs have ~435KB of zeros before %PDF header)
    const view = new Uint8Array(ab)
    let pdfData: ArrayBuffer = ab
    for (let i = 0; i < Math.min(view.length - 4, 1_000_000); i++) {
      if (view[i] === 0x25 && view[i + 1] === 0x50 && view[i + 2] === 0x44 && view[i + 3] === 0x46) {
        if (i > 0) pdfData = ab.slice(i)
        break
      }
    }
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise
    let txt = ''
    for (let p = 1; p <= pdf.numPages; p++) {
      const pg = await pdf.getPage(p)
      const ct = await pg.getTextContent()
      txt += `${ct.items.map((i) => i.str).join(' ')}\n`
    }
    session.rawText = txt
    status.textContent = `Analisando lançamentos...`

    // Tenta API do Claude se backend disponível
    let usedApi = false
    if (persistenceUsesApi()) {
      try {
        const catNames = getCategories().map((c) => c.name)
        const base = import.meta.env.VITE_API_URL || ''
        const url = base.startsWith('http') ? base : ''
        const res = await fetch(`${url}/api/parse-invoice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: txt, categories: catNames }),
        })
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data.items) && data.items.length > 0) {
            session.extractedData = data.items.map((it: {
              name: string; value: number; category: string;
              installmentCurrent?: number; installmentTotal?: number; cleanName?: string;
            }) => ({
              name: (it.name || 'Lançamento').slice(0, 60),
              value: it.value || 0,
              category: it.category || 'Outros',
              status: 'pendente' as BillStatus,
              selected: true,
              ...(it.installmentCurrent && it.installmentTotal ? {
                installmentCurrent: it.installmentCurrent,
                installmentTotal: it.installmentTotal,
                cleanName: it.cleanName || it.name,
              } : {}),
            }))
            usedApi = true
          }
        }
      } catch {
        // fallback silencioso para parser local
      }
    }

    if (!usedApi) {
      session.extractedData = parseTransactionsFromText(txt)
    }

    enrichCategoriesFromHistory(session.extractedData)
    session.importStep = 1
    renderExtracted()
    renderImportSteps()
    proc.classList.remove('visible')
  } catch {
    proc.classList.remove('visible')
    showToast('Erro ao ler PDF. Verifique se não é protegido.', true)
  }
}

async function analyzeBillDocument(file: File | undefined) {
  if (!file) return

  if (!persistenceUsesApi()) {
    showToast('Análise de documento requer conexão com a API', true)
    return
  }

  const btn = document.getElementById('modalLancDocBtn') as HTMLButtonElement | null
  const nameSpan = document.getElementById('modalLancDocName')
  if (btn) { btn.disabled = true; btn.textContent = 'Analisando...' }
  if (nameSpan) nameSpan.textContent = file.name

  try {
    const catNames = getCategories().map((c) => c.name)
    const base = import.meta.env.VITE_API_URL || ''
    const url = base.startsWith('http') ? base : ''

    let body: Record<string, unknown>

    if (file.type === 'application/pdf') {
      const ab = await file.arrayBuffer()
      const view = new Uint8Array(ab)
      let pdfData: ArrayBuffer = ab
      for (let i = 0; i < Math.min(view.length - 4, 1_000_000); i++) {
        if (view[i] === 0x25 && view[i + 1] === 0x50 && view[i + 2] === 0x44 && view[i + 3] === 0x46) {
          if (i > 0) pdfData = ab.slice(i)
          break
        }
      }
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise
      let txt = ''
      for (let p = 1; p <= pdf.numPages; p++) {
        const pg = await pdf.getPage(p)
        const ct = await pg.getTextContent()
        txt += `${ct.items.map((i) => i.str).join(' ')}\n`
      }
      body = { type: 'text', content: txt, categories: catNames }
    } else {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result as string
          const img = new Image()
          img.onload = () => {
            const MAX = 1500
            let { width, height } = img
            if (width > MAX || height > MAX) {
              if (width > height) { height = Math.round(height * MAX / width); width = MAX }
              else { width = Math.round(width * MAX / height); height = MAX }
            }
            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
            const resized = canvas.toDataURL('image/jpeg', 0.85)
            resolve(resized.split(',')[1] ?? '')
          }
          img.onerror = reject
          img.src = dataUrl
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      body = { type: 'image', content: b64, mimeType: 'image/jpeg', categories: catNames }
    }

    const res = await fetch(`${url}/api/analyze-bill-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      showToast((err as { error?: string }).error || 'Erro ao analisar documento', true)
      return
    }

    const data = await res.json() as { bill: { name?: string; value?: number; category?: string; status?: string; obs?: string } }
    const bill = data.bill

    const nameInput = document.getElementById('modalLancName') as HTMLInputElement | null
    const valueInput = document.getElementById('modalLancValue') as HTMLInputElement | null
    const catSelect = document.getElementById('modalLancCat') as HTMLSelectElement | null
    const statusSelect = document.getElementById('modalLancStatus') as HTMLSelectElement | null
    const obsInput = document.getElementById('modalLancObs') as HTMLInputElement | null

    if (nameInput && bill.name) nameInput.value = bill.name
    if (valueInput && bill.value != null) valueInput.value = String(bill.value)
    if (catSelect && bill.category) {
      const opt = Array.from(catSelect.options).find((o) => o.value === bill.category)
      if (opt) catSelect.value = bill.category
    }
    if (statusSelect && bill.status) {
      const validStatuses = ['pendente', 'pago', 'divida', 'vazio']
      if (validStatuses.includes(bill.status)) statusSelect.value = bill.status
    }
    if (obsInput && bill.obs) obsInput.value = bill.obs

    showToast('✅ Campos preenchidos pela IA — confira antes de salvar')
  } catch {
    showToast('Erro ao processar documento', true)
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📎 Anexar documento' }
  }
}

function renderExtracted() {
  const sec = document.getElementById('extSection')
  const rawBox = document.getElementById('rawBox')
  const cnt = document.getElementById('extCount')
  const items = document.getElementById('extItems')
  if (!sec || !rawBox || !cnt || !items) return
  sec.style.display = 'block'
  rawBox.textContent = session.rawText
  cnt.textContent = `${session.extractedData.length} lançamentos encontrados`
  if (session.extractedData.length === 0) {
    items.innerHTML =
      '<div class="empty"><p>Nenhum lançamento detectado. Veja o texto bruto abaixo.</p></div>'
    return
  }
  items.innerHTML = session.extractedData
    .map(
      (it, i) => `
    <div class="ext-item">
      <input type="checkbox" id="ec${i}" ${
        it.selected ? 'checked' : ''
      } onchange="window.__extToggle && window.__extToggle(${i}, this.checked)">
      <label for="ec${i}" class="ext-name">${esc(it.name)}${
        it.installmentCurrent && it.installmentTotal
          ? ` <span class="installment-badge">Parc ${it.installmentCurrent}/${it.installmentTotal}</span>`
          : ''
      }</label>
      <select onchange="window.__extUpdateCat && window.__extUpdateCat(${i}, this.value)">
        ${(() => {
          const cats = getCategories().map((c) => c.name)
          if (it.category && !cats.includes(it.category)) cats.push(it.category)
          return cats.map((c) => `<option ${c === it.category ? 'selected' : ''} value="${esc(c)}">${esc(c)}</option>`).join('')
        })()}
      </select>
      <input type="number" value="${
        it.value
      }" step="0.01" min="0" onchange="window.__extUpdateVal && window.__extUpdateVal(${i}, this.value)">
      <select onchange="window.__extUpdateStatus && window.__extUpdateStatus(${i}, this.value)">
        <option value="pago" ${
          it.status === 'pago' ? 'selected' : ''
        }>✅ Pago</option>
        <option value="pendente" ${
          it.status === 'pendente' ? 'selected' : ''
        }>⏳ Pendente</option>
        <option value="divida" ${
          it.status === 'divida' ? 'selected' : ''
        }>🔴 Dívida</option>
      </select>
    </div>`,
    )
    .join('')
}

function toggleAllExt(v: boolean) {
  session.extractedData = session.extractedData.map((it) => ({ ...it, selected: v }))
  session.extractedData.forEach((_, i) => {
    const c = document.getElementById(`ec${i}`) as HTMLInputElement | null
    if (c) c.checked = v
  })
}

function importSelected() {
  const sel = session.extractedData.filter((i) => i.selected)
  if (sel.length === 0) {
    showToast('Nenhum item selecionado', true)
    return
  }
  sel.forEach((it) =>
    session.currentBills.push({
      name: it.name,
      category: it.category,
      value: it.value,
      status: it.status,
      obs: 'Extrato PDF',
    }),
  )
  autoSave()
  renderBills()
  updateKPIs()
  renderDashCharts()
  showToast(`✅ ${sel.length} lançamento(s) importado(s)!`)
  navigate(
    'contas',
    document.querySelector('[data-nav-page="contas"]') as HTMLElement,
  )
}

function renderImportSteps() {
  const step0 = document.getElementById('importStep0')
  const step1 = document.getElementById('importStep1')
  const step2 = document.getElementById('importStep2')
  if (!step0 || !step1 || !step2) return
  step0.style.display = session.importStep === 0 ? 'block' : 'none'
  step1.style.display = session.importStep === 1 ? 'block' : 'none'
  step2.style.display = session.importStep === 2 ? 'block' : 'none'
}

function setImportStep(step: number) {
  session.importStep = step
  renderImportSteps()
  if (step === 0) {
    renderImportAccountSelector()
  }
}

function renderImportAccountSelector() {
  const sel = document.getElementById('importAccountSelect') as HTMLSelectElement | null
  if (!sel) return
  const accounts = getAccounts()
  const credit = accounts.filter((a) => a.cardType === 'credito')
  const others = accounts.filter((a) => a.cardType !== 'credito')
  sel.innerHTML =
    '<option value="">Selecione a conta / cartão</option>' +
    [...credit, ...others]
      .map(
        (a) =>
          `<option value="${a.id}" ${a.id === session.importAccountId ? 'selected' : ''}>${esc(a.name)}${a.cardType === 'credito' ? ' (Crédito)' : a.cardType === 'debito' ? ' (Débito)' : ''}</option>`,
      )
      .join('')
}

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('_').map(Number)
  return `${MONTHS[m - 1] || monthKey} ${y}`
}

function buildAndShowPreview() {
  const sel = session.extractedData.filter((i) => i.selected)
  if (sel.length === 0) {
    showToast('Nenhum item selecionado', true)
    return
  }
  session.importProjection = buildImportProjection(sel, session.currentMonth)
  session.importStep = 2
  renderImportSteps()
  renderImportPreview()
}

function renderImportPreview() {
  const container = document.getElementById('importPreviewContent')
  if (!container) return

  const monthKeys = Object.keys(session.importProjection).sort()
  if (monthKeys.length === 0) {
    container.innerHTML = '<p>Nenhum item para importar.</p>'
    return
  }

  let html = ''
  let globalIdx = 0

  for (const mk of monthKeys) {
    const items = session.importProjection[mk]
    const dupes = items.filter((i) => i.matchStatus === 'duplicate').length
    const total = items.length

    html += `<div class="import-month-group">
      <div class="import-month-header">
        <strong>${esc(formatMonthLabel(mk))}</strong>
        <span>${total} ite${total === 1 ? 'm' : 'ns'}${dupes > 0 ? ` · ${dupes} duplicado${dupes > 1 ? 's' : ''}` : ''}</span>
      </div>`

    for (const item of items) {
      const isDup = item.matchStatus === 'duplicate'
      const isSim = item.matchStatus === 'similar'
      const cls = isDup ? 'match-duplicate' : isSim ? 'match-similar' : ''
      const badge = isDup
        ? `<span class="dup-badge">Duplicado</span>`
        : isSim
          ? `<span class="sim-badge">Similar</span>`
          : `<span class="new-badge">Novo</span>`

      html += `<div class="ext-item ${cls}">
        <input type="checkbox" id="ip${globalIdx}" ${item.selected ? 'checked' : ''}
          onchange="window.__importPreviewToggle && window.__importPreviewToggle('${mk}', ${items.indexOf(item)}, this.checked)">
        <label for="ip${globalIdx}" class="ext-name">${esc(item.name)} ${badge}</label>
        <span class="ext-val">${fmt(item.value)}</span>
        <span class="ext-cat">${esc(item.category)}</span>
      </div>`
      globalIdx++
    }
    html += '</div>'
  }

  container.innerHTML = html
}

function importConfirmed() {
  const projection = session.importProjection
  const monthKeys = Object.keys(projection)
  let totalImported = 0

  for (const mk of monthKeys) {
    const items = projection[mk].filter((i) => i.selected)
    if (items.length === 0) continue

    const bills: Bill[] = items.map((it) => ({
      name: it.name,
      category: it.category,
      value: it.value,
      status: it.status,
      obs: it.installmentCurrent && it.installmentTotal
        ? `Fatura PDF · Parc ${it.installmentCurrent}/${it.installmentTotal}`
        : 'Fatura PDF',
      ...(session.importAccountId ? { accountId: session.importAccountId } : {}),
    }))

    if (mk === session.currentMonth) {
      session.currentBills.push(...bills)
      autoSave()
    } else {
      appendBillsToMonth(mk, bills)
    }
    totalImported += bills.length
  }

  if (totalImported === 0) {
    showToast('Nenhum item selecionado para importar', true)
    return
  }

  renderBills()
  updateKPIs()
  renderDashCharts()
  showToast(`${totalImported} lançamento(s) importado(s) em ${monthKeys.length} mês(es)!`)

  // Reset wizard
  session.importStep = 0
  session.importProjection = {}
  session.extractedData = []
  session.importAccountId = ''
  renderImportSteps()

  navigate(
    'contas',
    document.querySelector('[data-nav-page="contas"]') as HTMLElement,
  )
}

function navigate(page: string, navEl?: Element | null) {
  session.currentPage = page
  session.billsFilter = ''
  const searchInput = document.getElementById('globalSearch') as HTMLInputElement | null
  if (searchInput) searchInput.value = ''
  document.querySelectorAll<HTMLElement>('.page').forEach((p) => {
    p.style.display = 'none'
  })
  const pageEl = document.getElementById(`page-${page}`)
  if (pageEl) pageEl.style.display = 'block'
  document.querySelectorAll('.nav-item').forEach((n) => {
    n.classList.remove('active')
  })
  if (navEl) navEl.classList.add('active')
  const titles: Record<string, [string, string]> = {
    dashboard: ['Dashboard', 'Visão geral do mês'],
    contas: ['Contas do Mês', 'Gerencie seus lançamentos'],
    'contas-cadastradas': ['Contas', 'Métodos de pagamento e cartões'],
    categorias: ['Categorias', 'Controle de categorias de gastos'],
    'fontes-renda': ['Fontes de renda', 'Cadastre fontes e adicione os valores do mês'],
    importar: ['Importar Fatura / Extrato', 'Importe faturas de cartão com projeção de parcelas'],
    historico: ['Histórico', 'Todos os meses registrados'],
  }
  const t = titles[page] || ['', '']
  setText('topbarTitle', t[0])
  setText('topbarSub', t[1])
  closeSidebar()
  if (page === 'dashboard') {
    updateKPIs()
    renderDashCharts()
  }
  if (page === 'historico') {
    renderHistory()
  }
  if (page === 'contas-cadastradas') {
    renderContasCadastradas()
  }
  if (page === 'categorias') {
    renderCategoriasPage()
  }
  if (page === 'fontes-renda') {
    renderFontesRendaPage()
  }
  if (page === 'importar') {
    renderImportAccountSelector()
    renderImportSteps()
  }
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar')
  const ov = document.getElementById('overlay')
  if (!sb || !ov) return
  sb.classList.toggle('open')
  ov.classList.toggle('visible')
}

function closeSidebar() {
  const sb = document.getElementById('sidebar')
  const ov = document.getElementById('overlay')
  if (!sb || !ov) return
  sb.classList.remove('open')
  ov.classList.remove('visible')
}

function showToast(msg: string, err = false) {
  const t = document.getElementById('toast')
  if (!t) return
  t.textContent = msg
  t.className = `toast ${err ? 'err' : 'ok'}`
  t.style.display = 'block'
  setTimeout(() => {
    t.style.display = 'none'
  }, 2600)
}

declare global {
  interface Window {
    __extToggle?: (i: number, checked: boolean) => void
    __extUpdateCat?: (i: number, cat: string) => void
    __extUpdateVal?: (i: number, value: string) => void
    __extUpdateStatus?: (i: number, status: string) => void
    __importPreviewToggle?: (monthKey: string, idx: number, checked: boolean) => void
    __importAccountChange?: (accountId: string) => void
  }
}

function App() {
  useEffect(() => {
    void (async () => {
      try {
        if (typeof pdfjsLib !== 'undefined') {
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
        }

        await initPersistence()
        initMonthSel()
        loadMonth()

        const globalSearchInput = document.getElementById('globalSearch') as HTMLInputElement | null
        if (globalSearchInput) {
          globalSearchInput.addEventListener('input', () => {
            session.billsFilter = globalSearchInput.value
            if (session.currentPage === 'contas') renderBills()
            else if (session.currentPage === 'categorias') renderCategoriasPage()
            else if (session.currentPage === 'contas-cadastradas') renderContasCadastradas()
            else if (session.currentPage === 'fontes-renda') renderFontesRendaPage()
          })
        }

        const selCat = document.getElementById('filterCategoria') as HTMLSelectElement | null
        const selConta = document.getElementById('filterConta') as HTMLSelectElement | null
        const selStatus = document.getElementById('filterStatus') as HTMLSelectElement | null
        const btnLimpar = document.getElementById('btnLimparFiltros') as HTMLButtonElement | null

        if (selCat) selCat.addEventListener('change', () => { session.filterCategoria = selCat.value; renderBills() })
        if (selConta) selConta.addEventListener('change', () => { session.filterConta = selConta.value; renderBills() })
        if (selStatus) selStatus.addEventListener('change', () => { session.filterStatus = selStatus.value; renderBills() })
        if (btnLimpar) {
          btnLimpar.addEventListener('click', () => {
            session.filterCategoria = ''
            session.filterConta = ''
            session.filterStatus = ''
            if (selCat) selCat.value = ''
            if (selConta) selConta.value = ''
            if (selStatus) selStatus.value = ''
            renderBills()
          })
        }
      } catch (err) {
        console.error('Erro ao inicializar app:', err)
        showToast(
          persistenceUsesApi()
            ? 'Não foi possível ligar à API (dados). Verifique VITE_API_URL e o servidor.'
            : 'Erro ao inicializar.',
          true,
        )
      }
    })()

    const dz = document.getElementById('dropZone')
    if (dz) {
      dz.addEventListener('dragover', (e) => {
        e.preventDefault()
        dz.classList.add('over')
      })
      dz.addEventListener('dragleave', () => dz.classList.remove('over'))
      dz.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault()
        dz.classList.remove('over')
        const f = e.dataTransfer?.files?.[0]
        if (f && f.type === 'application/pdf') handlePdf(f)
        else showToast('Envie um arquivo PDF', true)
      })
    }

    window.__extToggle = (i, checked) => {
      if (!session.extractedData[i]) return
      session.extractedData[i].selected = checked
    }
    window.__extUpdateCat = (i, cat) => {
      if (!session.extractedData[i]) return
      session.extractedData[i].category = cat
    }
    window.__extUpdateVal = (i, value) => {
      if (!session.extractedData[i]) return
      session.extractedData[i].value = parseFloat(value) || 0
    }
    window.__extUpdateStatus = (i, status) => {
      if (!session.extractedData[i]) return
      session.extractedData[i].status = status as BillStatus
    }
    window.__importPreviewToggle = (monthKey, idx, checked) => {
      const items = session.importProjection[monthKey]
      if (items && items[idx]) items[idx].selected = checked
    }
    window.__importAccountChange = (accountId) => {
      session.importAccountId = accountId
    }
  }, [])

  const finTrackApi = useMemo<FinTrackCtx>(
    () => ({
      navigate,
      goToPage: (page: string) => {
        const el = document.querySelector(`[data-nav-page="${page}"]`) as HTMLElement
        navigate(page, el)
      },
      loadMonth,
      resetAllData,
      toggleSidebar,
      closeSidebar,
      openAccountModal,
      openLancamentoModal,
      openCategoryModal,
      openFonteModal,
      closeAccountModal,
      saveNewAccount,
      closeEditAccountModal,
      saveEditAccount,
      closeCategoryModal,
      saveCategory,
      closeFonteModal,
      saveFonte,
      closeLancamentoModal,
      saveLancamentoModal,
      handlePdf,
      analyzeBillDocument,
      toggleAllExt,
      importSelected,
      buildAndShowPreview,
      importConfirmed,
      setImportStep,
    }),
    [],
  )

  return (
    <FinTrackProvider value={finTrackApi}>
      <div className="overlay" id="overlay" onClick={closeSidebar} />

      <FinTrackSidebar />

      <div className="main">
        <FinTrackTopbar />

        <FinTrackContent />
      </div>
    </FinTrackProvider>
  )
}

export default App
