ALTER TABLE public.app_users
    ADD COLUMN IF NOT EXISTS avatar_icon TEXT NOT NULL DEFAULT '';
