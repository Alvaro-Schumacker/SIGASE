/**
 * Importação do plano de férias a partir da planilha .xlsx usada pelo Grupo.
 *
 * A planilha tem uma aba por círculo (Oficiais, ST/Sgt, Cb/Sd), dividida em blocos ("1º PERÍODO – 1º DEZ 26
 * À 30 DEZ 26 ..."), cada um com seu cabeçalho (GRAD, Nome Completo, Início, Término, desl, Pronto Sv,
 * Período...). As colunas mudam de posição entre as abas, então são localizadas pelo nome.
 *
 * Cuidados com os dados reais:
 * - datas digitadas sem ano ficam com o ano corrente no Excel (ou viram texto "06/02/"): o ano é refeito
 *   pelo intervalo escrito no título do bloco;
 * - a coluna "Período" (1/2, 2/3...) foi convertida em data pelo Excel: dia = parcela, mês = total;
 * - "Pronto Sv" tem erros de digitação: a apresentação é recalculada (término + deslocamento + 1 dia).
 */
import { type XlsxCell, type XlsxSheet, cellText, excelSerialToParts } from '../lib/xlsx';
import type { VacationPeriod } from '../types';
import type { UnitPerson } from './unit';
import { type VacationInput, presentationDate } from './vacation';

export interface ImportRow {
  key: string;
  sheet: string;
  row: number;
  block: string;
  rankText: string;
  nameText: string;
  personId: number | null;
  match: 'exato' | 'aproximado' | 'manual' | 'nenhum';
  start: string | null;
  end: string | null;
  travel: boolean;
  periodNumber: number | null;
  periodTotal: number | null;
  /** Apresentação e dias como estavam na planilha (só para comparar). */
  sheetPresentation: string | null;
  sheetDays: number | null;
  notes: string;
  include: boolean;
}

export interface RowCheck {
  record: VacationInput | null;
  days: number | null;
  presentation: string | null;
  periodNumber: number | null;
  periodTotal: number | null;
  periodInferred: boolean;
  split: string;
  errors: string[];
  warnings: string[];
  duplicate: boolean;
}

// ---------- datas ----------

const MONTHS: Record<string, number> = { JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, MAIO: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12 };
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const toTime = (s: string) => Date.parse(`${s}T12:00:00Z`);
const daysBetween = (a: string, b: string) => Math.round((toTime(b) - toTime(a)) / 86_400_000);
const validDate = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

interface Range {
  start: string;
  end: string;
}

/** "1º PERÍODO – 4 JAN 27 À 2 FEV 27 (...)" → { start: 2027-01-04, end: 2027-02-02 }. */
export function blockRange(title: string): Range | null {
  const found = [...title.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').matchAll(/(\d{1,2})\s*[º°O]?\s+(JAN|FEV|MAR|ABR|MAIO|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[A-Z]*\.?\s+(\d{4}|\d{2})\b/g)];
  if (found.length < 2) return null;
  const parse = (m: RegExpMatchArray) => {
    const y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    return iso(y, MONTHS[m[2]], Number(m[1]));
  };
  return { start: parse(found[0]), end: parse(found[1]) };
}

interface DayMonth {
  day: number;
  month: number;
  year: number | null;
}

/** Dia e mês de uma célula (data do Excel ou texto "dd/mm", "dd/mm/", "dd/mm/aa", "dd/mm/aaaa"). */
export function dayMonth(cell?: XlsxCell): DayMonth | null {
  if (!cell) return null;
  if (typeof cell.value === 'number' && cell.isDate) {
    const p = excelSerialToParts(cell.value);
    return { day: p.day, month: p.month, year: p.year };
  }
  const m = String(cell.value).trim().match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*(?:[/.-]\s*(\d{2}|\d{4})?)?$/);
  if (!m) return null;
  const year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : null;
  return { day: Number(m[1]), month: Number(m[2]), year };
}

/**
 * Escolhe o ano mais coerente: perto do bloco e, se houver `after`, logo depois dessa data
 * (com `near`, simplesmente a data mais próxima de `after`, antes ou depois).
 */
function placeYear(dm: DayMonth | null, range: Range | null, after?: string | null, near = false): string | null {
  if (!dm) return null;
  const base = after ? Number(after.slice(0, 4)) : range ? Number(range.start.slice(0, 4)) : dm.year;
  if (!base) return null;
  const candidates = [base - 1, base, base + 1].filter((y) => validDate(y, dm.month, dm.day)).map((y) => iso(y, dm.month, dm.day));
  if (!candidates.length) return null;
  const cost = (c: string) => {
    if (after) {
      const diff = daysBetween(after, c);
      if (near) return Math.abs(diff);
      return diff < 0 ? 10_000 - diff : diff;
    }
    if (!range) return Math.abs(Number(c.slice(0, 4)) - (dm.year ?? base));
    if (c < range.start) return daysBetween(c, range.start);
    if (c > range.end) return daysBetween(range.end, c);
    return 0;
  };
  return candidates.sort((a, b) => cost(a) - cost(b))[0];
}

// ---------- leitura da planilha ----------

export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

type Column = 'rank' | 'name' | 'start' | 'end' | 'days' | 'travel' | 'presentation' | 'period' | 'notes';
const HEADER_TESTS: [Column, RegExp][] = [
  ['name', /^NOME/],
  ['rank', /^(POSTO|GRAD|P G|POSTO GRAD)/],
  ['start', /^INICIO/],
  ['end', /^TERMINO/],
  ['days', /^DIAS$/],
  ['travel', /DESL/],
  ['presentation', /PRONTO|APRESENT/],
  ['period', /^PERIODO$/],
  ['notes', /^OBS/],
];

export interface ParsedPlan {
  rows: ImportRow[];
  /** Ano do título ("PLANO DE FÉRIAS ... - 2026"): é a referência sugerida. */
  titleYear: number | null;
}

export function parsePlan(sheets: XlsxSheet[]): ParsedPlan {
  const rows: ImportRow[] = [];
  let titleYear: number | null = null;
  for (const sheet of sheets) {
    let columns: Partial<Record<Column, number>> | null = null;
    let range: Range | null = null;
    let block = '';
    for (const rowNumber of [...sheet.rows.keys()].sort((a, b) => a - b)) {
      const cells = sheet.rows.get(rowNumber)!;
      const texts = [...cells.entries()].map(([col, c]) => [col, cellText(c)] as const).filter(([, t]) => t);
      const joined = texts.map(([, t]) => t).join(' ');
      const plan = joined.match(/PLANO DE F[ÉE]RIAS.*?(\d{4})/i);
      if (plan) {
        titleYear ??= Number(plan[1]);
        continue;
      }
      const isBlock = /PER[IÍ]ODO\s*[–-]/i.test(joined) && blockRange(joined);
      if (isBlock) {
        range = blockRange(joined);
        block = texts.find(([, t]) => /PER[IÍ]ODO/i.test(t))?.[1] ?? joined;
        columns = null;
        continue;
      }
      const header = texts.find(([, t]) => /^NOME/.test(norm(t)));
      if (header) {
        columns = {};
        for (const [col, t] of texts) {
          const n = norm(t);
          const hit = HEADER_TESTS.find(([, re]) => re.test(n));
          if (hit && columns[hit[0]] === undefined) columns[hit[0]] = col;
        }
        continue;
      }
      if (!columns?.name || !columns.start) continue;
      const cell = (c: Column) => (columns![c] ? cells.get(columns![c]!) : undefined);
      const nameText = cellText(cell('name'));
      if (!nameText || norm(nameText).length < 5) continue;
      const start = placeYear(dayMonth(cell('start')), range);
      const end = placeYear(dayMonth(cell('end')), range, start);
      const travelText = cellText(cell('travel'));
      const notes = cellText(cell('notes'));
      const periodCell = cell('period');
      let periodNumber: number | null = null;
      let periodTotal: number | null = null;
      if (periodCell) {
        const dm = typeof periodCell.value === 'number' && periodCell.isDate ? excelSerialToParts(periodCell.value) : null;
        const pair = dm ? [dm.day, dm.month] : (String(periodCell.value).match(/(\d)\s*\/\s*(\d)/)?.slice(1).map(Number) ?? null);
        if (pair && pair[1] >= 1 && pair[1] <= 3 && pair[0] >= 1 && pair[0] <= pair[1]) [periodNumber, periodTotal] = pair;
      }
      const daysCell = cell('days');
      rows.push({
        key: `${sheet.name}!${rowNumber}`,
        sheet: sheet.name,
        row: rowNumber,
        block,
        rankText: cellText(cell('rank')),
        nameText,
        personId: null,
        match: 'nenhum',
        start,
        end,
        travel: /\d/.test(travelText) && !/SEM DESL/.test(norm(notes)),
        periodNumber,
        periodTotal,
        sheetPresentation: placeYear(dayMonth(cell('presentation')), range, end, true),
        sheetDays: daysCell && typeof daysCell.value === 'number' ? daysCell.value : null,
        notes: notes === '-' ? '' : notes,
        include: true,
      });
    }
  }
  return { rows, titleYear };
}

// ---------- vínculo com o efetivo ----------

/** Liga cada linha a um militar do efetivo pelo nome completo (exato ou quase igual). */
export function matchPeople(rows: ImportRow[], roster: UnitPerson[]): ImportRow[] {
  const people = roster.map((p) => ({ id: p.id, key: norm(p.full_name), tokens: new Set(norm(p.full_name).split(' ').filter((t) => t.length > 1)) }));
  return rows.map((row) => {
    if (row.match === 'manual') return row;
    const key = norm(row.nameText);
    const exact = people.find((p) => p.key === key);
    if (exact) return { ...row, personId: exact.id, match: 'exato' };
    const tokens = new Set(key.split(' ').filter((t) => t.length > 1));
    const scored = people
      .map((p) => {
        const inter = [...tokens].filter((t) => p.tokens.has(t)).length;
        const union = new Set([...tokens, ...p.tokens]).size;
        let score = union ? inter / union : 0;
        // Nome abreviado (um contém o outro), ex.: sem um sobrenome do meio.
        if (inter >= 2 && (inter === tokens.size || inter === p.tokens.size)) score = Math.max(score, 0.85);
        return { id: p.id, score };
      })
      .sort((a, b) => b.score - a.score);
    const [best, second] = scored;
    if (best && best.score >= 0.75 && (!second || best.score - second.score >= 0.1)) return { ...row, personId: best.id, match: 'aproximado' };
    return { ...row, personId: null, match: 'nenhum' };
  });
}

// ---------- conferência ----------

const SPLIT_PARTS: Record<string, number[]> = { '30': [30], '15+15': [15, 15], '20+10': [20, 10], '10+10+10': [10, 10, 10] };

/**
 * Confere as linhas incluídas com as mesmas regras do SIGASE (30 dias por REF, deslocamento uma vez,
 * divisões válidas) somando o que já está lançado. Deduz parcela/total que faltarem na planilha.
 */
export function checkRows(rows: ImportRow[], existing: VacationPeriod[], ref: number): Map<string, RowCheck> {
  const result = new Map<string, RowCheck>();
  const included = rows.filter((r) => r.include);

  // Parcelas por militar: completa número/total que faltarem, em ordem de data.
  const byPerson = new Map<number, ImportRow[]>();
  for (const r of included) if (r.personId) byPerson.set(r.personId, [...(byPerson.get(r.personId) ?? []), r]);
  const inferred = new Map<string, { number: number | null; total: number | null; inferred: boolean; split: string }>();
  for (const [personId, list] of byPerson) {
    const own = [...list].sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
    const saved = existing.filter((p) => p.person_id === personId && Number(p.reference_year) === ref && p.entry_type !== 'desconto');
    const totals = [...own.map((r) => r.periodTotal), ...saved.map((p) => p.period_total)].filter(Boolean) as number[];
    const total = totals.length ? totals.sort((a, b) => totals.filter((x) => x === b).length - totals.filter((x) => x === a).length)[0] : Math.min(3, own.length + saved.length) || 1;
    const used = new Set([...own.map((r) => (r.periodTotal === total ? r.periodNumber : null)), ...saved.map((p) => p.period_number)].filter(Boolean));
    const free = [1, 2, 3].filter((n) => n <= total && !used.has(n));
    const allDays = [...own.map((r) => (r.start && r.end ? daysBetween(r.start, r.end) + 1 : 0)), ...saved.map((p) => p.vacation_days)];
    const split = saved.find((p) => p.split_plan)?.split_plan || (total === 1 ? '30' : total === 3 ? '10+10+10' : allDays.some((d) => d === 20 || d === 10) ? '20+10' : '15+15');
    for (const r of own) {
      if (r.periodNumber && r.periodTotal === total) inferred.set(r.key, { number: r.periodNumber, total, inferred: false, split });
      else inferred.set(r.key, { number: free.shift() ?? null, total, inferred: true, split });
    }
  }

  // Totais por militar (lançados + lote) para as regras da REF.
  const travelUsed = new Map<number, string>();
  const daysUsed = new Map<number, number>();
  for (const p of existing.filter((p) => Number(p.reference_year) === ref)) {
    if (p.travel_days) travelUsed.set(p.person_id, `já lançado (início ${p.start_date.split('-').reverse().join('/')})`);
    daysUsed.set(p.person_id, (daysUsed.get(p.person_id) ?? 0) + p.vacation_days);
  }
  const seenStarts = new Set<string>();

  for (const r of [...rows].sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const days = r.start && r.end ? daysBetween(r.start, r.end) + 1 : null;
    const presentation = r.end ? presentationDate(r.end, r.travel) : null;
    const info = inferred.get(r.key);
    const duplicate = !!r.personId && !!r.start && existing.some((p) => p.person_id === r.personId && p.start_date === r.start && p.entry_type !== 'desconto');
    if (!r.include) {
      result.set(r.key, { record: null, days, presentation, periodNumber: r.periodNumber, periodTotal: r.periodTotal, periodInferred: false, split: '', errors, warnings, duplicate });
      continue;
    }
    if (!r.personId) errors.push('Militar não encontrado no efetivo: escolha quem é.');
    if (!r.start || !r.end) errors.push('Datas de início/término ilegíveis na planilha.');
    else if (days! < 1) errors.push('O término é anterior ao início.');
    else if (days! > 30) errors.push(`${days} dias: um lançamento não pode passar de 30.`);
    if (duplicate) errors.push('Já existe um lançamento deste militar com esse início.');
    if (r.personId && r.start) {
      const k = `${r.personId}|${r.start}`;
      if (seenStarts.has(k)) errors.push('Linha repetida na planilha (mesmo militar e início).');
      seenStarts.add(k);
    }
    const number = info?.number ?? r.periodNumber;
    const total = info?.total ?? r.periodTotal;
    if (!number || !total) errors.push('Parcela não identificada.');
    if (info?.inferred && number) warnings.push(`Parcela ${number}/${total} deduzida (em branco ou diferente na planilha).`);
    if (r.personId && days && days > 0 && !errors.length) {
      if (r.travel) {
        const used = travelUsed.get(r.personId);
        if (used) errors.push(`Deslocamento já usado na REF ${ref}: ${used}.`);
        else travelUsed.set(r.personId, `outra linha da planilha (início ${r.start!.split('-').reverse().join('/')})`);
      }
      const sum = (daysUsed.get(r.personId) ?? 0) + days;
      if (sum > 30) errors.push(`Passaria de 30 dias na REF ${ref} (${sum} dias).`);
      daysUsed.set(r.personId, sum);
      const parts = SPLIT_PARTS[info?.split ?? ''] ?? [];
      if (parts.length && !parts.includes(days)) warnings.push(`${days} dias não combina com a divisão ${info?.split} (parcela de ${[...new Set(parts)].join(' ou ')} dias). Confira as datas.`);
    }
    if (presentation && r.sheetPresentation && presentation !== r.sheetPresentation) warnings.push(`Apresentação na planilha (${r.sheetPresentation.split('-').reverse().join('/')}) corrigida para ${presentation.split('-').reverse().join('/')}.`);
    if (days && r.sheetDays && r.sheetDays !== days) warnings.push(`A planilha diz ${r.sheetDays} dias, mas as datas dão ${days}.`);
    const record: VacationInput | null =
      !errors.length && r.personId && r.start && r.end && number && total
        ? { person_id: r.personId, start_date: r.start, end_date: r.end, travel_days: r.travel, period_number: number, period_total: total, reference_year: ref, entry_type: 'periodo', split_plan: info?.split ?? '' }
        : null;
    result.set(r.key, { record, days, presentation, periodNumber: number, periodTotal: total, periodInferred: !!info?.inferred, split: info?.split ?? '', errors, warnings, duplicate });
  }
  return result;
}

/** Já lançados não entram por padrão (reimportar a mesma planilha não duplica nada). */
export function initialInclude(rows: ImportRow[], existing: VacationPeriod[]): ImportRow[] {
  return rows.map((r) => ({ ...r, include: !(r.personId && r.start && existing.some((p) => p.person_id === r.personId && p.start_date === r.start)) }));
}
