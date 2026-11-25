import dayjs from 'dayjs';

/** Datas da API vêm como 'YYYY-MM-DD' (sem fuso); dayjs as trata como horário local. */
export const fmtDate = (value?: string | null) => (value ? dayjs(value.slice(0, 10)).format('DD/MM/YYYY') : '—');
export const fmtShort = (value?: string | null) => (value ? dayjs(value.slice(0, 10)).format('DD MMM').replace('.', '') : '—');
export const todayISO = () => dayjs().format('YYYY-MM-DD');
export const isoOf = (date: Date | string) => dayjs(date).format('YYYY-MM-DD');
export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Remove a graduação do início do nome ("1º Sgt Almeida" → "Almeida"), como na versão atual. */
export const stripRank = (name: string) =>
  name.replace(/^(?:(?:Cap|1º Ten|2º Ten|STen|1º Sgt|2º Sgt|3º Sgt|Cb EP|Cb EV|Sd EP|Sd EV)(?:\s+\d+)?\s+)/i, '').trim();

export const daysFromToday = (iso: string) => dayjs(iso.slice(0, 10)).startOf('day').diff(dayjs().startOf('day'), 'day');

export const ROLE_LABEL = { admin: 'Administrador', editor: 'Editor', viewer: 'Visitante' } as const;
