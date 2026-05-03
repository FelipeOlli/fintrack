import Anthropic from '@anthropic-ai/sdk'
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
  origin: true,
  methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
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
      // Remove apenas fontes que não estão mais na lista (evita cascade em month_income)
      if (sources.length > 0) {
        const ids = sources.map((s) => s.id)
        await c.query(
          `DELETE FROM income_source WHERE workspace_id = $1 AND id <> ALL($2::text[])`,
          [ws, ids],
        )
      } else {
        await c.query('DELETE FROM income_source WHERE workspace_id = $1', [ws])
      }
      // Upsert cada fonte (preserva month_income existente)
      for (const s of sources) {
        await c.query(
          `INSERT INTO income_source (id, workspace_id, name, recurring)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, recurring = EXCLUDED.recurring`,
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

// ── Parse de fatura via Claude ────────────────────────────────
type ParsedInvoiceItem = {
  name: string
  value: number
  category: string
  installmentCurrent?: number
  installmentTotal?: number
  cleanName?: string
}

fastify.post<{
  Body: { text: string; categories: string[] }
}>('/api/parse-invoice', async (request, reply) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return reply.status(501).send({ error: 'ANTHROPIC_API_KEY não configurada' })
  }

  const { text, categories } = request.body
  if (!text || typeof text !== 'string') {
    return reply.status(400).send({ error: 'Campo "text" obrigatório' })
  }

  const catList = (categories ?? []).join(', ') || 'Moradia, Transporte, Alimentação, Saúde, Lazer, Financeiro, Outros'

  const anthropic = new Anthropic({ apiKey })

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `Você é um parser de faturas de cartão de crédito brasileiras.

Analise o texto abaixo extraído de um PDF de fatura e retorne SOMENTE um JSON array com as transações encontradas.

Para cada transação retorne:
- "name": descrição limpa (sem datas, sem códigos longos, max 60 chars)
- "value": valor em reais (number, positivo)
- "category": uma das categorias: ${catList}
- "installmentCurrent": número da parcela atual (se houver, ex: 3 em "PARC 3/12"), ou null
- "installmentTotal": total de parcelas (se houver, ex: 12 em "PARC 3/12"), ou null
- "cleanName": nome sem sufixo de parcela (ex: "AMAZON" a partir de "AMAZON PARC 3/12"), ou null

Regras:
- Ignore linhas de cabeçalho, saldos, totais, pagamentos da fatura e encargos/juros.
- Valores devem ser positivos. Se aparecer negativo (crédito/estorno) ou com "+ R$", ignore.
- Detecte parcelas nos padrões: "PARC 3/12", "03/12" no final, "PARCELA 3 DE 12", "(Parcela 02 de 02)".
- Para faturas do Banco Inter: ignore "PAGAMENTO ON LINE", "IOF", "JUROS PGTO BOLETO", "Total CARTÃO", seção "Próxima fatura" e encargos financeiros. Datas podem estar no formato "14 de fev. 2026".
- Retorne APENAS o JSON array, sem markdown, sem explicação.

Texto da fatura:
${text}`,
      },
    ],
  })

  const content = msg.content[0]
  if (content.type !== 'text') {
    return reply.status(500).send({ error: 'Resposta inesperada do Claude' })
  }

  try {
    const raw = content.text.trim()
    const jsonStr = raw.startsWith('[') ? raw : raw.match(/\[[\s\S]*\]/)?.[0]
    if (!jsonStr) throw new Error('JSON array não encontrado')
    const items: ParsedInvoiceItem[] = JSON.parse(jsonStr)
    return { items }
  } catch {
    return reply.status(500).send({
      error: 'Falha ao parsear resposta do Claude',
      raw: content.text,
    })
  }
})

try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
