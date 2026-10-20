-- SIGASE: número militar e antiguidade por posto/graduação.
-- Execute manualmente no SQL Editor do Supabase antes de usar esta versão.
ALTER TABLE public.unit_personnel
    ADD COLUMN IF NOT EXISTS military_number TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS seniority_order INTEGER;

-- Ordem inicial previsível; ajuste depois para refletir a antiguidade real.
WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY rank ORDER BY full_name, id)::INTEGER AS position
    FROM public.unit_personnel
)
UPDATE public.unit_personnel AS personnel
SET seniority_order = ordered.position
FROM ordered
WHERE personnel.id = ordered.id AND personnel.seniority_order IS NULL;
