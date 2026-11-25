import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api } from '../api';
import type { VacationPeriod } from '../types';

export function useVacationPlan() {
  return useQuery({
    queryKey: ['vacation-plan'],
    queryFn: async () => (await api<{ periods: VacationPeriod[] }>('/api/vacation-plan')).periods,
    staleTime: 60_000,
  });
}

export interface VacationInput {
  person_id: number;
  start_date: string;
  end_date: string;
  travel_days: boolean;
  period_number: number;
  period_total: number;
  reference_year: number;
}

/** REF 2025 para início antes de 01/12/2026; REF 2026 a partir daí (sugestão, como na versão atual). */
export const suggestedReferenceYear = (start?: string | null) => (start && start < '2026-12-01' ? 2025 : 2026);

export const presentationDate = (end: string, travel: boolean) => dayjs(end).add(1 + (travel ? 2 : 0), 'day').format('YYYY-MM-DD');

export function useSaveVacation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: VacationInput & { id?: number }) =>
      api<{ period: VacationPeriod }>(id ? `/api/vacation-plan/${id}` : '/api/vacation-plan', { method: id ? 'PUT' : 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vacation-plan'] });
      qc.invalidateQueries({ queryKey: ['notices'] });
    },
  });
}

export function useDeleteVacation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/api/vacation-plan/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vacation-plan'] }),
  });
}
