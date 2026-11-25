import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { fmtDate } from '../lib/format';
import { type Paper, escapeHtml as esc } from '../lib/print';
import { UNIT_RANKS } from './unit';

export interface ForceRow {
  person_id: number;
  rank: string;
  war_name: string;
  military_number?: string;
  seniority_order: number;
  observation: string;
  other_text: string;
}

export interface ForceMap {
  id: number;
  activity_date: string;
  data: { rows: ForceRow[] };
}

export const OBSERVATIONS = ['', 'Férias', 'Serviço', 'PO', 'Rancho', 'HT', 'Missão', 'Dispensa médica', 'Outros'];
const RANK_ORDER = UNIT_RANKS.map(([r]) => r);

/** Normaliza graduações escritas de formas diferentes ("3º Sargento" → "3º Sgt"), como na versão atual. */
export function canonicalRank(rank: string) {
  const key = String(rank || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[º°]/g, 'o').replace(/[^a-z0-9]/g, '');
  const aliases: Record<string, string> = {
    capitao: 'Cap', tenente: '1º Ten', '1oten': '1º Ten', '1otenente': '1º Ten', '2oten': '2º Ten', '2otenente': '2º Ten',
    subtenente: 'STen', subten: 'STen', sten: 'STen', '1osgt': '1º Sgt', '1osargento': '1º Sgt', '1sargento': '1º Sgt',
    '2osgt': '2º Sgt', '2osargento': '2º Sgt', '2sargento': '2º Sgt', '3osgt': '3º Sgt', '3osargento': '3º Sgt', '3sargento': '3º Sgt',
    cb: 'Cb EP', cabo: 'Cb EP', cbep: 'Cb EP', caboep: 'Cb EP', sd: 'Sd EP', soldado: 'Sd EP', sdep: 'Sd EP', soldadoep: 'Sd EP', sdev: 'Sd EV', soldadoev: 'Sd EV',
  };
  return aliases[key] || rank;
}

export function sortForceRows<T extends { rank: string; seniority_order?: number | null; war_name?: string }>(rows: T[]) {
  const idx = (r: string) => {
    const i = RANK_ORDER.indexOf(canonicalRank(r));
    return i < 0 ? RANK_ORDER.length : i;
  };
  return [...rows].sort(
    (a, b) => idx(a.rank) - idx(b.rank) || (Number(a.seniority_order) || 9999) - (Number(b.seniority_order) || 9999) || String(a.war_name || '').localeCompare(String(b.war_name || ''), 'pt-BR'),
  );
}

export const forceName = (p: Pick<ForceRow, 'rank' | 'war_name' | 'military_number'>) =>
  `${p.rank || ''}${p.rank === 'Sd EV' && p.military_number ? ` ${p.military_number}` : ''} ${p.war_name || ''}`.trim();

// ---------- impressão (mesmo HTML/CSS da versão atual) ----------

const PRINT_CSS = `@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}.force-map-paper{font-family:Arial,sans-serif;color:#111;width:100%;max-width:none;margin:0 auto}.force-map-paper header{text-align:center;margin:0 0 2mm}.force-map-paper h2{font:700 11pt Arial,sans-serif;margin:0 0 1mm}.force-map-paper header p{font:8pt Arial,sans-serif;margin:0}.force-map-columns{display:grid;grid-template-columns:1fr 1fr;gap:3mm;align-items:start}.force-map-table{width:100%;border-collapse:collapse;table-layout:fixed;font:7pt Arial,sans-serif;line-height:1.02}.force-map-table col:nth-child(1){width:8%}.force-map-table col:nth-child(2){width:63%}.force-map-table col:nth-child(3){width:29%}.force-map-table th,.force-map-table td{border:.35pt solid #222;padding:.65mm .8mm;vertical-align:middle}.force-map-table th{font-weight:700;text-align:left}.force-map-table td:first-child,.force-map-table th:first-child{text-align:center}.force-map-table tbody td{height:4.7mm}`;
const PREVIEW_CSS = `.force-map-paper{width:190mm;min-height:277mm;background:#fff;padding:6mm 7mm;margin:auto;box-shadow:0 2px 12px #0002}`;

function table(rows: ForceRow[], start: number) {
  const body = rows
    .map((p, i) => `<tr><td>${start + i + 1}</td><td>${esc(forceName(p))}</td><td>${p.observation === 'Outros' ? esc(p.other_text || 'Outros') : esc(p.observation || '')}</td></tr>`)
    .join('');
  return `<table class="force-map-table"><colgroup><col><col><col></colgroup><thead><tr><th>Ord</th><th>P/G · Nome de guerra</th><th>Obs</th></tr></thead><tbody>${body}</tbody></table>`;
}

export function forceMapPaper(map: Pick<ForceMap, 'activity_date' | 'data'>): Paper {
  const rows = sortForceRows(map.data.rows || []);
  const middle = Math.ceil(rows.length / 2);
  const body = `<article class="force-map-paper"><header><h2>Mapa da Força - 3ªBO</h2><p>Data da atividade: ${fmtDate(map.activity_date)}</p></header><div class="force-map-columns">${table(rows.slice(0, middle), 0)}${table(rows.slice(middle), middle)}</div></article>`;
  return { body, css: PRINT_CSS, previewCss: PREVIEW_CSS };
}

// ---------- API ----------

export function useForceMaps() {
  return useQuery({
    queryKey: ['force-maps'],
    queryFn: async () => (await api<{ maps: ForceMap[] }>('/api/force-maps')).maps,
  });
}

export function useSaveForceMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: number; activity_date: string; rows: ForceRow[] }) =>
      api(id ? `/api/force-maps/${id}` : '/api/force-maps', { method: id ? 'PUT' : 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['force-maps'] }),
  });
}
