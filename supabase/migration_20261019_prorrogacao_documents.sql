ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_kind_check;

ALTER TABLE public.documents
    ADD CONSTRAINT documents_kind_check
    CHECK (kind IN ('aditamento', 'pernoite', 'fatd', 'prorrogacao'));
