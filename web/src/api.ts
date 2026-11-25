import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppUser, Me, Notice, Task, TaskCategory, TaskPriority, TaskStatus } from './types';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

/** Chamada à API do server.py (mesma API usada pela versão atual). */
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor do SIGASE.', 0);
  }
  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    /* resposta não-JSON */
  }
  if (!response.ok) {
    throw new ApiError(String(data.error ?? `Falha do servidor (${response.status}).`), response.status, data.code as string | undefined);
  }
  return data as T;
}

const POLL = 30_000;

// ---------- sessão ----------

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<Me>('/api/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: Infinity,
    retry: false,
  });
}

/** Usuário logado (só use dentro de telas que exigem login). */
export function useCurrentUser(): Me {
  const { data } = useMe();
  if (!data) throw new Error('useCurrentUser usado sem sessão.');
  return data;
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { login: string; password: string }) => api<Me>('/api/login', { method: 'POST', body }),
    onSuccess: (me) => qc.setQueryData(['me'], me),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/api/logout', { method: 'POST' }).catch(() => undefined),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(['me'], null);
    },
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) =>
      api<Me>('/api/me/password', { method: 'POST', body }),
    onSuccess: (me) => qc.setQueryData(['me'], me),
  });
}

// ---------- dados ----------

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async () => (await api<{ tasks: Task[] }>('/api/tasks')).tasks,
    refetchInterval: POLL,
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api<{ users: AppUser[] }>('/api/users')).users,
    staleTime: 5 * 60_000,
  });
}

export function useTaskCategories() {
  return useQuery({
    queryKey: ['task-categories'],
    queryFn: async () => (await api<{ categories: TaskCategory[] }>('/api/task-categories')).categories,
    staleTime: 5 * 60_000,
  });
}

export function useNotices() {
  return useQuery({
    queryKey: ['notices'],
    queryFn: async () => (await api<{ notices: Notice[] }>('/api/notices')).notices,
    refetchInterval: POLL,
  });
}

export interface NewTask {
  title: string;
  description: string;
  classification: string;
  assignee_ids: number[];
  priority: TaskPriority;
  due: string;
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NewTask) => api<{ task: Task }>('/api/tasks', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Exclude<TaskStatus, 'Pendente'> }) =>
      api(`/api/tasks/${id}`, { method: 'PUT', body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
