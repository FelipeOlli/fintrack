import { useFinTrack } from '../app/useFinTrack'

export function FinTrackSidebar() {
  const ft = useFinTrack()
  return (
    <aside className="sidebar" id="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">💰</div>
        <div className="logo-text">
          Fin<span className="logo-accent">Track</span>
        </div>
      </div>

      <div className="sidebar-month">
        <label htmlFor="monthSelect">Mês de referência</label>
        <select
          id="monthSelect"
          onChange={() => {
            ft.loadMonth()
          }}
        />
      </div>

      <nav className="nav nav--magik">
        <div className="nav-group-label">Menu</div>
        <div
          className="nav-item active"
          data-nav-page="dashboard"
          onClick={(e) => ft.navigate('dashboard', e.currentTarget)}
        >
          <span className="nav-icon">🏠</span> Dashboard
        </div>
        <div
          className="nav-item"
          data-nav-page="contas"
          onClick={(e) => ft.navigate('contas', e.currentTarget)}
        >
          <span className="nav-icon">📋</span> Lançamentos{' '}
          <span className="nav-badge" id="pendBadge" style={{ display: 'none' }}>
            !
          </span>
        </div>

        <div className="nav-group-label">Cadastros</div>
        <div
          className="nav-item"
          data-nav-page="contas-cadastradas"
          onClick={(e) => ft.navigate('contas-cadastradas', e.currentTarget)}
        >
          <span className="nav-icon">🏦</span> Contas cadastradas
        </div>
        <div
          className="nav-item"
          data-nav-page="categorias"
          onClick={(e) => ft.navigate('categorias', e.currentTarget)}
        >
          <span className="nav-icon">🏷️</span> Categorias
        </div>
        <div
          className="nav-item"
          data-nav-page="fontes-renda"
          onClick={(e) => ft.navigate('fontes-renda', e.currentTarget)}
        >
          <span className="nav-icon">💰</span> Fontes de renda
        </div>
        <div className="nav-group-label">Histórico</div>
        <div
          className="nav-item"
          data-nav-page="historico"
          onClick={(e) => ft.navigate('historico', e.currentTarget)}
        >
          <span className="nav-icon">🗂️</span> Histórico
        </div>

        <div className="nav-group-label">Ferramentas</div>
        <div
          className="nav-item"
          data-nav-page="importar"
          onClick={(e) => ft.navigate('importar', e.currentTarget)}
        >
          <span className="nav-icon">📄</span> Importar extrato
        </div>
      </nav>

      <button
        type="button"
        className="sidebar-quick-add"
        onClick={() => {
          ft.openLancamentoModal()
        }}
      >
        <span className="sidebar-quick-add-icon" aria-hidden>
          +
        </span>
        <span className="sidebar-quick-add-text">Novo lançamento</span>
      </button>

      <div className="sidebar-footer">
        <button className="btn-save btn-save--magik" type="button" onClick={ft.saveMonth}>
          Salvar mês
        </button>
        <button
          className="btn-ghost-sm btn-ghost-sidebar"
          type="button"
          onClick={ft.resetAllData}
        >
          Limpar dados do período
        </button>
      </div>
    </aside>
  )
}
