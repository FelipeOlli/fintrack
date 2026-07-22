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

type Account = { id: string; name: string; cardType: string; closingDay?: number; dueDay?: number }
type Category = { id: string; name: string; color: string }
type IncomeSource = { id: string; name: string; recurring: boolean; defaultValue?: number }
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

const fastify = Fastify({ logger: true, bodyLimit: 25 * 1024 * 1024 })

// Auto-migration: garante colunas adicionadas após o schema inicial
await pool.query(`ALTER TABLE account ADD COLUMN IF NOT EXISTS closing_day INTEGER CHECK (closing_day BETWEEN 1 AND 31)`)
await pool.query(`ALTER TABLE account ADD COLUMN IF NOT EXISTS due_day INTEGER CHECK (due_day BETWEEN 1 AND 31)`)
await pool.query(`ALTER TABLE income_source ADD COLUMN IF NOT EXISTS default_value NUMERIC(14,2)`)
await pool.query(`
  CREATE TABLE IF NOT EXISTS notif_fired (
    workspace_id UUID NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    month_key TEXT NOT NULL,
    level INTEGER NOT NULL,
    fired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, month_key, level)
  )
`)

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
    fired,
  ] = await Promise.all([
    pool.query<{
      id: string
      name: string
      card_type: string
      closing_day: number | null
      due_day: number | null
    }>('SELECT id, name, card_type, closing_day, due_day FROM account WHERE workspace_id = $1 ORDER BY name', [ws]),
    pool.query<{ id: string; name: string; color: string }>(
      'SELECT id, name, color FROM category WHERE workspace_id = $1 ORDER BY name',
      [ws],
    ),
    pool.query<{
      id: string
      name: string
      recurring: boolean
      default_value: number | null
    }>('SELECT id, name, recurring, default_value FROM income_source WHERE workspace_id = $1 ORDER BY name', [ws]),
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
    pool.query<{ month_key: string; level: string }>(
      'SELECT month_key, MAX(level) AS level FROM notif_fired WHERE workspace_id = $1 GROUP BY month_key',
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

  const firedLevels: Record<string, number> = {}
  for (const row of fired.rows) {
    firedLevels[row.month_key] = Number(row.level)
  }

  return {
    accounts: acc.rows.map((a) => ({
      id: a.id,
      name: a.name,
      cardType: a.card_type,
      ...(a.closing_day != null ? { closingDay: a.closing_day } : {}),
      ...(a.due_day != null ? { dueDay: a.due_day } : {}),
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
      ...(s.default_value != null ? { defaultValue: Number(s.default_value) } : {}),
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
    firedLevels,
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
        const cd = a.cardType === 'credito' && a.closingDay && a.closingDay >= 1 && a.closingDay <= 31 ? a.closingDay : null
        const dd = a.cardType === 'credito' && a.dueDay && a.dueDay >= 1 && a.dueDay <= 31 ? a.dueDay : null
        await c.query(
          `INSERT INTO account (id, workspace_id, name, card_type, closing_day, due_day) VALUES ($1,$2,$3,$4,$5,$6)`,
          [a.id, ws, a.name, a.cardType, cd, dd],
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
      // Remove apenas fontes ausentes da lista — nunca apaga tudo de uma vez (evita cascade em month_income)
      if (sources.length > 0) {
        const ids = sources.map((s) => s.id)
        await c.query(
          `DELETE FROM income_source WHERE workspace_id = $1 AND id <> ALL($2::text[])`,
          [ws, ids],
        )
      }
      // Se sources vier vazio, não faz nada (proteção contra wipe acidental)
      // Upsert cada fonte (preserva month_income existente)
      for (const s of sources) {
        const dv = s.recurring && typeof s.defaultValue === 'number' && s.defaultValue >= 0 ? s.defaultValue : null
        await c.query(
          `INSERT INTO income_source (id, workspace_id, name, recurring, default_value)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, recurring = EXCLUDED.recurring, default_value = EXCLUDED.default_value`,
          [s.id, ws, s.name, s.recurring, dv],
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
  Body: { text?: string; images?: string[]; mimeType?: string; categories: string[] }
}>('/api/parse-invoice', async (request, reply) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return reply.status(501).send({ error: 'ANTHROPIC_API_KEY não configurada' })
  }

  const { text, images, mimeType, categories } = request.body
  const hasText = text && typeof text === 'string'
  const hasImages = Array.isArray(images) && images.length > 0
  if (!hasText && !hasImages) {
    return reply.status(400).send({ error: 'Campo "text" ou "images" obrigatório' })
  }

  const catList = (categories ?? []).join(', ') || 'Moradia, Transporte, Alimentação, Saúde, Lazer, Financeiro, Outros'

  const invoicePrompt = `Você é um parser de faturas de cartão de crédito brasileiras. Funciona para faturas de qualquer banco brasileiro (Inter, Nubank, Itaú, Bradesco, C6, etc.).

Analise ${hasImages ? 'as imagens acima (prints de uma fatura — podem estar em sequência, continuação da mesma fatura)' : 'o texto abaixo (pode ter sido extraído de PDF, copiado de tabela web ou colado manualmente — inclusive sem quebras de linha entre os lançamentos)'} e retorne SOMENTE um JSON array com as transações encontradas.

Para cada transação retorne:
- "name": descrição limpa (sem datas, sem códigos longos, max 60 chars)
- "value": valor em reais (number, positivo)
- "category": uma das categorias: ${catList}
- "installmentCurrent": número da parcela atual (se houver, ex: 3 em "PARC 3/12"), ou null
- "installmentTotal": total de parcelas (se houver, ex: 12 em "PARC 3/12"), ou null
- "cleanName": nome sem sufixo de parcela (ex: "AMAZON" a partir de "AMAZON PARC 3/12"), ou null

Regras:
- O texto pode vir SEM quebras de linha entre os lançamentos (colado de tabela web). Nesse caso, use a data DD/MM/YYYY como separador e extraia cada lançamento separadamente.
- Ignore linhas de cabeçalho, saldos, totais, pagamentos da fatura e encargos/juros.
- Valores devem ser positivos. Se aparecer negativo (crédito/estorno) ou com "+ R$", ignore.
- Detecte parcelas nos padrões: "PARC 3/12", "03/12" no final, "PARCELA 3 DE 12", "(Parcela 02 de 02)".
- Ignore linhas do tipo: "PAGAMENTO ON LINE", "IOF", "JUROS PGTO BOLETO", "Total CARTÃO XXXX", seção "Próxima fatura", encargos financeiros, cabeçalhos "CARTÃO 5555****XXXX".
- Datas podem aparecer em vários formatos: "14/06/2026", "14/06/26", "14 de jun. 2026", "14 de junho de 2026".
- Retorne APENAS o JSON array, sem markdown, sem explicação.`

  const anthropic = new Anthropic({ apiKey })

  type ContentBlock = { type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  const userContent: ContentBlock[] | string = hasImages
    ? [
        ...(images as string[]).map((img): ContentBlock => ({
          type: 'image',
          source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: img },
        })),
        { type: 'text', text: invoicePrompt },
      ]
    : `${invoicePrompt}\n\nTexto da fatura:\n${text}`

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: userContent as Parameters<typeof anthropic.messages.create>[0]['messages'][0]['content'],
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

// ── Análise de documento via Claude — extrai todos os lançamentos ──
type AnalyzeBillBody = {
  type: 'image' | 'text'
  content: string
  mimeType?: string
  categories: string[]
}

fastify.post<{ Body: AnalyzeBillBody }>('/api/analyze-bill-document', async (request, reply) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return reply.status(501).send({ error: 'ANTHROPIC_API_KEY não configurada' })
  }

  const { type, content, mimeType, categories } = request.body
  if (!content || typeof content !== 'string') {
    return reply.status(400).send({ error: 'Campo "content" obrigatório' })
  }

  const catList = (categories ?? []).join(', ') || 'Moradia, Transporte, Alimentação, Saúde, Lazer, Financeiro, Outros'
  const systemPrompt = `Você analisa comprovantes, recibos, notas fiscais e extratos brasileiros.
Extraia TODOS os lançamentos financeiros presentes no documento e retorne SOMENTE um array JSON:
[{ "name": "descrição limpa (max 60 chars)", "value": 0.0, "category": "uma de: ${catList}", "status": "pendente ou pago", "obs": "informação extra útil ou vazio" }, ...]
Regras: valores em reais (number positivo). Se o item já estiver quitado use "pago", senão "pendente".
Se houver apenas um lançamento, retorne um array com um único objeto.
Retorne APENAS o array JSON, sem markdown, sem explicação.`

  const anthropic = new Anthropic({ apiKey })

  type ContentBlock = { type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  const userContent: ContentBlock[] = type === 'image'
    ? [
        { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: content } },
        { type: 'text', text: systemPrompt },
      ]
    : [{ type: 'text', text: `${systemPrompt}\n\nTexto do documento:\n${content}` }]

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: userContent as Parameters<typeof anthropic.messages.create>[0]['messages'][0]['content'] }],
  })

  const block = msg.content[0]
  if (block.type !== 'text') {
    return reply.status(500).send({ error: 'Resposta inesperada do Claude' })
  }

  try {
    const raw = block.text.trim()
    // Aceita array cru, array dentro de markdown, ou objeto único (compat.)
    let parsed: unknown
    if (raw.startsWith('[')) {
      parsed = JSON.parse(raw)
    } else {
      const arrMatch = raw.match(/\[[\s\S]*\]/)
      if (arrMatch) {
        parsed = JSON.parse(arrMatch[0])
      } else {
        // fallback: objeto único → embrulha em array
        const objMatch = raw.match(/\{[\s\S]*\}/)
        if (!objMatch) throw new Error('JSON não encontrado')
        parsed = [JSON.parse(objMatch[0])]
      }
    }
    const bills = Array.isArray(parsed) ? parsed : [parsed]
    return { bills }
  } catch {
    return reply.status(422).send({ error: 'Falha ao parsear resposta do Claude', raw: block.text })
  }
})

// ── Notificações de orçamento via Telegram (com claim atômico anti-duplicata) ──
fastify.post<{ Body: { text: string; monthKey?: string; level?: number }; Querystring: { workspaceId?: string } }>(
  '/api/notify-telegram',
  async (request, reply) => {
    const { text, monthKey, level } = request.body
    if (!text || typeof text !== 'string') {
      return reply.status(400).send({ error: 'Campo "text" obrigatório' })
    }

    // Claim atômico: registra (workspace, mês, nível) — ON CONFLICT DO NOTHING garante idempotência
    if (monthKey && level != null) {
      const ws = workspaceId(request.query)
      const claimed = await pool.query<{ level: number }>(
        `INSERT INTO notif_fired (workspace_id, month_key, level)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING
         RETURNING level`,
        [ws, monthKey, level],
      )
      // Já foi disparado por outro dispositivo neste mês → não envia novamente
      if (claimed.rowCount === 0) {
        return { ok: true, fired: false }
      }
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID
    if (!botToken || !chatId) {
      // Claim já registrado (se havia), mas Telegram não configurado — ok silencioso
      return reply.status(501).send({ error: 'TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurados' })
    }
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
    const data = await res.json() as { ok: boolean }
    if (!data.ok) {
      return reply.status(502).send({ error: 'Telegram retornou erro', data })
    }
    return { ok: true, fired: true }
  },
)

try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
