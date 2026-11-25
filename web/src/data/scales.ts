import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { api } from '../api';

export type ScaleMode = 'corrida' | 'preta_vermelha' | 'completa';
export type ServiceColor = 'yellow' | 'blue' | 'green';
export type Category = 'corrida' | 'preta' | 'vermelha' | 'roxa';

export interface ScaleService {
  name: string;
  abbreviation: string;
  color: ServiceColor;
  daily_slots: number;
}

export interface ScaleParticipant {
  id: number;
  full_name: string;
  war_name: string;
  rank: string;
  military_number?: string;
}

export interface DutyScale {
  id: number;
  name: string;
  mode: ScaleMode;
  services: ScaleService[];
  participants: ScaleParticipant[];
  /** chave "idDoMilitar|AAAA-MM-DD" → serviço ou marcador especial */
  assignments: Record<string, string>;
  red_dates: string[];
}

export const MODE_LABEL: Record<ScaleMode, string> = {
  corrida: 'Escala corrida',
  preta_vermelha: 'Preta e vermelha',
  completa: 'Completa · preta, vermelha e roxa',
};

export const MODE_HELP: Record<ScaleMode, string> = {
  corrida: 'Não diferencia dias.',
  preta_vermelha: 'Segunda a sexta (preta) e fim de semana (vermelha).',
  completa: 'Sexta roxa; sábado e domingo vermelhos.',
};

export const SERVICE_COLOR: Record<ServiceColor, { label: string; mantine: string }> = {
  green: { label: 'Verde', mantine: 'sigase' },
  blue: { label: 'Azul', mantine: 'blue' },
  yellow: { label: 'Amarelo', mantine: 'yellow' },
};

const SWAP = '__TROCA_SERVICO__::';
const EXCLUDED = '__FORA_ESCALA__::';
const REST = '__FOLGA_MANUAL__::';

export interface CellInfo {
  service: string;
  excluded: boolean;
  reason: string;
  swapName: string;
  restCount: number | null;
}

/** Decodifica o valor salvo em uma célula (mesmo formato da versão atual). */
export function assignmentInfo(value?: string): CellInfo {
  const empty = { service: '', excluded: false, reason: '', swapName: '', restCount: null };
  if (typeof value !== 'string') return empty;
  if (value.startsWith(EXCLUDED)) return { ...empty, excluded: true, reason: value.slice(EXCLUDED.length) };
  if (value.startsWith(REST)) {
    const n = Number(value.slice(REST.length));
    return { ...empty, restCount: Number.isInteger(n) ? Math.max(0, Math.min(99, n)) : null };
  }
  if (value.startsWith(SWAP)) {
    try {
      const parsed = JSON.parse(value.slice(SWAP.length));
      return { ...empty, service: parsed.service || '', swapName: parsed.swap_name || '' };
    } catch {
      return empty;
    }
  }
  return { ...empty, service: value };
}

export const abbreviationOf = (service: Pick<ScaleService, 'name' | 'abbreviation'>) => {
  if (service.abbreviation) return service.abbreviation;
  const words = String(service.name || '').trim().split(/\s+/);
  return words.length > 1 ? words.map((w) => w[0]).join('').slice(0, 6).toUpperCase() : String(service.name || '').slice(0, 4).toUpperCase();
};

export function categoryOf(scale: Pick<DutyScale, 'mode' | 'red_dates'>, day: Dayjs): Category {
  if (scale.mode === 'corrida') return 'corrida';
  if (scale.red_dates.includes(day.format('YYYY-MM-DD')) || day.day() === 0 || day.day() === 6) return 'vermelha';
  if (scale.mode === 'completa' && day.day() === 5) return 'roxa';
  return 'preta';
}

export interface DisplayCell extends CellInfo {
  config?: ScaleService;
  /** Dias de folga na categoria do dia (0–99). */
  rest: number;
}

/**
 * Contagem de folgas por categoria, igual à versão atual: começa em 99, zera em dia de serviço,
 * assume o valor manual quando ajustado e soma 1 a cada dia (até 99). Considera até 800 dias anteriores.
 */
export function computeRow(scale: DutyScale, personId: number, month: Dayjs): Record<string, DisplayCell> {
  const first = month.startOf('month');
  const last = month.endOf('month').startOf('day');
  const firstISO = first.format('YYYY-MM-DD');
  const prefix = `${personId}|`;
  const own: Record<string, string> = {};
  for (const [key, value] of Object.entries(scale.assignments)) if (key.startsWith(prefix)) own[key.slice(prefix.length)] = value;

  const historyStart = first.subtract(800, 'day');
  const historyISO = historyStart.format('YYYY-MM-DD');
  let earliest = historyStart;
  for (const date of Object.keys(own)) if (date >= historyISO && date < firstISO && dayjs(date).isBefore(earliest)) earliest = dayjs(date);

  const counters: Record<Category, number> = { corrida: 99, preta: 99, vermelha: 99, roxa: 99 };
  const out: Record<string, DisplayCell> = {};
  for (let d = earliest; !d.isAfter(last); d = d.add(1, 'day')) {
    const iso = d.format('YYYY-MM-DD');
    const cat = categoryOf(scale, d);
    const info = assignmentInfo(own[iso]);
    const config = scale.services.find((s) => s.name === info.service);
    if (config) counters[cat] = 0;
    else if (info.restCount !== null) counters[cat] = info.restCount;
    else counters[cat] = Math.min(99, counters[cat] + (counters[cat] < 99 ? 1 : 0));
    if (iso >= firstISO) out[iso] = { ...info, config, rest: counters[cat] };
  }
  return out;
}

/** Amanhã e, se for dia vermelho, todos os vermelhos seguidos até o próximo dia comum. */
export function nextServiceDates(scale: DutyScale): Dayjs[] {
  let cursor = dayjs().add(1, 'day').startOf('day');
  const dates = [cursor];
  if (scale.mode !== 'corrida' && categoryOf(scale, cursor) === 'vermelha') {
    let steps = 0;
    while (categoryOf(scale, cursor) === 'vermelha' && steps < 14) {
      cursor = cursor.add(1, 'day');
      steps++;
      if (categoryOf(scale, cursor) === 'vermelha') dates.push(cursor);
    }
    dates.push(cursor);
  }
  return dates;
}

// ---------- API ----------

export function useScales() {
  return useQuery({
    queryKey: ['service-scales'],
    queryFn: async () => (await api<{ scales: DutyScale[] }>('/api/service-scales')).scales,
  });
}

export interface ScaleInput {
  name: string;
  mode: ScaleMode;
  services: ScaleService[];
  participants: number[];
}

export function useSaveScale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ScaleInput & { id?: number }) =>
      api<{ scale: DutyScale }>(id ? `/api/service-scales/${id}` : '/api/service-scales', { method: id ? 'PUT' : 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-scales'] }),
  });
}

export interface CellInput {
  person_id: number;
  date: string;
  status: 'off' | 'service' | 'excluded' | 'rest';
  service: string | null;
  swap_name: string;
  rest_count: number;
  excluded_days: number;
  reason: string;
}

export function useSaveCell(scaleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CellInput) => api(`/api/service-scales/${scaleId}/cell`, { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-scales'] }),
  });
}

export function useToggleRedDate(scaleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { date: string; is_red: boolean }) => api(`/api/service-scales/${scaleId}/date-type`, { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-scales'] }),
  });
}
