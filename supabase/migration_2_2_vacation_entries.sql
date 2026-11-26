-- SIGASE 2.2: plano de férias com desconto em férias, parcelamento e qualquer ano de referência.
-- O servidor aplica estas alterações sozinho ao iniciar (via schema.sql); este arquivo é só para referência
-- ou aplicação manual no SQL Editor. Nenhum período existente é apagado ou alterado.

-- Libera anos de referência além de 2025/2026 (o servidor valida o intervalo).
ALTER TABLE public.vacation_plan DROP CONSTRAINT IF EXISTS vacation_plan_reference_year_check;

-- 'periodo' (parcela de férias) ou 'desconto' (dias avulsos descontados da última parcela).
ALTER TABLE public.vacation_plan ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'periodo';

-- Divisão das férias da referência: '30', '15+15', '20+10' ou '10+10+10' ('' = não informado).
ALTER TABLE public.vacation_plan ADD COLUMN IF NOT EXISTS split_plan TEXT NOT NULL DEFAULT '';
