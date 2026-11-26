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

export type EntryType = 'periodo' | 'desconto';

export interface VacationInput {
  person_id: number;
  start_date: string;
  end_date: string;
  travel_days: boolean;
  period_number: number;
  period_total: number;
  reference_year: number;
  entry_type: EntryType;
  split_plan: string;
}

// ---------- regras ----------

/** Divisões aceitas: /1 30 · /2 15+15 ou 20+10 · /3 10+10+10. */
export const SPLITS = [
  { value: '30', total: 1, parts: [30], label: '30 dias' },
  { value: '15+15', total: 2, parts: [15, 15], label: '15 + 15' },
  { value: '20+10', total: 2, parts: [20, 10], label: '20 + 10' },
  { value: '10+10+10', total: 3, parts: [10, 10, 10], label: '10 + 10 + 10' },
] as const;
export type SplitValue = (typeof SPLITS)[number]['value'];

export const splitOf = (value?: string | null) => SPLITS.find((s) => s.value === value);
/** Lançamentos antigos não têm divisão gravada: deduz pela quantidade de parcelas. */
export const guessSplit = (total: number): SplitValue => (total === 1 ? '30' : total === 3 ? '10+10+10' : '15+15');

/** REF sugerida: férias iniciadas até novembro são da referência do ano anterior; a partir de dezembro, do próprio ano. */
export const suggestedReferenceYear = (start?: string | null) => {
  const d = start ? dayjs(start) : dayjs();
  return d.month() >= 11 ? d.year() : d.year() - 1;
};

export const presentationDate = (end: string, travel: boolean) => dayjs(end).add(1 + (travel ? 2 : 0), 'day').format('YYYY-MM-DD');
export const isDiscount = (p: Pick<VacationPeriod, 'entry_type'>) => p.entry_type === 'desconto';
export const ordinal = (n: number) => `${n}ª`;

export interface ParcelStatus {
  number: number;
  planned: number;
  /** Dias esperados nesta parcela (a última perde os dias de desconto). */
  expected: number;
  entry?: VacationPeriod;
}

export interface RefSummary {
  personId: number;
  ref: number;
  split?: (typeof SPLITS)[number];
  parcels: ParcelStatus[];
  discounts: VacationPeriod[];
  discountDays: number;
  usedDays: number;
  remainingDays: number;
  travel?: VacationPeriod;
  warnings: string[];
}

/** Situação das férias de um militar numa referência: parcelas, descontos, deslocamento e saldo. */
export function summarize(periods: VacationPeriod[], personId: number, ref: number, ignoreId?: number): RefSummary {
  const own = periods.filter((p) => p.person_id === personId && Number(p.reference_year) === ref && p.id !== ignoreId);
  const parcelsIn = own.filter((p) => !isDiscount(p));
  const discounts = own.filter(isDiscount).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const discountDays = discounts.reduce((n, d) => n + d.vacation_days, 0);
  const splitValue = parcelsIn.find((p) => p.split_plan)?.split_plan || (parcelsIn[0] ? guessSplit(parcelsIn[0].period_total) : undefined);
  const split = splitOf(splitValue);
  const parcels: ParcelStatus[] = (split?.parts ?? []).map((planned, i) => ({
    number: i + 1,
    planned,
    expected: i === (split?.parts.length ?? 0) - 1 ? Math.max(0, planned - discountDays) : planned,
    entry: parcelsIn.find((p) => p.period_number === i + 1),
  }));
  const usedDays = own.reduce((n, p) => n + p.vacation_days, 0);
  const warnings: string[] = [];
  for (const pc of parcels) {
    if (pc.entry && pc.entry.vacation_days !== pc.expected)
      warnings.push(`A ${ordinal(pc.number)} parcela tem ${pc.entry.vacation_days} dias; o esperado é ${pc.expected}${pc.expected !== pc.planned ? ` (${pc.planned} − ${discountDays} de desconto)` : ''}.`);
  }
  if (usedDays > 30) warnings.push(`Total de ${usedDays} dias lançados; o máximo é 30.`);
  return { personId, ref, split, parcels, discounts, discountDays, usedDays, remainingDays: Math.max(0, 30 - usedDays), travel: own.find((p) => p.travel_days), warnings };
}

// ---------- API ----------

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
