import { useEffect } from 'react'
import './App.css'

declare const pdfjsLib: any

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

const CAT_COLORS: Record<string, string> = {
  Moradia: '#2563eb',
  Transporte: '#3b82f6',
  Alimentação: '#16a34a',
  Saúde: '#f97316',
  Lazer: '#6366f1',
  Financeiro: '#0ea5e9',
  Outros: '#9ca3af',
}

const CAT_KW: Record<string, string[]> = {
  Moradia: [
    'água',
    'luz',
    'gás',
    'aluguel',
    'condomínio',
    'iptu',
    'energia',
    'enel',
    'sabesp',
    'copel',
    'cemig',
    'comgás',
  ],
  Transporte: [
    'uber',
    '99',
    'combustível',
    'gasolina',
    'estacionamento',
    'pedágio',
    'ipva',
    'detran',
    'carro',
    'moto',
    'ônibus',
    'metrô',
  ],
  Alimentação: [
    'supermercado',
    'mercado',
    'ifood',
    'rappi',
    'restaurante',
    'lanchonete',
    'padaria',
    'açougue',
    'comida',
    'refeição',
    'extra',
    'carrefour',
    'atacadão',
  ],
  Saúde: [
    'farmácia',
    'drogaria',
    'plano de saúde',
    'consulta',
    'médico',
    'hospital',
    'unimed',
    'amil',
    'hapvida',
  ],
  Lazer: [
    'netflix',
    'spotify',
    'amazon',
    'disney',
    'hbo',
    'streaming',
    'cinema',
    'teatro',
    'viagem',
    'hotel',
    'airbnb',
    'game',
  ],
  Financeiro: [
    'inter',
    'nubank',
    'caixa',
    'bradesco',
    'itaú',
    'santander',
    'banco',
    'fatura',
    'cartão',
    'empréstimo',
    'mercadopago',
    'picpay',
    'pix',
  ],
}

type BillStatus = 'pago' | 'pendente' | 'divida' | 'vazio'

type CardType = 'nenhum' | 'credito' | 'debito'

type Account = {
  id: string
  name: string
  cardType: CardType
}

type Bill = {
  name: string
  category: string
  value: number
  status: BillStatus
  obs: string
  accountId?: string
}

type RecurringTemplate = {
  name: string
  category: string
  value: number
  status: BillStatus
  accountId?: string
}

const ACCOUNTS_STORAGE_KEY = 'fintrack_accounts'

const RECURRING_STORAGE_KEY = 'recurring_bills'

const CATEGORIES_STORAGE_KEY = 'fintrack_categories'

const INCOME_SOURCES_KEY = 'fintrack_income_sources'

function incomeKey(monthKey: string) {
  return `income_${monthKey}`
}

type Category = { id: string; name: string; color: string }

type IncomeSource = { id: string; name: string; recurring: boolean }

type MonthIncomeEntry = { sourceId: string; value: number }

function getCategories(): Category[] {
  try {
    const raw = localStorage.getItem(CATEGORIES_STORAGE_KEY)
    if (!raw) return Object.entries(CAT_COLORS).map(([name], i) => ({ id: `cat_${i}`, name, color: CAT_COLORS[name] || '#94a3b8' }))
    const parsed = JSON.parse(raw) as Category[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : Object.entries(CAT_COLORS).map(([name], i) => ({ id: `cat_${i}`, name, color: CAT_COLORS[name] || '#94a3b8' }))
  } catch {
    return Object.entries(CAT_COLORS).map(([name], i) => ({ id: `cat_${i}`, name, color: CAT_COLORS[name] || '#94a3b8' }))
  }
}

function saveCategories(cats: Category[]) {
  localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(cats))
}

function getIncomeSources(): IncomeSource[] {
  try {
    const raw = localStorage.getItem(INCOME_SOURCES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as IncomeSource[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveIncomeSources(sources: IncomeSource[]) {
  localStorage.setItem(INCOME_SOURCES_KEY, JSON.stringify(sources))
}

function getMonthIncome(monthKey: string): MonthIncomeEntry[] {
  try {
    const raw = localStorage.getItem(incomeKey(monthKey))
    if (!raw) return []
    const parsed = JSON.parse(raw) as MonthIncomeEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function setMonthIncome(monthKey: string, entries: MonthIncomeEntry[]) {
  localStorage.setItem(incomeKey(monthKey), JSON.stringify(entries))
}

function getTotalMonthIncome(monthKey: string): number {
  return getMonthIncome(monthKey).reduce((s, e) => s + e.value, 0)
}

type ExtractedItem = {
  name: string
  value: number
  category: string
  status: BillStatus
  selected: boolean
}

const DEFAULT_BILLS: Bill[] = []

let currentMonth = ''
let currentBills: Bill[] = []
let extractedData: ExtractedItem[] = []
let rawText = ''

function mkKey(y: number, m: number) {
  return `${y}_${String(m + 1).padStart(2, '0')}`
}

function storKey(k: string) {
  return `bills_${k}`
}

function getRecurringTemplates(): RecurringTemplate[] {
  try {
    const raw = localStorage.getItem(RECURRING_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecurringTemplate[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveRecurringTemplates(templates: RecurringTemplate[]) {
  localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(templates))
}

function getRecurringBillsAsBills(): Bill[] {
  return getRecurringTemplates().map((r) => ({
    name: r.name,
    category: r.category,
    value: r.value,
    status: r.status,
    obs: '',
    accountId: r.accountId,
  }))
}

function isRecurring(bill: Bill): boolean {
  return getRecurringTemplates().some(
    (r) => r.name === bill.name && r.category === bill.category,
  )
}

function descontinuarRecurrente(name: string, category: string) {
  if (!confirm(`Descontinuar conta recorrente "${name}"? Ela não aparecerá nos próximos meses, mas os meses já salvos permanecem.`)) return
  const list = getRecurringTemplates().filter(
    (r) => !(r.name === name && r.category === category),
  )
  saveRecurringTemplates(list)
  renderBills()
  showToast('Conta descontinuada. Meses anteriores preservados.')
}

function tornarRecorrente(bill: Bill) {
  const list = getRecurringTemplates()
  const already = list.some(
    (r) => r.name === bill.name && r.category === bill.category,
  )
  if (!already) {
    list.push({
      name: bill.name,
      category: bill.category,
      value: bill.value,
      status: bill.status,
      accountId: bill.accountId,
    })
    saveRecurringTemplates(list)
    renderBills()
    showToast('Conta definida como recorrente.')
  }
}

function getAccounts(): Account[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Account[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveAccounts(accounts: Account[]) {
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts))
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

let editingAccountId: string | null = null

function openEditAccountModal(id: string) {
  const acc = getAccounts().find((a) => a.id === id)
  if (!acc) return
  editingAccountId = id
  const nameInput = document.getElementById('modalEditContaName') as HTMLInputElement | null
  const cardSelect = document.getElementById('modalEditContaCardType') as HTMLSelectElement | null
  if (nameInput) nameInput.value = acc.name
  if (cardSelect) cardSelect.value = acc.cardType
  document.getElementById('modalEditConta')?.classList.add('modal-visible')
}

function closeEditAccountModal() {
  editingAccountId = null
  document.getElementById('modalEditConta')?.classList.remove('modal-visible')
}

function saveEditAccount() {
  if (!editingAccountId) return
  const nameInput = document.getElementById('modalEditContaName') as HTMLInputElement | null
  const cardSelect = document.getElementById('modalEditContaCardType') as HTMLSelectElement | null
  if (!nameInput || !cardSelect) return
  const name = nameInput.value.trim()
  if (!name) {
    showToast('Informe o nome da conta', true)
    return
  }
  const list = getAccounts().map((a) =>
    a.id === editingAccountId
      ? { ...a, name, cardType: cardSelect.value as CardType }
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
  const cats = getCategories()
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

let editingCategoryId: string | null = null

function openCategoryModal() {
  editingCategoryId = null
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
  editingCategoryId = null
  document.getElementById('modalCategoria')?.classList.remove('modal-visible')
}

function openEditCategoryModal(id: string) {
  const cat = getCategories().find((c) => c.id === id)
  if (!cat) return
  editingCategoryId = id
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
  if (editingCategoryId) {
    const idx = cats.findIndex((c) => c.id === editingCategoryId)
    if (idx >= 0) {
      cats[idx] = { ...cats[idx], name, color }
      saveCategories(cats)
    }
  } else {
    cats.push({ id: `cat_${Date.now()}`, name, color })
    saveCategories(cats)
  }
  closeCategoryModal()
  renderCategoriasPage()
  renderLancamentoModalCategories()
  showToast(editingCategoryId ? 'Categoria atualizada!' : 'Categoria adicionada!')
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
  const sources = getIncomeSources()
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
              const valorUnico = getValorUnicoFonte(currentMonth, s.id)
              const valoresDisplay = valorUnico > 0 ? fmt(valorUnico) : '—'
              return `
            <tr>
              <td class="td-name">${esc(s.name)}</td>
              <td>${s.recurring ? '🔄 Sim' : '— Não'}</td>
              <td class="td-valores" style="font-weight:600;color:var(--text1)">${valoresDisplay}</td>
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

function getValorUnicoFonte(monthKey: string, sourceId: string): number {
  const entries = getMonthIncome(monthKey).filter((e) => e.sourceId === sourceId)
  if (entries.length === 0) return 0
  return entries.reduce((s, e) => s + e.value, 0)
}

function setValorUnicoFonte(monthKey: string, sourceId: string, value: number) {
  const list = getMonthIncome(monthKey).filter((e) => e.sourceId !== sourceId)
  if (value > 0) list.push({ sourceId, value })
  setMonthIncome(monthKey, list)
}

function renderModalFonteValores(fonteId: string) {
  const wrap = document.getElementById('modalFonteValoresWrap')
  if (!wrap) return
  const valorUnico = getValorUnicoFonte(currentMonth, fonteId)
  wrap.innerHTML = `
    <div class="modal-field" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
      <label htmlFor="modalFonteValorInput">Valor no mês (R$)</label>
      <input type="number" id="modalFonteValorInput" step="0.01" min="0" placeholder="0,00" value="${valorUnico > 0 ? valorUnico : ''}" style="width:140px" />
      <p style="color:var(--text3);font-size:0.8rem;margin:6px 0 0">Um único valor por fonte no mês. Salve para aplicar.</p>
    </div>
  `
}

let editingFonteId: string | null = null

function openFonteModal() {
  editingFonteId = null
  setText('modalFonteTitle', 'Nova fonte de renda')
  const modal = document.getElementById('modalFonte')
  const nameInput = document.getElementById('modalFonteName') as HTMLInputElement | null
  const recCheck = document.getElementById('modalFonteRecurring') as HTMLInputElement | null
  const valoresSection = document.getElementById('modalFonteValoresSection')
  if (valoresSection) valoresSection.style.display = 'none'
  if (modal) modal.classList.add('modal-visible')
  if (nameInput) nameInput.value = ''
  if (recCheck) recCheck.checked = false
  nameInput?.focus()
}

function closeFonteModal() {
  editingFonteId = null
  document.getElementById('modalFonte')?.classList.remove('modal-visible')
}

function openEditFonteModal(id: string) {
  const s = getIncomeSources().find((x) => x.id === id)
  if (!s) return
  editingFonteId = id
  setText('modalFonteTitle', 'Editar fonte')
  const nameInput = document.getElementById('modalFonteName') as HTMLInputElement | null
  const recCheck = document.getElementById('modalFonteRecurring') as HTMLInputElement | null
  if (nameInput) nameInput.value = s.name
  if (recCheck) recCheck.checked = s.recurring
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
  const list = getIncomeSources()
  if (editingFonteId) {
    const idx = list.findIndex((x) => x.id === editingFonteId)
    if (idx >= 0) {
      list[idx] = { ...list[idx], name, recurring }
      saveIncomeSources(list)
    }
    const valorInput = document.getElementById('modalFonteValorInput') as HTMLInputElement | null
    const value = parseFloat(valorInput?.value || '0') || 0
    setValorUnicoFonte(currentMonth, editingFonteId, value)
    updateKPIs()
    renderDashCharts()
  } else {
    list.push({ id: `fonte_${Date.now()}`, name, recurring })
    saveIncomeSources(list)
  }
  closeFonteModal()
  renderFontesRendaPage()
  showToast(editingFonteId ? 'Fonte atualizada!' : 'Fonte adicionada!')
}

function toggleFonteRecurring(id: string) {
  const list = getIncomeSources()
  const s = list.find((x) => x.id === id)
  if (!s) return
  s.recurring = !s.recurring
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
  const accounts = getAccounts()
  if (accounts.length === 0) {
    wrap.innerHTML = '<div class="empty"><p>Nenhuma conta cadastrada. Use "Nova conta" para adicionar.</p></div>'
    return
  }
  wrap.innerHTML = `
    <div class="contas-cadastradas-table-wrap">
      <table>
        <thead><tr><th>Nome</th><th>Tipo de cartão</th><th>Ações</th></tr></thead>
        <tbody>
          ${accounts
            .map(
              (a) => `
            <tr>
              <td class="td-name">${esc(a.name)}</td>
              <td>${esc(getAccountCardType(a.id))}</td>
              <td class="td-actions">
                <button type="button" class="btn-ghost-sm btn-edit-acc" data-id="${a.id}">Editar</button>
                <button type="button" class="btn-icon btn-del-acc" data-id="${a.id}">🗑</button>
              </td>
            </tr>`,
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
  tb.innerHTML = ''
  currentBills.forEach((bill, i) => {
    const rec = isRecurring(bill)
    const recorrenteCell = rec
      ? `<span class="badge-recorrente">🔄 Recorrente</span> <button type="button" class="btn-ghost-sm btn-descontinuar">Descontinuar</button>`
      : `<button type="button" class="btn-ghost-sm btn-tornar-recorrente">Tornar recorrente</button>`
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
      <td class="td-recorrente">${recorrenteCell}</td>
      <td class="td-actions"><button type="button" class="btn-ghost-sm btn-edit-bill" data-i="${i}">Editar</button><button class="btn-icon">🗑</button></td>
    `
    const valueInput = tr.querySelector('input[type="number"]') as HTMLInputElement
    const statusSelect = tr.querySelector('select') as HTMLSelectElement
    const obsInput = tr.querySelector('input[type="text"]') as HTMLInputElement
    const removeBtn = tr.querySelector('td:last-child button') as HTMLButtonElement
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
    if (rec) {
      const btnDescontinuar = tr.querySelector('.btn-descontinuar') as HTMLButtonElement
      btnDescontinuar?.addEventListener('click', () =>
        descontinuarRecurrente(bill.name, bill.category),
      )
    } else {
      const btnTornar = tr.querySelector('.btn-tornar-recorrente') as HTMLButtonElement
      btnTornar?.addEventListener('click', () => tornarRecorrente(bill))
    }
    tb.appendChild(tr)
  })
}

function initMonthSel() {
  const sel = document.getElementById('monthSelect') as HTMLSelectElement | null
  if (!sel) return
  sel.innerHTML = ''
  const now = new Date()
  const opts: { key: string; label: string }[] = []
  for (let i = 3; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    opts.push({
      key: mkKey(d.getFullYear(), d.getMonth()),
      label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    })
  }
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    opts.push({
      key: mkKey(d.getFullYear(), d.getMonth()),
      label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    })
  }
  opts.forEach((o) => {
    const e = document.createElement('option')
    e.value = o.key
    e.textContent = o.label
    sel.appendChild(e)
  })
  sel.value = mkKey(now.getFullYear(), now.getMonth())
  currentMonth = sel.value
}

function loadMonth() {
  const sel = document.getElementById('monthSelect') as HTMLSelectElement | null
  if (!sel) return
  currentMonth = sel.value
  const s = localStorage.getItem(storKey(currentMonth))
  currentBills = s
    ? (JSON.parse(s) as Bill[])
    : getRecurringBillsAsBills().length > 0
      ? getRecurringBillsAsBills()
      : JSON.parse(JSON.stringify(DEFAULT_BILLS))
  const parts = currentMonth.split('_')
  const monthNum = parseInt(parts[1], 10)
  const monthName = monthNum >= 1 && monthNum <= 12 ? MONTHS[monthNum - 1] : parts[1] || 'Mês'
  const label = `${monthName} ${parts[0] || ''}`
  setText('dashTitle', label)
  setText('contasMonthLabel', label)
  renderBills()
  updateKPIs()
  renderDashCharts()
  renderSpark()
  renderHistory()
  updatePendBadge()
}

function saveMonth() {
  autoSave()
  showToast('💾 Mês salvo com sucesso!')
}

function autoSave() {
  localStorage.setItem(storKey(currentMonth), JSON.stringify(currentBills))
  renderHistory()
  renderSpark()
}

function resetAllData() {
  if (!confirm('Tem certeza que deseja apagar todos os meses salvos?')) return

  Object.keys(localStorage)
    .filter((k) => k.startsWith('bills_'))
    .forEach((k) => localStorage.removeItem(k))

  // Recarrega mês atual apenas com o template padrão
  currentBills = JSON.parse(JSON.stringify(DEFAULT_BILLS))
  autoSave()
  renderBills()
  updateKPIs()
  renderDashCharts()
  renderSpark()
  renderHistory()
  updatePendBadge()
  showToast('🧹 Todos os dados foram limpos.')
}

function calcTotals() {
  let total = 0
  let pago = 0
  let pend = 0
  let div = 0
  let npend = 0
  let ndiv = 0
  currentBills.forEach((b) => {
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
  const renda = getTotalMonthIncome(currentMonth)
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

function updateKPIs() {
  const t = calcTotals()
  setText('kpiTotal', fmt(t.total))
  setText('kpiTotalSub', `${currentBills.length} contas cadastradas`)
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
  const kpiDiv = document.getElementById('kpiDivTotal')
  if (kpiDiv) {
    kpiDiv.classList.remove('blue', 'green', 'yellow', 'red', 'purple')
    const colorClass = diff > 0 ? 'red' : diff < 0 ? 'green' : 'yellow'
    kpiDiv.classList.add(colorClass)
  }
  const bar = document.getElementById('kpiPagoPct') as HTMLDivElement | null
  if (bar) bar.style.width = `${t.pct}%`
  setText('c_kpiTotal', fmt(t.total))
  setText('c_kpiPago', fmt(t.pago))
  setText('c_kpiPend', fmt(t.pend))
  setText('c_kpiDiv', fmt(t.divRenda))
  updatePendBadge()
}

function updatePendBadge() {
  const n = currentBills.filter(
    (b) => b.status === 'pendente' || b.status === 'divida',
  ).length
  const b = document.getElementById('pendBadge')
  if (!b) return
  b.style.display = n > 0 ? 'inline' : 'none'
  b.textContent = String(n)
}

function ubill(i: number, f: keyof Bill, v: string) {
  if (!currentBills[i]) return
  if (f === 'value') {
    currentBills[i].value = parseFloat(v) || 0
  } else if (f === 'status') {
    currentBills[i].status = v as BillStatus
  } else if (f === 'obs') {
    currentBills[i].obs = v
  }
  updateKPIs()
  renderDashCharts()
  autoSave()
  renderBills()
}

function rmBill(i: number) {
  const bill = currentBills[i]
  if (!bill) return
  if (!confirm(`Remover ${bill.name}?`)) return
  currentBills.splice(i, 1)
  renderBills()
  updateKPIs()
  renderDashCharts()
  autoSave()
}

function openAccountModal() {
  const modal = document.getElementById('modalConta')
  const nameInput = document.getElementById('modalContaName') as HTMLInputElement | null
  const cardSelect = document.getElementById('modalContaCardType') as HTMLSelectElement | null
  if (modal) modal.classList.add('modal-visible')
  if (nameInput) nameInput.value = ''
  if (cardSelect) cardSelect.value = 'nenhum'
  nameInput?.focus()
}

function closeAccountModal() {
  document.getElementById('modalConta')?.classList.remove('modal-visible')
}

function saveNewAccount() {
  const nameInput = document.getElementById('modalContaName') as HTMLInputElement | null
  const cardSelect = document.getElementById('modalContaCardType') as HTMLSelectElement | null
  if (!nameInput || !cardSelect) return
  const name = nameInput.value.trim()
  if (!name) {
    showToast('Informe o nome da conta', true)
    return
  }
  const accounts = getAccounts()
  const id = `acc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  accounts.push({
    id,
    name,
    cardType: cardSelect.value as CardType,
  })
  saveAccounts(accounts)
  closeAccountModal()
  showToast('✅ Conta cadastrada!')
  renderLancamentoModalAccounts()
}

let editingBillIndex: number | null = null

function openLancamentoModal() {
  editingBillIndex = null
  renderLancamentoModalAccounts()
  renderLancamentoModalCategories()
  const modal = document.getElementById('modalLancamento')
  const titleEl = document.getElementById('modalLancTitle')
  if (titleEl) titleEl.textContent = 'Novo lançamento'
  if (modal) modal.classList.add('modal-visible')
  clearLancamentoForm()
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
}

function openEditBillModal(i: number) {
  const bill = currentBills[i]
  if (!bill) return
  editingBillIndex = i
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

function renderLancamentoModalAccounts() {
  const sel = document.getElementById('modalLancAccount') as HTMLSelectElement | null
  if (!sel) return
  const accounts = getAccounts()
  sel.innerHTML = accounts.length === 0
    ? '<option value="">Cadastre uma conta antes</option>'
    : '<option value="">Selecione a conta</option>' +
      accounts.map((a) => `<option value="${a.id}">${esc(a.name)} (${getAccountCardType(a.id)})</option>`).join('')
}

function closeLancamentoModal() {
  document.getElementById('modalLancamento')?.classList.remove('modal-visible')
}

function saveLancamentoModal() {
  if (editingBillIndex !== null) {
    saveEditBill()
    return
  }
  addBill()
}

function addBill() {
  const accountSelect = document.getElementById('modalLancAccount') as HTMLSelectElement | null
  const nameInput = document.getElementById('modalLancName') as HTMLInputElement | null
  const valueInput = document.getElementById('modalLancValue') as HTMLInputElement | null
  const catSelect = document.getElementById('modalLancCat') as HTMLSelectElement | null
  const statusSelect = document.getElementById('modalLancStatus') as HTMLSelectElement | null
  const recurringCheck = document.getElementById('modalLancRecurring') as HTMLInputElement | null
  const obsInput = document.getElementById('modalLancObs') as HTMLInputElement | null
  if (!nameInput || !valueInput || !catSelect || !statusSelect) return
  const accountId = accountSelect?.value || ''
  const name = nameInput.value.trim()
  if (!name) {
    showToast('Informe o nome/descrição', true)
    return
  }
  const category = catSelect.value
  const value = parseFloat(valueInput.value) || 0
  const status = statusSelect.value as BillStatus
  const obs = obsInput?.value?.trim() || ''
  currentBills.push({
    name,
    category,
    value,
    status,
    obs,
    accountId: accountId || undefined,
  })
  if (recurringCheck?.checked) {
    const list = getRecurringTemplates()
    const already = list.some((r) => r.name === name && r.category === category)
    if (!already) {
      list.push({ name, category, value, status, accountId: accountId || undefined })
      saveRecurringTemplates(list)
    }
  }
  renderBills()
  updateKPIs()
  renderDashCharts()
  autoSave()
  showToast('✅ Lançamento adicionado!')
  clearLancamentoForm()
  nameInput.focus()
}

function saveEditBill() {
  if (editingBillIndex === null) return
  const accountSelect = document.getElementById('modalLancAccount') as HTMLSelectElement | null
  const nameInput = document.getElementById('modalLancName') as HTMLInputElement | null
  const valueInput = document.getElementById('modalLancValue') as HTMLInputElement | null
  const catSelect = document.getElementById('modalLancCat') as HTMLSelectElement | null
  const statusSelect = document.getElementById('modalLancStatus') as HTMLSelectElement | null
  const recurringCheck = document.getElementById('modalLancRecurring') as HTMLInputElement | null
  const obsInput = document.getElementById('modalLancObs') as HTMLInputElement | null
  if (!nameInput || !valueInput || !catSelect || !statusSelect) return
  const bill = currentBills[editingBillIndex]
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
  currentBills[editingBillIndex] = { name, category, value, status, obs, accountId: accountId || undefined }
  editingBillIndex = null
  closeLancamentoModal()
  renderBills()
  updateKPIs()
  renderDashCharts()
  autoSave()
  showToast('Lançamento atualizado!')
}

function renderDashCharts() {
  renderBarChart()
  renderDonut()
  renderRendaChart()
}

function renderRendaChart() {
  const el = document.getElementById('dashRendaBars')
  if (!el) return
  const renda = getTotalMonthIncome(currentMonth)
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

function renderBarChart() {
  const el = document.getElementById('dashBars')
  if (!el) return
  const allK = Object.keys(localStorage)
    .filter((k) => k.startsWith('bills_'))
    .sort()
    .slice(-12)
  if (allK.length === 0) {
    el.innerHTML = '<div class="empty" style="padding:20px"><p>Salve meses para ver o gráfico</p></div>'
    return
  }
  const cats = getCategories()
  const catColors: Record<string, string> = {}
  cats.forEach((c) => { catColors[c.name] = c.color })
  const data = allK.map((k) => {
    let bills: Bill[] = []
    try {
      bills = JSON.parse(localStorage.getItem(k) || '[]') as Bill[]
      if (!Array.isArray(bills)) bills = []
    } catch {
      bills = []
    }
    const byCat: Record<string, number> = {}
    bills.forEach((b) => {
      const v = b.value || 0
      if (v > 0) byCat[b.category] = (byCat[b.category] || 0) + v
    })
    const p = k.replace('bills_', '').split('_')
    const monthNum = parseInt(p[1], 10)
    const monthLabel = monthNum >= 1 && monthNum <= 12 ? MONTHS[monthNum - 1].slice(0, 3) : '???'
    const yearSuffix = (p[0] || '').slice(-2)
    const label = `${monthLabel}/${yearSuffix}`
    return { key: k.replace('bills_', ''), label, byCat, total: Object.values(byCat).reduce((s, x) => s + x, 0) }
  })
  const maxVal = Math.max(...data.map((d) => d.total), 1)
  const catNames = cats.map((c) => c.name)
  const segments = [...new Set(data.flatMap((d) => Object.keys(d.byCat)))].sort((a, b) => catNames.indexOf(a) - catNames.indexOf(b))
  el.innerHTML = `
    <div class="bars-by-month" style="display:flex;align-items:flex-end;gap:6px;min-height:140px;padding:8px 0">
      ${data
        .map(
          (d) => `
        <div class="bar-month-col" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
          <div style="display:flex;flex-direction:column-reverse;height:100px;width:100%;max-width:32px">
            ${segments
              .filter((cat) => (d.byCat[cat] || 0) > 0)
              .map(
                (cat) => `
              <div title="${esc(cat)}: ${fmt(d.byCat[cat])}" style="height:${((d.byCat[cat] || 0) / maxVal) * 100}%;background:${catColors[cat] || '#94a3b8'};width:100%;min-height:2px;border-radius:2px"></div>
            `,
              )
              .join('')}
          </div>
          <div style="font-size:0.65rem;color:var(--text3);white-space:nowrap">${d.label}</div>
          <div style="font-size:0.7rem;font-weight:600;color:var(--text1)">${fmt(d.total)}</div>
        </div>
      `,
        )
        .join('')}
    </div>
    <div class="bars-legend" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;font-size:0.72rem">
      ${segments.map((cat) => `<span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:2px;background:${catColors[cat] || '#94a3b8'}"></span>${esc(cat)}</span>`).join('')}
    </div>
  `
}

function renderDonut() {
  const t = calcTotals()
  const total = t.total || 1
  const segments = [
    { label: 'Pago', val: t.pago, color: '#16a34a' },
    { label: 'Pendente', val: t.pend, color: '#eab308' },
    { label: 'Dívida', val: t.div, color: '#ef4444' },
  ].filter((s) => s.val > 0)
  const svg = document.getElementById('donutSvg')
  const leg = document.getElementById('donutLegend')
  if (!svg || !leg) return
  const cx = 55
  const cy = 55
  const r = 40
  const stroke = 14
  const circ = 2 * Math.PI * r
  if (segments.length === 0) {
    svg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1a2235" stroke-width="${stroke}"/>`
    leg.innerHTML =
      '<div style="color:var(--text3);font-size:0.8rem">Sem dados</div>'
    return
  }
  let offset = 0
  let svgHTML = ''
  segments.forEach((s) => {
    const pct = s.val / total
    const dash = pct * circ
    const gap = circ - dash
    svgHTML += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${
      s.color
    }" stroke-width="${stroke}" stroke-dasharray="${dash.toFixed(
      2,
    )} ${gap.toFixed(
      2,
    )}" stroke-dashoffset="${(-offset * circ).toFixed(
      2,
    )}" transform="rotate(-90 ${cx} ${cy})" style="transition:all 0.5s"/>`
    offset += pct
  })
  svgHTML += `<text x="${cx}" y="${cy}" text-anchor="middle" dy="0.35em" fill="#f1f5f9" font-size="13" font-weight="800" font-family="Inter,sans-serif">${t.pct}%</text>`
  svg.innerHTML = svgHTML
  leg.innerHTML = segments
    .map(
      (s) => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${s.color}"></div>
      <div class="legend-name">${s.label}</div>
      <div class="legend-val" style="color:${s.color}">${fmt(s.val)}</div>
    </div>`,
    )
    .join('')
}

function renderSpark() {
  const el = document.getElementById('sparkBars')
  if (!el) return
  const allK = Object.keys(localStorage)
    .filter((k) => k.startsWith('bills_'))
    .sort()
  if (allK.length === 0) {
    el.innerHTML =
      '<div style="color:var(--text3);font-size:0.8rem;padding:10px">Salve meses para ver a evolução</div>'
    return
  }
  const data = allK.map((k) => {
    let b: Bill[] = []
    try {
      b = JSON.parse(localStorage.getItem(k) || '[]') as Bill[]
      if (!Array.isArray(b)) b = []
    } catch {
      b = []
    }
    const t = b.reduce((s, x) => s + (x.value || 0), 0)
    const p = k.replace('bills_', '').split('_')
    const monthNum = parseInt(p[1], 10)
    const label = monthNum >= 1 && monthNum <= 12 ? MONTHS[monthNum - 1].slice(0, 3) : '???'
    return {
      label,
      year: p[0],
      value: t,
      key: k.replace('bills_', ''),
    }
  })
  const hmax = Math.max(...data.map((d) => d.value)) || 1
  el.innerHTML = data
    .map((d) => {
      const h = Math.max(8, (d.value / hmax) * 68).toFixed(0)
      const isCur = d.key === currentMonth
      return `<div class="spark-col" onclick="document.getElementById('monthSelect').value='${d.key}';(${loadMonth.name})()">
      <div class="spark-bar ${isCur ? 'current' : ''}" style="height:${h}px" title="${fmt(
        d.value,
      )}"></div>
      <div class="spark-lbl ${isCur ? 'current' : ''}">${d.label}</div>
    </div>`
    })
    .join('')
}

function renderHistory() {
  const grid = document.getElementById('historyGrid')
  if (!grid) return
  const allK = Object.keys(localStorage)
    .filter((k) => k.startsWith('bills_'))
    .sort()
    .reverse()
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
      return `<div class="hist-card" onclick="document.getElementById('monthSelect').value='${mkey}';(${loadMonth.name})();(${navigate.name})('dashboard', document.querySelectorAll('.nav-item')[0])">
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
    const pdf = await pdfjsLib.getDocument({ data: ab }).promise
    let txt = ''
    for (let p = 1; p <= pdf.numPages; p++) {
      // eslint-disable-next-line no-await-in-loop
      const pg = await pdf.getPage(p)
      // eslint-disable-next-line no-await-in-loop
      const ct = await pg.getTextContent()
      txt += `${ct.items.map((i: any) => i.str).join(' ')}\n`
    }
    rawText = txt
    status.textContent = `Analisando lançamentos...`
    extractedData = parseTransactions(txt)
    renderExtracted()
    proc.classList.remove('visible')
  } catch (e) {
    proc.classList.remove('visible')
    showToast('Erro ao ler PDF. Verifique se não é protegido.', true)
  }
}

function parseTransactions(text: string): ExtractedItem[] {
  const lines = text
    .split(/\n|\r/)
    .map((l) => l.trim())
    .filter((l) => l.length > 3)
  const results: ExtractedItem[] = []
  const seen = new Set<string>()
  const dateRe = /\b\d{2}[\/-]\d{2}(?:[\/-]\d{2,4})?\b/
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
      const cat = guessCategory(desc)
      const key = desc.toLowerCase().slice(0, 20) + val
      if (seen.has(key)) return
      seen.add(key)
      results.push({
        name: desc,
        value: val,
        category: cat,
        status: 'pago',
        selected: true,
      })
    })
  })
  return results.slice(0, 80)
}

function guessCategory(d: string): string {
  const dl = d.toLowerCase()
  for (const [cat, kws] of Object.entries(CAT_KW)) {
    if (kws.some((k) => dl.includes(k))) return cat
  }
  return 'Outros'
}

function renderExtracted() {
  const sec = document.getElementById('extSection')
  const rawBox = document.getElementById('rawBox')
  const cnt = document.getElementById('extCount')
  const items = document.getElementById('extItems')
  if (!sec || !rawBox || !cnt || !items) return
  sec.style.display = 'block'
  rawBox.textContent = rawText
  cnt.textContent = `${extractedData.length} lançamentos encontrados`
  if (extractedData.length === 0) {
    items.innerHTML =
      '<div class="empty"><p>Nenhum lançamento detectado. Veja o texto bruto abaixo.</p></div>'
    return
  }
  items.innerHTML = extractedData
    .map(
      (it, i) => `
    <div class="ext-item">
      <input type="checkbox" id="ec${i}" ${
        it.selected ? 'checked' : ''
      } onchange="window.__extToggle && window.__extToggle(${i}, this.checked)">
      <label for="ec${i}" class="ext-name">${esc(it.name)}</label>
      <select onchange="window.__extUpdateCat && window.__extUpdateCat(${i}, this.value)">
        ${['Moradia', 'Transporte', 'Alimentação', 'Saúde', 'Lazer', 'Financeiro', 'Outros']
          .map(
            (c) =>
              `<option ${c === it.category ? 'selected' : ''} value="${c}">${c}</option>`,
          )
          .join('')}
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
  extractedData = extractedData.map((it) => ({ ...it, selected: v }))
  extractedData.forEach((_, i) => {
    const c = document.getElementById(`ec${i}`) as HTMLInputElement | null
    if (c) c.checked = v
  })
}

function importSelected() {
  const sel = extractedData.filter((i) => i.selected)
  if (sel.length === 0) {
    showToast('Nenhum item selecionado', true)
    return
  }
  sel.forEach((it) =>
    currentBills.push({
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
  const navItems = document.querySelectorAll('.nav-item')
  navigate('contas', navItems[1] as HTMLElement)
}

function navigate(page: string, navEl?: Element | null) {
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
    'contas-cadastradas': ['Contas cadastradas', 'Métodos de pagamento e cartões'],
    categorias: ['Categorias', 'Controle de categorias de gastos'],
    'fontes-renda': ['Fontes de renda', 'Cadastre fontes e adicione os valores do mês'],
    importar: ['Importar Extrato', 'Leitura automática de PDF'],
    historico: ['Histórico', 'Todos os meses registrados'],
  }
  const t = titles[page] || ['', '']
  setText('topbarTitle', t[0])
  setText('topbarSub', t[1])
  closeSidebar()
  if (page === 'dashboard') {
    updateKPIs()
    renderDashCharts()
    renderSpark()
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

function fmt(v: number, s = false) {
  if (s && v >= 1000) return `R$${(v / 1000).toFixed(1)}k`
  return `R$ ${(v || 0)
    .toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}

function esc(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function setText(id: string, v: string) {
  const e = document.getElementById(id)
  if (e) e.textContent = v
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
  }
}

function App() {
  useEffect(() => {
    try {
      if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
      }

      initMonthSel()
      loadMonth()
    } catch (err) {
      console.error('Erro ao inicializar app:', err)
    }

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
      if (!extractedData[i]) return
      extractedData[i].selected = checked
    }
    window.__extUpdateCat = (i, cat) => {
      if (!extractedData[i]) return
      extractedData[i].category = cat
    }
    window.__extUpdateVal = (i, value) => {
      if (!extractedData[i]) return
      extractedData[i].value = parseFloat(value) || 0
    }
    window.__extUpdateStatus = (i, status) => {
      if (!extractedData[i]) return
      extractedData[i].status = status as BillStatus
    }
  }, [])

  return (
    <>
      <div className="overlay" id="overlay" onClick={closeSidebar} />

      <aside className="sidebar" id="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">💰</div>
          <div className="logo-text">
            Fin<span>Track</span>
          </div>
        </div>

        <div className="sidebar-month">
          <label htmlFor="monthSelect">Mês de referência</label>
          <select
            id="monthSelect"
            onChange={() => {
              loadMonth()
            }}
          />
        </div>

        <nav className="nav">
          <div className="nav-group-label">Principal</div>
          <div
            className="nav-item active"
            onClick={(e) => navigate('dashboard', e.currentTarget)}
          >
            <span className="nav-icon">📊</span> Dashboard
          </div>
          <div
            className="nav-item"
            onClick={(e) => navigate('contas', e.currentTarget)}
          >
            <span className="nav-icon">📋</span> Lançamentos{' '}
            <span className="nav-badge" id="pendBadge" style={{ display: 'none' }}>
              !
            </span>
          </div>

          <div className="nav-group-label">Cadastros</div>
          <div
            className="nav-item"
            onClick={(e) => navigate('contas-cadastradas', e.currentTarget)}
          >
            <span className="nav-icon">🏦</span> Contas cadastradas
          </div>
          <div
            className="nav-item"
            onClick={(e) => navigate('categorias', e.currentTarget)}
          >
            <span className="nav-icon">🏷️</span> Categorias
          </div>
          <div
            className="nav-item"
            onClick={(e) => navigate('fontes-renda', e.currentTarget)}
          >
            <span className="nav-icon">💰</span> Fontes de renda
          </div>
          <div className="nav-group-label">Histórico</div>
          <div
            className="nav-item"
            onClick={(e) => navigate('historico', e.currentTarget)}
          >
            <span className="nav-icon">🗂️</span> Histórico
          </div>

          <div className="nav-group-label">Ferramentas</div>
          <div
            className="nav-item"
            onClick={(e) => navigate('importar', e.currentTarget)}
          >
            <span className="nav-icon">📄</span> Importar Extrato
          </div>
        </nav>

        <div className="sidebar-footer">
          <button className="btn-save" type="button" onClick={saveMonth}>
            💾 Salvar Mês
          </button>
          <button
            className="btn-ghost-sm"
            type="button"
            style={{ width: '100%', marginTop: 8 }}
            onClick={resetAllData}
          >
            🧹 Limpar dados
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            className="hamburger"
            type="button"
            onClick={toggleSidebar}
          >
            ☰
          </button>
          <div>
            <div className="topbar-title" id="topbarTitle">
              Dashboard
            </div>
            <div className="topbar-sub" id="topbarSub">
              Visão geral do mês
            </div>
          </div>
          <div className="topbar-actions">
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => {
                const navItems = document.querySelectorAll('.nav-item')
                navigate('importar', navItems[6] as HTMLElement)
              }}
            >
              📄 Importar PDF
            </button>
          </div>
        </header>

        <div className="content">
          <div id="page-dashboard" className="page">
            <div className="page-header">
              <h2 id="dashTitle">Fevereiro 2026</h2>
              <p>Resumo financeiro mensal · Atualizado agora</p>
            </div>

            <div className="kpi-grid">
              <div className="kpi-card blue">
                <div className="kpi-label">💳 Total do Mês</div>
                <div className="kpi-value blue" id="kpiTotal">
                  R$ 0
                </div>
                <div className="kpi-sub" id="kpiTotalSub">
                  0 contas cadastradas
                </div>
              </div>
              <div className="kpi-card green">
                <div className="kpi-label">✅ Pago</div>
                <div className="kpi-value green" id="kpiPago">
                  R$ 0
                </div>
                <div className="kpi-progress">
                  <div
                    className="kpi-progress-fill"
                    id="kpiPagoPct"
                    style={{ width: 0 }}
                  />
                </div>
                <div className="kpi-sub" id="kpiPagoSub">
                  0% quitado
                </div>
              </div>
              <div className="kpi-card yellow">
                <div className="kpi-label">⏳ Pendente</div>
                <div className="kpi-value yellow" id="kpiPend">
                  R$ 0
                </div>
                <div className="kpi-sub" id="kpiPendSub">
                  0 contas abertas
                </div>
              </div>
              <div className="kpi-card red">
                <div className="kpi-label" id="kpiDivTotalLabel">
                  Dívida total
                </div>
                <div className="kpi-value" id="kpiDivTotal">
                  R$ 0
                </div>
                <div className="kpi-sub" id="kpiDivTotalSub">
                  Gastos − Renda
                </div>
              </div>
            </div>

            <div className="card card--fontes-rent">
              <div className="card-header">
                <span className="card-title">Fontes de renda</span>
                <span
                  className="card-action"
                  onClick={() => {
                    const navItems = document.querySelectorAll('.nav-item')
                    navigate('fontes-renda', navItems[4] as HTMLElement)
                  }}
                >
                  Ver fontes →
                </span>
              </div>
              <div id="dashRendaBars" />
            </div>

            <div className="grid-3">
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Gastos por Conta</span>
                  <span
                    className="card-action"
                    onClick={() => {
                      const navItems = document.querySelectorAll('.nav-item')
                      navigate('contas', navItems[1] as HTMLElement)
                    }}
                  >
                    Ver todas →
                  </span>
                </div>
                <div id="dashBars" />
              </div>

              <div className="card">
                <div className="card-header">
                  <span className="card-title">Distribuição</span>
                </div>
                <div className="donut-wrap" id="donutWrap">
                  <svg
                    className="donut-svg"
                    width="110"
                    height="110"
                    viewBox="0 0 110 110"
                    id="donutSvg"
                  />
                  <div className="donut-legend" id="donutLegend" />
                </div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 0 }}>
              <div className="card-header">
                <span className="card-title">Evolução Mensal</span>
                <span
                  className="card-action"
                  onClick={() => {
                    const navItems = document.querySelectorAll('.nav-item')
                    navigate('historico', navItems[5] as HTMLElement)
                  }}
                >
                  Ver histórico →
                </span>
              </div>
              <div className="sparkline-bars" id="sparkBars" />
            </div>
          </div>

          <div
            id="page-contas"
            className="page"
            style={{ display: 'none' }}
          >
            <div
              className="page-header"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div>
                <h2>Contas do Mês</h2>
                <p id="contasMonthLabel">Mês atual</p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={openAccountModal}
                >
                  + Adicionar conta
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={openLancamentoModal}
                >
                  + Adicionar lançamento
                </button>
              </div>
            </div>

            <div className="kpi-grid" style={{ marginBottom: 18 }}>
              <div className="kpi-card blue">
                <div className="kpi-label">Total</div>
                <div
                  className="kpi-value blue"
                  style={{ fontSize: '1.2rem' }}
                  id="c_kpiTotal"
                >
                  R$ 0
                </div>
              </div>
              <div className="kpi-card green">
                <div className="kpi-label">Pago</div>
                <div
                  className="kpi-value green"
                  style={{ fontSize: '1.2rem' }}
                  id="c_kpiPago"
                >
                  R$ 0
                </div>
              </div>
              <div className="kpi-card yellow">
                <div className="kpi-label">Pendente</div>
                <div
                  className="kpi-value yellow"
                  style={{ fontSize: '1.2rem' }}
                  id="c_kpiPend"
                >
                  R$ 0
                </div>
              </div>
              <div className="kpi-card red">
                <div className="kpi-label">Em Dívida</div>
                <div
                  className="kpi-value red"
                  style={{ fontSize: '1.2rem' }}
                  id="c_kpiDiv"
                >
                  R$ 0
                </div>
              </div>
            </div>

            <div className="card">
              <div className="bills-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Conta / Cartão</th>
                      <th>Descrição</th>
                      <th>Categoria</th>
                      <th>Valor</th>
                      <th>Status</th>
                      <th>Obs.</th>
                      <th>Recorrente</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody id="billsBody" />
                </table>
              </div>
            </div>
          </div>

          <div
            id="page-contas-cadastradas"
            className="page"
            style={{ display: 'none' }}
          >
            <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2>Contas cadastradas</h2>
                <p>Métodos de pagamento e cartões usados nos lançamentos</p>
              </div>
              <button className="btn btn-primary" type="button" onClick={openAccountModal}>
                + Nova conta
              </button>
            </div>
            <div className="card">
              <div id="contasCadastradasList" />
            </div>
          </div>

          <div
            id="page-categorias"
            className="page"
            style={{ display: 'none' }}
          >
            <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2>Categorias</h2>
                <p>Controle as categorias usadas nos lançamentos</p>
              </div>
              <button className="btn btn-primary" type="button" onClick={openCategoryModal}>
                + Nova categoria
              </button>
            </div>
            <div className="card">
              <div id="categoriasList" />
            </div>
          </div>

          <div
            id="page-fontes-renda"
            className="page"
            style={{ display: 'none' }}
          >
            <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2>Fontes de renda</h2>
                <p>Cadastre fontes, marque como recorrente e adicione os valores recebidos no mês</p>
              </div>
              <button className="btn btn-primary" type="button" onClick={openFonteModal}>
                + Nova fonte
              </button>
            </div>
            <div className="card">
              <div id="fontesRendaList" />
            </div>
          </div>

          <div
            id="page-importar"
            className="page"
            style={{ display: 'none' }}
          >
            <div className="page-header">
              <h2>Importar Extrato PDF</h2>
              <p>Leitura automática de lançamentos bancários direto no navegador</p>
            </div>
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="pdf-drop" id="dropZone">
                <div className="drop-icon">📂</div>
                <div className="drop-title">Arraste o PDF do extrato aqui</div>
                <div className="drop-sub">
                  ou clique para selecionar · Nenhum dado é enviado para
                  servidores
                </div>
                <input
                  type="file"
                  id="pdfInput"
                  accept=".pdf"
                  onChange={(e) => handlePdf(e.target.files?.[0])}
                />
              </div>
              <div className="processing-bar" id="pdfProc">
                <div className="spinner" />
                <span id="pdfStatus">Processando...</span>
              </div>
            </div>

            <div id="extSection" style={{ display: 'none' }}>
              <div className="ext-actions">
                <div style={{ flex: 1 }}>
                  <div
                    style={{ fontWeight: 700, fontSize: '1rem' }}
                    id="extCount"
                  />
                  <div
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--text2)',
                      marginTop: 3,
                    }}
                  >
                    Ajuste categoria, valor e status antes de importar
                  </div>
                </div>
                <button
                  className="btn-ghost-sm"
                  type="button"
                  onClick={() => toggleAllExt(true)}
                >
                  Marcar todos
                </button>
                <button
                  className="btn-ghost-sm"
                  type="button"
                  onClick={() => toggleAllExt(false)}
                >
                  Desmarcar
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={importSelected}
                >
                  ✅ Importar Selecionados
                </button>
              </div>
              <div id="extItems" />
              <div style={{ marginTop: 12 }}>
                <span
                  style={{
                    fontSize: '0.76rem',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  onClick={() => {
                    const box = document.getElementById('rawBox')
                    if (!box) return
                    box.style.display =
                      box.style.display === 'none' || !box.style.display
                        ? 'block'
                        : 'none'
                  }}
                >
                  🔍 Ver texto bruto do PDF
                </span>
                <div
                  id="rawBox"
                  style={{
                    display: 'none',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 12,
                    fontSize: '0.72rem',
                    color: 'var(--text3)',
                    whiteSpace: 'pre-wrap',
                    maxHeight: 180,
                    overflowY: 'auto',
                    marginTop: 8,
                    fontFamily: 'monospace',
                    lineHeight: 1.5,
                  }}
                />
              </div>
            </div>
          </div>

          <div
            id="page-historico"
            className="page"
            style={{ display: 'none' }}
          >
            <div className="page-header">
              <h2>Histórico</h2>
              <p>Todos os meses registrados</p>
            </div>
            <div className="history-grid" id="historyGrid">
              <div className="empty">
                <div className="em-icon">📅</div>
                <p>
                  Nenhum mês salvo ainda.
                  <br />
                  Salve o mês atual para começar.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Cadastro de conta (método de pagamento) */}
      <div id="modalConta" className="modal" role="dialog" aria-labelledby="modalContaTitle">
        <div className="modal-backdrop" onClick={closeAccountModal} />
        <div className="modal-box">
          <div className="modal-header">
            <h3 id="modalContaTitle">Nova conta</h3>
            <button type="button" className="modal-close" onClick={closeAccountModal} aria-label="Fechar">
              ×
            </button>
          </div>
          <div className="modal-body">
            <div className="modal-field">
              <label htmlFor="modalContaName">Nome da conta</label>
              <input type="text" id="modalContaName" placeholder="Ex.: Nubank, Inter, Mercado Pago..." />
            </div>
            <div className="modal-field">
              <label htmlFor="modalContaCardType">Tipo de cartão</label>
              <select id="modalContaCardType">
                <option value="nenhum">Nenhum</option>
                <option value="credito">Crédito</option>
                <option value="debito">Débito</option>
              </select>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={closeAccountModal}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={saveNewAccount}>
              Cadastrar conta
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Editar conta */}
      <div id="modalEditConta" className="modal" role="dialog" aria-labelledby="modalEditContaTitle">
        <div className="modal-backdrop" onClick={closeEditAccountModal} />
        <div className="modal-box">
          <div className="modal-header">
            <h3 id="modalEditContaTitle">Editar conta</h3>
            <button type="button" className="modal-close" onClick={closeEditAccountModal} aria-label="Fechar">
              ×
            </button>
          </div>
          <div className="modal-body">
            <div className="modal-field">
              <label htmlFor="modalEditContaName">Nome da conta</label>
              <input type="text" id="modalEditContaName" placeholder="Ex.: Nubank, Inter..." />
            </div>
            <div className="modal-field">
              <label htmlFor="modalEditContaCardType">Tipo de cartão</label>
              <select id="modalEditContaCardType">
                <option value="nenhum">Nenhum</option>
                <option value="credito">Crédito</option>
                <option value="debito">Débito</option>
              </select>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={closeEditAccountModal}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={saveEditAccount}>
              Salvar
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Categoria */}
      <div id="modalCategoria" className="modal" role="dialog">
        <div className="modal-backdrop" onClick={closeCategoryModal} />
        <div className="modal-box">
          <div className="modal-header">
            <h3 id="modalCategoriaTitle">Nova categoria</h3>
            <button type="button" className="modal-close" onClick={closeCategoryModal} aria-label="Fechar">×</button>
          </div>
          <div className="modal-body">
            <div className="modal-field">
              <label htmlFor="modalCategoriaName">Nome</label>
              <input type="text" id="modalCategoriaName" placeholder="Ex.: Moradia, Alimentação..." />
            </div>
            <div className="modal-field">
              <label htmlFor="modalCategoriaColor">Cor</label>
              <input type="color" id="modalCategoriaColor" style={{ width: 60, height: 36 }} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={closeCategoryModal}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={saveCategory}>Salvar</button>
          </div>
        </div>
      </div>

      {/* Modal: Fonte de renda */}
      <div id="modalFonte" className="modal" role="dialog">
        <div className="modal-backdrop" onClick={closeFonteModal} />
        <div className="modal-box">
          <div className="modal-header">
            <h3 id="modalFonteTitle">Nova fonte de renda</h3>
            <button type="button" className="modal-close" onClick={closeFonteModal} aria-label="Fechar">×</button>
          </div>
          <div className="modal-body">
            <div className="modal-field">
              <label htmlFor="modalFonteName">Nome</label>
              <input type="text" id="modalFonteName" placeholder="Ex.: Salário, Freela, Investimentos..." />
            </div>
            <label className="modal-field modal-field-check">
              <input type="checkbox" id="modalFonteRecurring" /> Fonte recorrente (todo mês)
            </label>
            <div id="modalFonteValoresSection" style={{ display: 'none' }}>
              <div id="modalFonteValoresWrap" />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={closeFonteModal}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={saveFonte}>Salvar</button>
          </div>
        </div>
      </div>

      {/* Modal: Novo lançamento */}
      <div id="modalLancamento" className="modal" role="dialog" aria-labelledby="modalLancTitle">
        <div className="modal-backdrop" onClick={closeLancamentoModal} />
        <div className="modal-box">
          <div className="modal-header">
            <h3 id="modalLancTitle">Novo lançamento</h3>
            <button type="button" className="modal-close" onClick={closeLancamentoModal} aria-label="Fechar">
              ×
            </button>
          </div>
          <div className="modal-body">
            <div className="modal-field">
              <label htmlFor="modalLancAccount">Conta</label>
              <select id="modalLancAccount">
                <option value="">Cadastre uma conta antes</option>
              </select>
            </div>
            <div className="modal-field">
              <label htmlFor="modalLancName">Descrição</label>
              <input type="text" id="modalLancName" placeholder="Ex.: Luz, Supermercado, Parcela carro..." />
            </div>
            <div className="modal-field">
              <label htmlFor="modalLancCat">Categoria</label>
              <select id="modalLancCat">
                <option value="">Carregando...</option>
              </select>
            </div>
            <div className="modal-field">
              <label htmlFor="modalLancValue">Valor (R$)</label>
              <input type="number" id="modalLancValue" placeholder="0,00" step="0.01" min={0} />
            </div>
            <div className="modal-field">
              <label htmlFor="modalLancStatus">Status</label>
              <select id="modalLancStatus">
                <option value="pendente">⏳ Pendente</option>
                <option value="pago">✅ Pago</option>
                <option value="divida">🔴 Dívida</option>
              </select>
            </div>
            <div className="modal-field">
              <label htmlFor="modalLancObs">Observação</label>
              <input type="text" id="modalLancObs" placeholder="Opcional" />
            </div>
            <label className="modal-field modal-field-check">
              <input type="checkbox" id="modalLancRecurring" /> Conta recorrente
            </label>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={closeLancamentoModal}>
              Fechar
            </button>
            <button type="button" className="btn btn-primary" onClick={saveLancamentoModal}>
              Cadastrar
            </button>
          </div>
        </div>
      </div>

      <div className="toast" id="toast" />
    </>
  )
}

export default App
