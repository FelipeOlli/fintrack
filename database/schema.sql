-- FinTrack — schema PostgreSQL (alinhado ao modelo localStorage atual)
-- Pré-requisito: PostgreSQL 14+
--
-- EASYPANEL:
-- 1. Crie um serviço "PostgreSQL" no mesmo projeto (ou compartilhado).
-- 2. Anote host, porta, utilizador, password e nome da base (ex.: fintrack).
-- 3. Abra "Console" ou use psql / cliente SQL e execute este ficheiro:
--    psql "postgresql://USER:PASS@HOST:5432/fintrack" -f schema.sql
--
-- A SPA em React continua a gravar no browser até existir API que use esta base.

BEGIN;

-- Um "espaço" lógico por utilizador/equipa (por agora um UUID fixo na app).
CREATE TABLE IF NOT EXISTS workspace (
    id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    name TEXT NOT NULL DEFAULT 'default',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO workspace (id, name)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'default')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS account (
    id TEXT PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    card_type TEXT NOT NULL CHECK (card_type IN ('nenhum', 'credito', 'debito')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS category (
    id TEXT PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS income_source (
    id TEXT PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    recurring BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Valores de renda por mês (equivalente a income_YYYY_MM no localStorage)
CREATE TABLE IF NOT EXISTS month_income (
    workspace_id UUID NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    month_key TEXT NOT NULL,
    source_id TEXT NOT NULL REFERENCES income_source (id) ON DELETE CASCADE,
    value NUMERIC(14, 2) NOT NULL DEFAULT 0,
    PRIMARY KEY (workspace_id, month_key, source_id)
);

CREATE INDEX IF NOT EXISTS idx_month_income_month ON month_income (workspace_id, month_key);

-- Templates recorrentes (recurring_bills)
CREATE TABLE IF NOT EXISTS recurring_template (
    id BIGSERIAL PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    value NUMERIC(14, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('pago', 'pendente', 'divida', 'vazio')),
    account_id TEXT REFERENCES account (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, name, category)
);

-- Lançamentos por mês (antes: array em bills_YYYY_MM)
CREATE TABLE IF NOT EXISTS bill (
    id BIGSERIAL PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    month_key TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    value NUMERIC(14, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('pago', 'pendente', 'divida', 'vazio')),
    obs TEXT NOT NULL DEFAULT '',
    account_id TEXT REFERENCES account (id) ON DELETE SET NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bill_month ON bill (workspace_id, month_key);

-- Meses em que o utilizador já gravou lançamentos (permite “mês vazio” vs “nunca aberto”)
CREATE TABLE IF NOT EXISTS month_saved (
    workspace_id UUID NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    month_key TEXT NOT NULL,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, month_key)
);

COMMIT;
