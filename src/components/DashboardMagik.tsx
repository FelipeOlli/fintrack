import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { session } from '../app/session'
import { useFinTrack } from '../app/useFinTrack'
import { getDashRevision, subscribeDash } from '../lib/dashboardSync'
import { fmt } from '../lib/format'
import { currentMonthTotals, getCategoryBreakdown, getMonthlyPointsLast, getYearCategoryData } from '../lib/monthSeries'
import { getAccounts } from '../storage/persistence'
import type { BillStatus } from '../domain/types'

type ChartTab = 'total' | 'pago'

function accountName(id?: string) {
  if (!id) return '—'
  return getAccounts().find((a) => a.id === id)?.name ?? '—'
}

function Ring({
  r,
  stroke,
  pct,
  color,
  bg,
}: {
  r: number
  stroke: number
  pct: number
  color: string
  bg: string
}) {
  const c = 2 * Math.PI * r
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * c
  const gap = c - dash
  return (
    <g>
      <circle
        cx="100"
        cy="100"
        r={r}
        fill="none"
        stroke={bg}
        strokeWidth={stroke}
      />
      <circle
        cx="100"
        cy="100"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${gap}`}
        transform="rotate(-90 100 100)"
        style={{ transition: 'stroke-dasharray 0.45s ease' }}
      />
    </g>
  )
}

function StatusPill({ status }: { status: BillStatus }) {
  const map: Record<BillStatus, { label: string; cls: string }> = {
    pago: { label: 'Pago', cls: 'dash-status dash-status--done' },
    pendente: { label: 'Pendente', cls: 'dash-status dash-status--pending' },
    divida: { label: 'Dívida', cls: 'dash-status dash-status--cancel' },
    vazio: { label: 'S/ info', cls: 'dash-status dash-status--muted' },
  }
  const m = map[status] ?? map.vazio
  return <span className={m.cls}>{m.label}</span>
}

export function DashboardMagik() {
  const rev = useSyncExternalStore(subscribeDash, getDashRevision, getDashRevision)
  const ft = useFinTrack()
  const [tab, setTab] = useState<ChartTab>('total')
  const [range, setRange] = useState<6 | 12>(12)
  const [tableQ, setTableQ] = useState('')

  const chartData = useMemo(() => {
    void rev
    return getMonthlyPointsLast(range).map((p) => ({
      ...p,
      chartVal: tab === 'total' ? p.total : p.pago,
    }))
  }, [rev, range, tab])

  const totals = useMemo(() => {
    void rev
    return currentMonthTotals()
  }, [rev])

  const { total, pago, pend, div } = totals
  const pctQuit = total > 0 ? Math.round((pago / total) * 100) : 0
  const pPago = total > 0 ? (pago / total) * 100 : 0
  const pPend = total > 0 ? (pend / total) * 100 : 0
  const pDiv = total > 0 ? (div / total) * 100 : 0

  const catBreakdown = useMemo(() => {
    void rev
    return getCategoryBreakdown()
  }, [rev])

  const yearCatData = useMemo(() => {
    void rev
    return getYearCategoryData()
  }, [rev])

  const billsPreview = useMemo(() => {
    void rev
    const q = tableQ.trim().toLowerCase()
    return session.currentBills
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => {
        if (!q) return true
        return (
          b.name.toLowerCase().includes(q) ||
          b.category.toLowerCase().includes(q) ||
          (b.obs || '').toLowerCase().includes(q) ||
          accountName(b.accountId).toLowerCase().includes(q)
        )
      })
      .slice(0, 12)
  }, [rev, tableQ])

  const parts = session.currentMonth.split('_')
  const y = parts[0] || ''
  const mNum = parseInt(parts[1], 10)
  const periodLabel =
    mNum >= 1 && mNum <= 12
      ? `${String(mNum).padStart(2, '0')}/${y}`
      : session.currentMonth

  return (
    <>
      <div className="dash-magik-charts">
        <div className="card dash-area-card">
          <div className="dash-area-head">
            <div className="dash-chart-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'total'}
                className={`dash-chart-tab${tab === 'total' ? ' active' : ''}`}
                onClick={() => setTab('total')}
              >
                Gastos totais
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'pago'}
                className={`dash-chart-tab${tab === 'pago' ? ' active' : ''}`}
                onClick={() => setTab('pago')}
              >
                Valor quitado
              </button>
            </div>
            <select
              className="dash-period-select"
              aria-label="Período do gráfico"
              value={range}
              onChange={(e) => setRange(Number(e.target.value) as 6 | 12)}
            >
              <option value={12}>Últimos 12 meses</option>
              <option value={6}>Últimos 6 meses</option>
            </select>
          </div>
          <div className="dash-area-chart-wrap">
            {chartData.length === 0 ? (
              <div className="dash-empty">Salve um mês para ver a evolução.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="magikArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#bef264" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#bef264" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#71717a', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#71717a', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) =>
                      typeof v === 'number' && v >= 1000
                        ? `R$ ${(v / 1000).toFixed(0)}k`
                        : `R$ ${v}`
                    }
                    width={56}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#1f1f24',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 12,
                      color: '#f4f4f5',
                    }}
                    formatter={(v) => [
                      fmt(Number(v ?? 0)),
                      tab === 'total' ? 'Total' : 'Quitado',
                    ]}
                    labelFormatter={(l) => String(l)}
                  />
                  <Area
                    type="monotone"
                    dataKey="chartVal"
                    stroke="#bef264"
                    strokeWidth={2.5}
                    fill="url(#magikArea)"
                    dot={{ r: 0, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#bef264', stroke: '#0f0f12', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card dash-radial-card">
          <div className="dash-radial-head">
            <span className="card-title dash-radial-title">Resumo do mês</span>
            <span className="dash-radial-period">{periodLabel}</span>
          </div>
          <div className="dash-radial-body">
            {total <= 0 ? (
              <div className="dash-empty dash-empty--sm">Sem lançamentos neste mês.</div>
            ) : (
              <>
                <svg className="dash-radial-svg" viewBox="0 0 200 200" aria-hidden>
                  <Ring r={78} stroke={10} pct={pPago} color="#bef264" bg="rgba(255,255,255,0.06)" />
                  <Ring r={60} stroke={10} pct={pPend} color="#fbbf24" bg="rgba(255,255,255,0.06)" />
                  <Ring r={42} stroke={10} pct={pDiv} color="#c084fc" bg="rgba(255,255,255,0.06)" />
                  <text
                    x="100"
                    y="100"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#f4f4f5"
                    fontSize="18"
                    fontWeight="800"
                  >
                    {pctQuit}%
                  </text>
                  <text
                    x="100"
                    y="122"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#71717a"
                    fontSize="10"
                    fontWeight="600"
                  >
                    quitado
                  </text>
                </svg>
                <div className="dash-radial-legend">
                  <span>
                    <i className="dot dot--green" /> Pago {fmt(pago)}
                  </span>
                  <span>
                    <i className="dot dot--amber" /> Pendente {fmt(pend)}
                  </span>
                  <span>
                    <i className="dot dot--purple" /> Dívida {fmt(div)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="dash-magik-charts">
        <div className="card dash-area-card">
          <div className="dash-area-head">
            <span className="card-title">Gastos por categoria — {periodLabel}</span>
          </div>
          <div className="dash-cat-chart-wrap">
            {catBreakdown.length === 0 ? (
              <div className="dash-empty">Sem lançamentos neste mês.</div>
            ) : (
              <div className="dash-cat-pie-row">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={catBreakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={100}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {catBreakdown.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: '#1f1f24',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 12,
                        color: '#f4f4f5',
                      }}
                      formatter={(v, name) => [fmt(Number(v ?? 0)), String(name)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="dash-cat-legend">
                  {catBreakdown.map((c) => (
                    <div key={c.name} className="dash-cat-legend-item">
                      <i className="dot" style={{ background: c.color }} />
                      <span className="dash-cat-legend-name">{c.name}</span>
                      <span className="dash-cat-legend-val">{fmt(c.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card dash-area-card">
          <div className="dash-area-head">
            <span className="card-title">Gastos por categoria — Ano {parts[0]}</span>
          </div>
          <div className="dash-area-chart-wrap">
            {yearCatData.categories.length === 0 ? (
              <div className="dash-empty">Sem dados para o ano.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearCatData.data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#71717a', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#71717a', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) =>
                      typeof v === 'number' && v >= 1000
                        ? `R$ ${(v / 1000).toFixed(0)}k`
                        : `R$ ${v}`
                    }
                    width={56}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#1f1f24',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 12,
                      color: '#f4f4f5',
                    }}
                    formatter={(v, name) => [fmt(Number(v ?? 0)), String(name)]}
                    labelFormatter={(l) => String(l)}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, color: '#a1a1aa', paddingTop: 8 }}
                  />
                  {yearCatData.categories.map((cat) => (
                    <Bar
                      key={cat.name}
                      dataKey={cat.name}
                      stackId="cats"
                      fill={cat.color}
                      radius={[0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="card dash-table-card">
        <div className="dash-table-head">
          <div>
            <h3 className="dash-table-title">Lançamentos</h3>
            <p className="dash-table-sub">Mês atual · até 12 linhas</p>
          </div>
          <div className="dash-table-tools">
            <div className="dash-table-search-wrap">
              <span className="topbar-search-icon dash-table-search-icon" aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </span>
              <input
                type="search"
                className="dash-table-search"
                placeholder="Buscar na tabela..."
                value={tableQ}
                onChange={(e) => setTableQ(e.target.value)}
                aria-label="Filtrar lançamentos"
              />
            </div>
            <button
              type="button"
              className="btn btn-magik-import btn-table-action"
              onClick={() =>
                ft.navigate(
                  'contas',
                  document.querySelector('[data-nav-page="contas"]') as HTMLElement,
                )
              }
            >
              Ver todos
            </button>
          </div>
        </div>
        <div className="dash-table-scroll">
          <table className="dash-invoice-table">
            <thead>
              <tr>
                <th>Lançamento</th>
                <th>Categoria</th>
                <th>Conta</th>
                <th>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {billsPreview.length === 0 ? (
                <tr>
                  <td colSpan={5} className="dash-table-empty">
                    Nenhum lançamento corresponde à busca.
                  </td>
                </tr>
              ) : (
                billsPreview.map(({ b, i }) => (
                  <tr key={`bill-row-${i}`}>
                    <td>
                      <div className="dash-cell-name">
                        <span className="dash-avatar">{b.name.slice(0, 1).toUpperCase()}</span>
                        <span>
                          {b.name}
                          <span className="dash-id">#{String(i + 1).padStart(4, '0')}</span>
                        </span>
                      </div>
                    </td>
                    <td className="dash-td-muted">{b.category}</td>
                    <td className="dash-td-muted">{accountName(b.accountId)}</td>
                    <td className="dash-td-strong">{fmt(b.value || 0)}</td>
                    <td>
                      <StatusPill status={b.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
