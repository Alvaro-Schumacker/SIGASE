-- Adiciona o ano de referência ao plano de férias existente.
-- Sugestão inicial: períodos iniciados antes de 1º de dezembro de 2026 recebem REF 2025.
-- Esta classificação preenche somente registros sem ano e não substitui escolhas existentes.
ALTER TABLE public.vacation_plan
    ADD COLUMN IF NOT EXISTS reference_year INTEGER;

UPDATE public.vacation_plan
SET reference_year = CASE
    WHEN start_date < '2026-12-01' THEN 2025
    ELSE 2026
END
WHERE reference_year IS NULL;

ALTER TABLE public.vacation_plan
    ALTER COLUMN reference_year SET DEFAULT 2026,
    ALTER COLUMN reference_year SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'vacation_plan_reference_year_check'
          AND conrelid = 'public.vacation_plan'::regclass
    ) THEN
        ALTER TABLE public.vacation_plan
            ADD CONSTRAINT vacation_plan_reference_year_check
            CHECK (reference_year IN (2025, 2026));
    END IF;
END
$$;
