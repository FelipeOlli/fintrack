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

### PDF Import

`src/lib/pdfImportFromText.ts` extrai texto via PDF.js (carregado do CDN em `index.html`) e usa heurísticas com as keywords de `src/constants/categories.ts` para auto-categorizar transações brasileiras.

### Variáveis de ambiente

Frontend (`.env`):
- `VITE_API_URL` — URL base da API (opcional; omitir = modo offline)
- `VITE_WORKSPACE_ID` — UUID do workspace (opcional; gera UUID fixo se ausente)

Backend (`server/.env`):
- `DATABASE_URL` — Connection string PostgreSQL
- `PORT` — Padrão 3000
- `CORS_ORIGIN` — Padrão `*`

### Deploy

- **Frontend**: `docker build` na raiz → Nginx serve `dist/`
- **Backend**: `docker build` em `server/` → Node Alpine
- Plataforma alvo: Easypanel na Hetzner

---

## Sessões recentes
