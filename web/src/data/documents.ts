import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { Paper } from '../lib/print';
import { adiantamentoStyles, aditamentoPrintStyles, fatdPrintStyles, framedPrintStyles, printStyles, printTitleOverrides, prorrogacaoStyles, renderDocumentMarkup } from '../print/legacy';

export type DocKind = 'aditamento' | 'pernoite' | 'fatd' | 'prorrogacao' | 'adiantamento13';

export interface DocumentRecord {
  id: number;
  kind: DocKind;
  bulletin_number: string;
  document_date: string;
  /** Versão salva no banco; o editor a devolve ao salvar para o servidor detectar conflitos. */
  updated_at?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

export const isRequirement = (kind: DocKind) => kind === 'prorrogacao' || kind === 'adiantamento13';

export const KIND_INFO: Record<DocKind, { title: string; short: string; subtitle: string; label: string; symbol: string }> = {
  aditamento: { title: 'Aditamentos', short: 'Aditamento', subtitle: 'Registro para cada dia de expediente.', label: 'aditamento', symbol: 'A' },
  pernoite: { title: 'Pernoites', short: 'Pernoite', subtitle: 'Registro do recolher para todos os dias.', label: 'pernoite', symbol: 'P' },
  fatd: { title: 'FATD', short: 'FATD', subtitle: 'Formulários de apuração de transgressão disciplinar.', label: 'FATD', symbol: 'F' },
  prorrogacao: { title: 'Prorrogação de tempo de serviço', short: 'Prorrogação', subtitle: 'Requerimento e informação em três páginas.', label: 'requerimento', symbol: 'R' },
  adiantamento13: { title: 'Adiantamento de 13º salário', short: 'Adiantamento 13º', subtitle: 'Requerimento de adiantamento da primeira parcela do décimo terceiro salário.', label: 'requerimento', symbol: '13' },
};

/** Próximo número sequencial a partir dos documentos salvos (mesma regra da versão atual). */
export const nextNumber = (docs: DocumentRecord[], pattern = /\d+/) =>
  docs.reduce((max, d) => Math.max(max, Number(String(d.bulletin_number || '').match(pattern)?.[1] ?? String(d.bulletin_number || '').match(pattern)?.[0] ?? 0)), 0) + 1;

export function documentRef(d: DocumentRecord, longDateFn: (v: string, weekday?: boolean) => string) {
  const who = d.data?.profile?.war_name || d.data?.profile?.full_name || 'Militar';
  if (d.kind === 'fatd') return `Processo ${d.bulletin_number}`;
  if (d.kind === 'prorrogacao') return `Info nº ${d.bulletin_number} · ${who}`;
  if (d.kind === 'adiantamento13') return `Requerimento EB ${d.bulletin_number} · ${who}`;
  if (d.kind === 'pernoite') return `Revista do recolher · ${longDateFn(d.data?.serviceDate || d.document_date, false)}`;
  return `Boletim Nr ${d.bulletin_number}`;
}

/** Categoria do arquivo de requerimentos pelo posto/graduação. */
export function requirementCategory(doc: DocumentRecord) {
  const value = String(doc.data?.profile?.rank || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (/\b(?:SD EV|SOLDADO EV)\b/.test(value)) return 'Soldados EV';
  if (/\b(?:SD EP|SOLDADO EP)\b/.test(value)) return 'Soldados EP';
  if (/\b(?:CB EP|CABO EP)\b/.test(value)) return 'Cabos EP';
  if (/\b(?:STEN|SUBTENENTE|1[º°O]? SGT|2[º°O]? SGT|1 SARGENTO|2 SARGENTO)\b/.test(value)) return 'Sargentos Carreira';
  if (/\b(?:3[º°O]? SGT|3 SARGENTO)\b/.test(value)) return 'Sargentos Temporários';
  return 'Outros postos/graduações';
}
export const REQUIREMENT_CATEGORIES = ['Sargentos Carreira', 'Sargentos Temporários', 'Cabos EP', 'Soldados EP', 'Soldados EV', 'Outros postos/graduações'];

/** HTML + CSS do documento, idênticos à versão atual. */
export function documentPaper(doc: DocumentRecord): Paper {
  const markup = renderDocumentMarkup(doc);
  const req = isRequirement(doc.kind);
  const css = `${printStyles}${printTitleOverrides}${req ? prorrogacaoStyles : ''}${doc.kind === 'adiantamento13' ? adiantamentoStyles : ''}${doc.kind === 'aditamento' ? aditamentoPrintStyles : ''}${doc.kind === 'aditamento' || doc.kind === 'pernoite' ? framedPrintStyles : ''}${doc.kind === 'fatd' ? fatdPrintStyles : ''}html,body{margin:0;padding:0;background:#fff}`;
  return {
    body: markup,
    css,
    // Na prévia, a versão atual usa .document-preview-wrap (folha branca com sombra).
    previewBody: `<div class="document-preview-wrap">${markup}</div>`,
    previewCss: `${req ? '' : prorrogacaoStyles}${adiantamentoStyles}.document-preview-wrap{max-height:none;overflow:visible;padding:0;background:transparent}.document-preview-wrap .paper{margin:0 auto 18px}`,
  };
}

// ---------- API ----------

export function useDocuments(kind: DocKind) {
  return useQuery({
    queryKey: ['documents', kind],
    queryFn: async () => (await api<{ documents: DocumentRecord[] }>(`/api/documents?kind=${kind}`)).documents,
  });
}

export interface DocumentInput {
  id?: number;
  kind: DocKind;
  bulletin_number: string;
  document_date: string;
  data: unknown;
}
