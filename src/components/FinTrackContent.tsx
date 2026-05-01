import { useFinTrack } from '../app/useFinTrack'
import { DashboardMagik } from './DashboardMagik'

export function FinTrackContent() {
  const ft = useFinTrack()
  return (
    <>
    <div className="content">
      <div id="page-dashboard" className="page">
        <div className="page-header">
          <h2 id="dashTitle">Fevereiro 2026</h2>
          <p>Resumo financeiro mensal · Atualizado agora</p>
        </div>

        <div className="kpi-grid kpi-grid--magik">
          <div className="kpi-card kpi-card--magik kpi-accent--teal">
            <div className="kpi-card-head">
              <div className="kpi-icon-wrap kpi-icon-wrap--teal" aria-hidden>
                💳
              </div>
              <span className="kpi-trend-badge kpi-trend--neutral" id="kpiTotalTrend">
                —
              </span>
            </div>
            <div className="kpi-label">Total do Mês</div>
            <div className="kpi-value kpi-value--magik teal" id="kpiTotal">
              R$ 0
            </div>
            <div className="kpi-sub" id="kpiTotalSub">
              0 lançamentos no mês
            </div>
          </div>
          <div className="kpi-card kpi-card--magik kpi-accent--green">
            <div className="kpi-card-head">
              <div className="kpi-icon-wrap kpi-icon-wrap--green" aria-hidden>
                ✅
              </div>
              <span className="kpi-trend-badge kpi-trend--up" id="kpiPagoTrend">
                0%
              </span>
            </div>
            <div className="kpi-label">Pago</div>
            <div className="kpi-value kpi-value--magik green" id="kpiPago">
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
          <div className="kpi-card kpi-card--magik kpi-accent--amber">
            <div className="kpi-card-head">
              <div className="kpi-icon-wrap kpi-icon-wrap--amber" aria-hidden>
                ⏳
              </div>
              <span className="kpi-trend-badge kpi-trend--neutral" id="kpiPendTrend">
                0%
              </span>
            </div>
            <div className="kpi-label">Pendente</div>
            <div className="kpi-value kpi-value--magik amber" id="kpiPend">
              R$ 0
            </div>
            <div className="kpi-sub" id="kpiPendSub">
              0 em aberto
            </div>
          </div>
          <div className="kpi-card kpi-card--magik kpi-accent--purple">
            <div className="kpi-card-head">
              <div className="kpi-icon-wrap kpi-icon-wrap--purple" aria-hidden>
                ⚖️
              </div>
              <span className="kpi-trend-badge kpi-trend--neutral" id="kpiDivTrend">
                —
              </span>
            </div>
            <div className="kpi-label" id="kpiDivTotalLabel">
              Orçamento
            </div>
            <div className="kpi-value kpi-value--magik tone-yellow" id="kpiDivTotal">
              R$ 0
            </div>
            <div className="kpi-sub" id="kpiDivTotalSub">
              Gastos × Renda
            </div>
          </div>
        </div>

        <div className="card card--fontes-rent">
          <div className="card-header">
            <span className="card-title">Fontes de renda</span>
            <span
              className="card-action"
              onClick={() => {
                ft.navigate(
                  'fontes-renda',
                  document.querySelector(
                    '[data-nav-page="fontes-renda"]',
                  ) as HTMLElement,
                )
              }}
            >
              Ver fontes →
            </span>
          </div>
          <div id="dashRendaBars" />
        </div>

        <DashboardMagik />
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
              onClick={ft.openAccountModal}
            >
              + Adicionar conta
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={ft.openLancamentoModal}
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
          <div className="bills-search-wrap">
            <input
              type="text"
              id="billsSearch"
              className="bills-search"
              placeholder="Buscar por nome, categoria ou obs..."
            />
          </div>
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
          <button className="btn btn-primary" type="button" onClick={ft.openAccountModal}>
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
          <button className="btn btn-primary" type="button" onClick={ft.openCategoryModal}>
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
          <button className="btn btn-primary" type="button" onClick={ft.openFonteModal}>
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
          <h2>Importar Fatura / Extrato</h2>
          <p>Importe faturas de cartão com detecção de parcelas e projeção futura</p>
        </div>

        {/* ── Step 0: Upload ── */}
        <div id="importStep0">
          <div className="card" style={{ marginBottom: 16 }}>
            <label style={{ fontWeight: 600, fontSize: '0.88rem', display: 'block', marginBottom: 8 }}>
              Cartão / Conta da fatura
            </label>
            <select
              id="importAccountSelect"
              className="form-select"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.88rem' }}
              onChange={(e) => {
                if (window.__importAccountChange) window.__importAccountChange(e.target.value)
              }}
            >
              <option value="">Selecione a conta / cartão</option>
            </select>
          </div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="pdf-drop" id="dropZone">
              <div className="drop-icon">📂</div>
              <div className="drop-title">Arraste o PDF da fatura aqui</div>
              <div className="drop-sub">
                ou clique para selecionar
              </div>
              <input
                type="file"
                id="pdfInput"
                accept=".pdf"
                onChange={(e) => ft.handlePdf(e.target.files?.[0])}
              />
            </div>
            <div className="processing-bar" id="pdfProc">
              <div className="spinner" />
              <span id="pdfStatus">Processando...</span>
            </div>
          </div>
        </div>

        {/* ── Step 1: Revisão de itens ── */}
        <div id="importStep1" style={{ display: 'none' }}>
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
                  Ajuste categoria, valor e status. Parcelas detectadas aparecem com badge azul.
                </div>
              </div>
              <button
                className="btn-ghost-sm"
                type="button"
                onClick={() => ft.toggleAllExt(true)}
              >
                Marcar todos
              </button>
              <button
                className="btn-ghost-sm"
                type="button"
                onClick={() => ft.toggleAllExt(false)}
              >
                Desmarcar
              </button>
            </div>
            <div id="extItems" />
            <div className="import-step-nav" style={{ marginTop: 16 }}>
              <button
                className="btn-ghost-sm"
                type="button"
                onClick={() => ft.setImportStep(0)}
              >
                Voltar
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={ft.buildAndShowPreview}
              >
                Projetar parcelas e verificar duplicatas
              </button>
              <button
                className="btn-ghost-sm"
                type="button"
                onClick={ft.importSelected}
                style={{ fontSize: '0.78rem' }}
              >
                Importar direto (sem projeção)
              </button>
            </div>
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
                Ver texto bruto do PDF
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

        {/* ���─ Step 2: Preview projeção + deduplicação ── */}
        <div id="importStep2" style={{ display: 'none' }}>
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 8 }}>
              Projeção de importação
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text2)', marginBottom: 16 }}>
              Itens duplicados já foram desmarcados. Revise e confirme.
            </div>
            <div id="importPreviewContent" />
            <div className="import-step-nav" style={{ marginTop: 16 }}>
              <button
                className="btn-ghost-sm"
                type="button"
                onClick={() => ft.setImportStep(1)}
              >
                Voltar
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={ft.importConfirmed}
              >
                Confirmar importação
              </button>
            </div>
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

      {/* Modal: Cadastro de conta (método de pagamento) */}
      <div id="modalConta" className="modal" role="dialog" aria-labelledby="modalContaTitle">
    <div className="modal-backdrop" onClick={ft.closeAccountModal} />
    <div className="modal-box">
      <div className="modal-header">
        <h3 id="modalContaTitle">Nova conta</h3>
        <button type="button" className="modal-close" onClick={ft.closeAccountModal} aria-label="Fechar">
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
        <button type="button" className="btn btn-outline" onClick={ft.closeAccountModal}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" onClick={ft.saveNewAccount}>
          Cadastrar conta
        </button>
      </div>
    </div>
      </div>

      {/* Modal: Editar conta */}
      <div id="modalEditConta" className="modal" role="dialog" aria-labelledby="modalEditContaTitle">
    <div className="modal-backdrop" onClick={ft.closeEditAccountModal} />
    <div className="modal-box">
      <div className="modal-header">
        <h3 id="modalEditContaTitle">Editar conta</h3>
        <button type="button" className="modal-close" onClick={ft.closeEditAccountModal} aria-label="Fechar">
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
        <button type="button" className="btn btn-outline" onClick={ft.closeEditAccountModal}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" onClick={ft.saveEditAccount}>
          Salvar
        </button>
      </div>
    </div>
      </div>

      {/* Modal: Categoria */}
      <div id="modalCategoria" className="modal" role="dialog">
    <div className="modal-backdrop" onClick={ft.closeCategoryModal} />
    <div className="modal-box">
      <div className="modal-header">
        <h3 id="modalCategoriaTitle">Nova categoria</h3>
        <button type="button" className="modal-close" onClick={ft.closeCategoryModal} aria-label="Fechar">×</button>
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
        <button type="button" className="btn btn-outline" onClick={ft.closeCategoryModal}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={ft.saveCategory}>Salvar</button>
      </div>
    </div>
      </div>

      {/* Modal: Fonte de renda */}
      <div id="modalFonte" className="modal" role="dialog">
    <div className="modal-backdrop" onClick={ft.closeFonteModal} />
    <div className="modal-box">
      <div className="modal-header">
        <h3 id="modalFonteTitle">Nova fonte de renda</h3>
        <button type="button" className="modal-close" onClick={ft.closeFonteModal} aria-label="Fechar">×</button>
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
        <button type="button" className="btn btn-outline" onClick={ft.closeFonteModal}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={ft.saveFonte}>Salvar</button>
      </div>
    </div>
      </div>

      {/* Modal: Novo lançamento */}
      <div id="modalLancamento" className="modal" role="dialog" aria-labelledby="modalLancTitle">
    <div className="modal-backdrop" onClick={ft.closeLancamentoModal} />
    <div className="modal-box">
      <div className="modal-header">
        <h3 id="modalLancTitle">Novo lançamento</h3>
        <button type="button" className="modal-close" onClick={ft.closeLancamentoModal} aria-label="Fechar">
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
        <button type="button" className="btn btn-outline" onClick={ft.closeLancamentoModal}>
          Fechar
        </button>
        <button type="button" className="btn btn-primary" onClick={ft.saveLancamentoModal}>
          Cadastrar
        </button>
      </div>
    </div>
      </div>

      <div className="toast" id="toast" />
    </>
  )
}
