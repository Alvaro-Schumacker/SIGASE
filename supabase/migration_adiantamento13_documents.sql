-- Allow the new 13th salary advance request document type.
-- Run once in the Supabase SQL Editor before using the updated application.

ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_kind_check;

ALTER TABLE public.documents
    ADD CONSTRAINT documents_kind_check
    CHECK (kind IN ('aditamento', 'pernoite', 'fatd', 'prorrogacao', 'adiantamento13'));
