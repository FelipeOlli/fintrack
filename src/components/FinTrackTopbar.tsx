import { useFinTrack } from '../app/useFinTrack'

export function FinTrackTopbar() {
  const ft = useFinTrack()
  return (
    <header className="topbar topbar--magik">
      <button className="hamburger" type="button" onClick={ft.toggleSidebar} aria-label="Menu">
        ☰
      </button>

      <div className="topbar-search-wrap">
        <span className="topbar-search-icon" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input
          type="search"
          id="globalSearch"
          className="topbar-search"
          placeholder="Buscar lançamentos, categorias..."
          aria-label="Buscar"
          autoComplete="off"
        />
      </div>

      <div className="topbar-titles">
        <div className="topbar-title" id="topbarTitle">
          Dashboard
        </div>
        <div className="topbar-sub" id="topbarSub">
          Visão geral do mês
        </div>
      </div>

      <div className="topbar-toolbar">
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="topbar-icon-btn topbar-notif-btn"
            aria-label="Notificações"
            onClick={ft.toggleNotifications}
          >
            <span id="notifBadge" className="notif-badge" style={{ display: 'none' }} />
            🔔
          </button>
          <div id="notifPanel" className="notif-panel" style={{ display: 'none' }} />
        </div>
        <button
          className="btn btn-magik-import"
          type="button"
          onClick={ft.openLancamentoModal}
        >
          +<span className="btn-label"> Lançamento</span>
        </button>
        <div className="topbar-avatar" title="Conta local">
          FT
        </div>
      </div>
    </header>
  )
}
