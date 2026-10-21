-- SIGASE: support one task assigned to multiple users.
-- Run once in the Supabase SQL Editor for an existing database.

CREATE TABLE IF NOT EXISTS public.task_assignees (
    task_id BIGINT NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_user
    ON public.task_assignees (user_id, task_id);

INSERT INTO public.task_assignees (task_id, user_id)
SELECT id, assignee_id FROM public.tasks
ON CONFLICT DO NOTHING;

ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.task_assignees FROM anon, authenticated;
