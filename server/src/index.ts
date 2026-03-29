import cors from '@fastify/cors'
import Fastify from 'fastify'
import pg from 'pg'

const { Pool } = pg

const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001'
const PORT = Number(process.env.PORT) || 3000

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL')
  process.exit(1)
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

function workspaceId(q: { workspaceId?: string }) {
  return q.workspaceId || DEFAULT_WORKSPACE
}

type Account = { id: string; name: string; cardType: string }
type Category = { id: string; name: string; color: string }
type IncomeSource = { id: string; name: string; recurring: boolean }
type MonthIncomeEntry = { sourceId: string; value: number }
type RecurringTemplate = {
  name: string
  category: string
  value: number
  status: string
  accountId?: string
}
type Bill = {
  name: string
  category: string
  value: number
  status: string
  obs: string
  accountId?: string
}

const fastify = Fastify({ logger: true })

await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN === '*' ? true : (process.env.CORS_ORIGIN || true),
})

fastify.get('/health', async () => ({ ok: true }))

fastify.get('/api/bootstrap', async (request) => {
  const ws = workspaceId(request.query as { workspaceId?: string })
  const [
    acc,
    cat,
    inc,
    rec,
    minc,
    months,
  ] = await Promise.all([
    pool.query<{
      id: string
      name: string
      card_type: string
    }>('SELECT id, name, card_type FROM account WHERE workspace_id = $1 ORDER BY name', [ws]),
    pool.query<{ id: string; name: string; color: string }>(
      'SELECT id, name, color FROM category WHERE workspace_id = $1 ORDER BY name',
      [ws],
    ),
    pool.query<{
      id: string
      name: string
      recurring: boolean
    }>('SELECT id, name, recurring FROM income_source WHERE workspace_id = $1 ORDER BY name', [ws]),
    pool.query<{
      name: string
      category: string
      value: string
      status: string
      account_id: string | null
    }>(
      'SELECT name, category, value, status, account_id FROM recurring_template WHERE workspace_id = $1 ORDER BY id',
      [ws],
    ),
    pool.query<{ month_key: string; source_id: string; value: string }>(
      'SELECT month_key, source_id, value FROM month_income WHERE workspace_id = $1',
      [ws],
    ),
    pool.query<{ month_key: string }>(
      'SELECT month_key FROM month_saved WHERE workspace_id = $1 ORDER BY month_key',
      [ws],
    ),
  ])

  const monthIncome: Record<string, MonthIncomeEntry[]> = {}
  for (const row of minc.rows) {
    if (!monthIncome[row.month_key]) monthIncome[row.month_key] = []
    monthIncome[row.month_key].push({
      sourceId: row.source_id,
      value: Number(row.value),
    })
  }

  const billsByMonth: Record<string, Bill[]> = {}
  for (const { month_key: mk } of months.rows) {
    const br = await pool.query<{
      name: string
      category: string
      value: string
      status: string
      obs: string
      account_id: string | null
    }>(
      'SELECT name, category, value, status, obs, account_id FROM bill WHERE workspace_id = $1 AND month_key = $2 ORDER BY sort_order, id',
      [ws, mk],
    )
    billsByMonth[mk] = br.rows.map((b) => ({
      name: b.name,
      category: b.category,
      value: Number(b.value),
      status: b.status,
      obs: b.obs || '',
      ...(b.account_id ? { accountId: b.account_id } : {}),
    }))
  }

  return {
    accounts: acc.rows.map((a) => ({
      id: a.id,
      name: a.name,
      cardType: a.card_type,
    })),
    categories: cat.rows.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
    })),
    incomeSources: inc.rows.map((s) => ({
      id: s.id,
      name: s.name,
      recurring: s.recurring,
    })),
    recurringTemplates: rec.rows.map((r) => ({
      name: r.name,
      category: r.category,
      value: Number(r.value),
      status: r.status,
      ...(r.account_id ? { accountId: r.account_id } : {}),
    })),
    monthIncome,
    billsByMonth,
  }
})

fastify.put<{ Body: { accounts?: Account[] }; Querystring: { workspaceId?: string } }>(
  '/api/accounts',
  async (request) => {
    const ws = workspaceId(request.query)
    const accounts = request.body.accounts ?? []
    const c = await pool.connect()
    try {
      await c.query('BEGIN')
      await c.query('DELETE FROM account WHERE workspace_id = $1', [ws])
      for (const a of accounts) {
        await c.query(
          `INSERT INTO account (id, workspace_id, name, card_type) VALUES ($1,$2,$3,$4)`,
          [a.id, ws, a.name, a.cardType],
        )
      }
      await c.query('COMMIT')
    } catch (e) {
      await c.query('ROLLBACK')
      throw e
    } finally {
      c.release()
    }
    return { ok: true }
  },
)

fastify.put<{ Body: { categories?: Category[] }; Querystring: { workspaceId?: string } }>(
  '/api/categories',
  async (request) => {
    const ws = workspaceId(request.query)
    const categories = request.body.categories ?? []
    const c = await pool.connect()
    try {
      await c.query('BEGIN')
      await c.query('DELETE FROM category WHERE workspace_id = $1', [ws])
      for (const cat of categories) {
        await c.query(
          `INSERT INTO category (id, workspace_id, name, color) VALUES ($1,$2,$3,$4)`,
          [cat.id, ws, cat.name, cat.color],
        )
      }
      await c.query('COMMIT')
    } catch (e) {
      await c.query('ROLLBACK')
      throw e
    } finally {
      c.release()
    }
    return { ok: true }
  },
)

fastify.put<{ Body: { sources?: IncomeSource[] }; Querystring: { workspaceId?: string } }>(
  '/api/income-sources',
  async (request) => {
    const ws = workspaceId(request.query)
    const sources = request.body.sources ?? []
    const c = await pool.connect()
    try {
      await c.query('BEGIN')
      await c.query('DELETE FROM income_source WHERE workspace_id = $1', [ws])
      for (const s of sources) {
        await c.query(
          `INSERT INTO income_source (id, workspace_id, name, recurring) VALUES ($1,$2,$3,$4)`,
          [s.id, ws, s.name, s.recurring],
        )
      }
      await c.query('COMMIT')
    } catch (e) {
      await c.query('ROLLBACK')
      throw e
    } finally {
      c.release()
    }
    return { ok: true }
  },
)

fastify.put<{
  Params: { monthKey: string }
  Body: { entries?: MonthIncomeEntry[] }
  Querystring: { workspaceId?: string }
}>('/api/month-income/:monthKey', async (request) => {
  const ws = workspaceId(request.query)
  const monthKey = decodeURIComponent(request.params.monthKey)
  const entries = request.body.entries ?? []
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    await c.query(
      'DELETE FROM month_income WHERE workspace_id = $1 AND month_key = $2',
      [ws, monthKey],
    )
    for (const e of entries) {
      if ((e.value || 0) <= 0) continue
      await c.query(
        `INSERT INTO month_income (workspace_id, month_key, source_id, value) VALUES ($1,$2,$3,$4)`,
        [ws, monthKey, e.sourceId, e.value],
      )
    }
    await c.query('COMMIT')
  } catch (e) {
    await c.query('ROLLBACK')
    throw e
  } finally {
    c.release()
  }
  return { ok: true }
})

fastify.put<{ Body: { templates?: RecurringTemplate[] }; Querystring: { workspaceId?: string } }>(
  '/api/recurring-templates',
  async (request) => {
    const ws = workspaceId(request.query)
    const templates = request.body.templates ?? []
    const c = await pool.connect()
    try {
      await c.query('BEGIN')
      await c.query('DELETE FROM recurring_template WHERE workspace_id = $1', [ws])
      for (const t of templates) {
        await c.query(
          `INSERT INTO recurring_template (workspace_id, name, category, value, status, account_id)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [ws, t.name, t.category, t.value, t.status, t.accountId ?? null],
        )
      }
      await c.query('COMMIT')
    } catch (e) {
      await c.query('ROLLBACK')
      throw e
    } finally {
      c.release()
    }
    return { ok: true }
  },
)

fastify.put<{
  Params: { monthKey: string }
  Body: { bills?: Bill[] }
  Querystring: { workspaceId?: string }
}>('/api/bills/:monthKey', async (request) => {
  const ws = workspaceId(request.query)
  const monthKey = decodeURIComponent(request.params.monthKey)
  const bills = request.body.bills ?? []
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    await c.query('DELETE FROM bill WHERE workspace_id = $1 AND month_key = $2', [ws, monthKey])
    await c.query(
      `INSERT INTO month_saved (workspace_id, month_key) VALUES ($1, $2)
       ON CONFLICT (workspace_id, month_key) DO UPDATE SET saved_at = now()`,
      [ws, monthKey],
    )
    let order = 0
    for (const b of bills) {
      await c.query(
        `INSERT INTO bill (workspace_id, month_key, name, category, value, status, obs, account_id, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          ws,
          monthKey,
          b.name,
          b.category,
          b.value,
          b.status,
          b.obs ?? '',
          b.accountId ?? null,
          order++,
        ],
      )
    }
    await c.query('COMMIT')
  } catch (e) {
    await c.query('ROLLBACK')
    throw e
  } finally {
    c.release()
  }
  return { ok: true }
})

fastify.delete<{ Querystring: { workspaceId?: string } }>(
  '/api/bills',
  async (request) => {
    const ws = workspaceId(request.query)
    await pool.query('DELETE FROM bill WHERE workspace_id = $1', [ws])
    await pool.query('DELETE FROM month_saved WHERE workspace_id = $1', [ws])
    return { ok: true }
  },
)

try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
