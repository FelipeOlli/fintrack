# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

### Frontend (raiz do projeto)
```bash
npm run dev       # Vite dev server (HMR)
npm run build     # tsc + vite build
npm run lint      # ESLint
npm run test      # Vitest (unit tests)
npm run preview   # Preview do build estático
```

### Backend (diretório `server/`)
```bash
cd server
npm run dev       # tsx watch (hot reload)
npm run build     # tsc
npm start         # node exec (produção)
```

### Rodar um teste específico
```bash
npm run test -- persistence  # filtra por nome do arquivo/describe
```

### Banco de dados
Schema em `database/schema.sql`. Para resetar: executar o script no PostgreSQL diretamente.

---

## Arquitetura

### Visão geral

SPA React 19 + TypeScript + Vite com backend Fastify opcional. Funciona 100% offline via `localStorage`; com `VITE_API_URL` definida, usa PostgreSQL via API REST.

```
financeiromaster/
├── src/                    # Frontend React
│   ├── App.tsx             # Componente raiz (monolítico — contém modais e lógica de PDF)
│   ├── app/                # State global via Context API
│   │   ├── FinTrackProvider.tsx
│   │   ├── useFinTrack.ts  # Hook principal — tudo que a UI consome
│   │   └── finTrackTypes.ts
│   ├── components/         # Sidebar, Topbar, Content, DashboardMagik (Recharts)
│   ├── storage/
│   │   └── persistence.ts  # Camada dual: localStorage OU API REST
│   ├── lib/                # PDF parsing, formatação, séries de meses
│   ├── domain/types.ts     # Tipos de domínio (Bill, Account, Category, etc.)
│   └── constants/categories.ts  # Keywords para auto-categorização de PDF
├── server/src/index.ts     # Fastify: endpoints GET bootstrap + PUT/DELETE por entidade
├── database/schema.sql     # DDL PostgreSQL (workspace, accounts, bills, etc.)
├── Dockerfile              # Build React → Nginx SPA
├── server/Dockerfile       # Build Node → Alpine
└── nginx.conf              # SPA fallback + gzip + cache headers
```

### Persistência híbrida

`src/storage/persistence.ts` decide o modo na inicialização:
- **Modo offline** (padrão): `localStorage` com chaves como `bills_YYYY_MM`, `fintrack_accounts`, etc.
- **Modo API** (`VITE_API_URL` definido): `initPersistence()` chama `GET /api/bootstrap` e cacheia; escritas vão para `PUT /api/bills/:monthKey`, `PUT /api/categories`, etc.

O Vite dev proxy redireciona `/api` → `http://127.0.0.1:3000` (ver `vite.config.ts`).

### Modelos de domínio principais

```typescript
type BillStatus = 'pago' | 'pendente' | 'divida' | 'vazio'
type CardType = 'nenhum' | 'credito' | 'debito'
// Account, Bill, RecurringTemplate, Category, IncomeSource, MonthIncomeEntry
// → ver src/domain/types.ts
```

### PDF Import com Claude AI

Pipeline de importação de faturas (`src/app/` + `src/lib/`):
1. **Wizard 3 passos** em `#page-importar`: upload → revisão → preview por mês
2. **Parse**: `POST /api/parse-invoice` (Claude Haiku) → fallback para `parseTransactionsFromText` (regex local)
3. **Detecção de parcelas**: `detectInstallment()` em `pdfImportFromText.ts` — padrões `PARC 3/12`, `03/12` no fim da linha
4. **Projeção multi-mês**: `buildImportProjection()` em `src/lib/importProjection.ts` distribui itens parcelados para meses futuros
5. **Deduplicação**: `deduplicateAcrossMonths()` em `src/lib/deduplication.ts` — normaliza nomes e compara contra bills existentes em todos os meses projetados

Arquivos criados nessa feature:
- `src/lib/monthKeyUtils.ts` — `advanceMonthKey()`, `computeInstallmentMonths()`
- `src/lib/deduplication.ts` — `normalizeBillName()`, `matchAgainstExisting()`, `deduplicateAcrossMonths()`
- `src/lib/importProjection.ts` — `buildImportProjection()`

### Fontes de renda recorrentes

`src/storage/persistence.ts` — funções de fallback:
- `getValorFonteComFallback(monthKey, sourceId, recurring)` — retorna valor explícito do mês ou, se recorrente e sem valor, busca o último mês anterior com valor salvo
- `getTotalMonthIncomeWithFallback(monthKey)` — total de renda considerando fallback de fontes recorrentes
- `listPastMonthKeys(beforeMonthKey)` — lista meses anteriores com income salvo (localStorage ou apiCache)

`App.tsx` usa `getTotalMonthIncomeWithFallback` em todos os cálculos de renda total. Modal de edição exibe "🔄 Valor herdado do mês anterior" quando o valor é fallback.

### Variáveis de ambiente

Frontend (`.env`):
- `VITE_API_URL` — URL base da API (opcional; omitir = modo offline)
- `VITE_WORKSPACE_ID` — UUID do workspace (opcional; gera UUID fixo se ausente)

Backend (`server/.env`):
- `DATABASE_URL` — Connection string PostgreSQL
- `PORT` — Padrão 3000
- `ANTHROPIC_API_KEY` — Necessário para `POST /api/parse-invoice` (Claude Haiku)

### Deploy (Easypanel — Hetzner)

- **Frontend** (`sintel-fintrack.bhtdat.easypanel.host`): Build Path `/`, Dockerfile `Dockerfile`, Build Arg `VITE_API_URL`
- **Backend** (`sintel-fintrack-api.bhtdat.easypanel.host`): Build Path `server`, Dockerfile `Dockerfile`, porta 3000
- **DB**: PostgreSQL interno no Easypanel — connection string via `DATABASE_URL` no serviço da API
- `VITE_*` são embedded no build → devem ser passados como Build Args no Easypanel (aba Environment passa como `--build-arg` automaticamente)

---

## Sessões recentes

- **2026-04-28**: Import de faturas PDF com Claude AI (wizard 3 passos, detecção de parcelas, projeção multi-mês, deduplicação). Deploy Easypanel frontend + API. Correção de bugs: botão excluir bills, CORS, inicialização apiCache. Fontes de renda recorrentes com fallback de valor entre meses.
