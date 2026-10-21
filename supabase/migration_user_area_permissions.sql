ALTER TABLE public.app_users
    ADD COLUMN IF NOT EXISTS permissions_json TEXT;

-- Initialize pre-existing accounts once, before the column is made non-null.
UPDATE public.app_users
SET permissions_json = CASE
    WHEN role = 'editor' THEN '["tasks","documents","requirements"]'
    ELSE '[]'
END
WHERE permissions_json IS NULL;

ALTER TABLE public.app_users
    ALTER COLUMN permissions_json SET DEFAULT '[]',
    ALTER COLUMN permissions_json SET NOT NULL;
