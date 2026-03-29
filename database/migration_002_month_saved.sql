-- Executar uma vez em bases já criadas antes desta migração (ex.: DbGate).
BEGIN;

CREATE TABLE IF NOT EXISTS month_saved (
    workspace_id UUID NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    month_key TEXT NOT NULL,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, month_key)
);

-- Marcar meses que já tinham linhas em bill (comportamento legado sem month_saved)
INSERT INTO month_saved (workspace_id, month_key)
SELECT DISTINCT workspace_id, month_key
FROM bill
ON CONFLICT DO NOTHING;

COMMIT;
