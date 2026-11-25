import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api } from '../api';
import type { HistoryEntry, Notice, OnlineUser } from '../types';

export function useAckNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/api/notices/${id}/ack`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notices'] }),
  });
}

export interface NewNotice {
  title: string;
  subject: string;
  notice_date: string;
  all_users: boolean;
  recipient_ids: number[];
}

export function useCreateNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NewNotice) => api('/api/notices', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notices'] }),
  });
}

export function useHistory(enabled: boolean) {
  return useQuery({
    queryKey: ['history'],
    queryFn: () => api<{ entries: HistoryEntry[]; online: OnlineUser[] }>('/api/history'),
    enabled,
    refetchInterval: 30_000,
  });
}

/** Avisos aparecem na Página Inicial a partir de 2 dias antes da data (regra da versão atual). */
export const noticeIsUpcoming = (notice: Notice) => notice.notice_date <= dayjs().add(2, 'day').format('YYYY-MM-DD');

export const pendingNotices = (notices: Notice[]) =>
  notices.filter((n) => n.is_recipient && !n.acknowledged && noticeIsUpcoming(n)).sort((a, b) => a.notice_date.localeCompare(b.notice_date));

export function noticeUrgency(notice: Notice): { label: string; color: string } {
  const days = dayjs(notice.notice_date).startOf('day').diff(dayjs().startOf('day'), 'day');
  if (days >= 3) return { label: `Em ${days} dias`, color: 'gray' };
  if (days === 2) return { label: 'Daqui 2 dias', color: 'brass' };
  if (days === 1) return { label: 'Amanhã', color: 'orange' };
  if (days === 0) return { label: 'Hoje', color: 'red' };
  return { label: `Atrasado há ${-days} ${days === -1 ? 'dia' : 'dias'}`, color: 'red' };
}
