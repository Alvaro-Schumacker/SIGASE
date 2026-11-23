-- SIGASE 1.1.2: troca obrigatória de senha.
-- O servidor também aplica esta alteração automaticamente ao iniciar (via schema.sql).
-- Marca usuários para trocar a senha no próximo acesso; senhas fracas (ex.: 0000) são detectadas no login.
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
