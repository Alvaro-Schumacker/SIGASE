/**
 * Leitor mínimo de planilhas .xlsx no navegador, sem bibliotecas externas.
 *
 * Um .xlsx é um ZIP com arquivos XML. Aqui lemos o diretório do ZIP, descompactamos as entradas com o
 * DecompressionStream nativo do navegador e interpretamos as células (texto, número e datas).
 * O arquivo nunca sai do computador do usuário.
 */

export interface XlsxCell {
  /** Texto ou número, como gravado na planilha. */
  value: string | number;
  /** A célula usa formato de data (o número é a data serial do Excel). */
  isDate: boolean;
  /** Código do formato numérico (ex.: "d/m", "dd/mm/yy"). */
  format: string;
}

export interface XlsxSheet {
  name: string;
  /** Linhas (1-based) → colunas (1-based) → célula. */
  rows: Map<number, Map<number, XlsxCell>>;
}

const MAX_FILE = 10 * 1024 * 1024;
const MAX_ENTRY = 40 * 1024 * 1024;

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  offset: number;
}

function readZipDirectory(buf: ArrayBuffer): Map<string, ZipEntry> {
  const view = new DataView(buf);
  // Fim do diretório central: assinatura 0x06054b50, procurada de trás para frente.
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66_000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('O arquivo não é uma planilha .xlsx válida.');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Planilha corrompida.');
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(buf, p + 46, nameLen));
    entries.set(name, { name, method, compressedSize, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readEntry(buf: ArrayBuffer, entry: ZipEntry): Promise<string> {
  if (entry.size > MAX_ENTRY) throw new Error('A planilha é grande demais para importar.');
  const view = new DataView(buf);
  const local = entry.offset;
  if (view.getUint32(local, true) !== 0x04034b50) throw new Error('Planilha corrompida.');
  const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  const data = new Uint8Array(buf, start, entry.compressedSize);
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new Error('Formato de compactação não suportado.');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return await new Response(stream).text();
}

const xml = (text: string) => {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Planilha corrompida.');
  return doc;
};
const byTag = (node: Document | Element, tag: string) => Array.from(node.getElementsByTagName(tag));
const textOf = (node: Element) => byTag(node, 't').map((t) => t.textContent ?? '').join('');

/** "AB12" → coluna 28. */
const columnIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
};

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 50, 57]);
const BUILTIN_FORMATS: Record<number, string> = { 14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 22: 'dd/mm/yyyy hh:mm' };
/** Formato com dia/mês/ano (fora de trechos entre aspas e cores). */
const looksLikeDate = (code: string) => /[dmy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, ''));

export async function readXlsx(file: File): Promise<XlsxSheet[]> {
  if (file.size > MAX_FILE) throw new Error('A planilha passa de 10 MB.');
  const buf = await file.arrayBuffer();
  const zip = readZipDirectory(buf);
  const get = async (name: string) => {
    const entry = zip.get(name);
    return entry ? readEntry(buf, entry) : null;
  };

  const sharedXml = await get('xl/sharedStrings.xml');
  const shared = sharedXml ? byTag(xml(sharedXml), 'si').map(textOf) : [];

  // Formatos numéricos de cada estilo, para reconhecer datas.
  const stylesXml = await get('xl/styles.xml');
  const custom = new Map<number, string>();
  const xfFormats: number[] = [];
  if (stylesXml) {
    const styles = xml(stylesXml);
    for (const nf of byTag(styles, 'numFmt')) custom.set(Number(nf.getAttribute('numFmtId')), nf.getAttribute('formatCode') ?? '');
    const cellXfs = byTag(styles, 'cellXfs')[0];
    if (cellXfs) for (const xf of Array.from(cellXfs.children)) xfFormats.push(Number(xf.getAttribute('numFmtId') ?? 0));
  }

  const workbookXml = await get('xl/workbook.xml');
  const relsXml = await get('xl/_rels/workbook.xml.rels');
  if (!workbookXml || !relsXml) throw new Error('O arquivo não é uma planilha .xlsx válida.');
  const targets = new Map(byTag(xml(relsXml), 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target') ?? '']));

  const sheets: XlsxSheet[] = [];
  for (const sheet of byTag(xml(workbookXml), 'sheet')) {
    const rid = sheet.getAttribute('r:id') ?? sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const target = targets.get(rid);
    if (!target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const sheetXml = await get(path);
    if (!sheetXml) continue;
    const rows = new Map<number, Map<number, XlsxCell>>();
    for (const c of byTag(xml(sheetXml), 'c')) {
      const ref = c.getAttribute('r') ?? '';
      const row = Number(ref.replace(/\D+/g, ''));
      const col = columnIndex(ref);
      const type = c.getAttribute('t');
      const v = byTag(c, 'v')[0]?.textContent ?? null;
      let value: string | number | null = null;
      if (type === 's' && v !== null) value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(c);
      else if (type === 'str' || type === 'b' || type === 'e') value = v ?? '';
      else if (v !== null) value = Number(v);
      if (value === null || value === '') continue;
      const fmtId = xfFormats[Number(c.getAttribute('s') ?? 0)] ?? 0;
      const format = custom.get(fmtId) ?? BUILTIN_FORMATS[fmtId] ?? '';
      const isDate = typeof value === 'number' && (BUILTIN_DATE_FORMATS.has(fmtId) || (custom.has(fmtId) && looksLikeDate(format)));
      if (!rows.has(row)) rows.set(row, new Map());
      rows.get(row)!.set(col, { value, isDate, format });
    }
    sheets.push({ name: sheet.getAttribute('name') ?? `Aba ${sheets.length + 1}`, rows });
  }
  return sheets;
}

/** Data serial do Excel (sistema 1900) → { day, month, year }. */
export function excelSerialToParts(serial: number) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000);
  return { day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
}

/** Texto da célula, sem espaços repetidos. */
export const cellText = (cell?: XlsxCell) => (cell ? String(cell.value).replace(/\s+/g, ' ').trim() : '');
