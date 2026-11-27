/**
 * Importação dos dados da bateria (efetivo) a partir da planilha .xlsx.
 *
 * Cada aba tem seu próprio cabeçalho (EFETIVO PROFISSIONAL, EFETIVO VARIÁVEL...). As colunas são achadas
 * pelo nome; colunas que o SIGASE não tem (RA, banco, agência, título...) são ignoradas.
 *
 * Cuidados com os dados reais:
 * - o Excel transformou CPF, Prec-CP, telefone e CEP em número e perdeu os zeros à esquerda;
 * - "Filiação" vem como "Pai: ... Mãe: ..." ou só "Fulano e Beltrana" (sem dizer quem é quem);
 * - posto escrito de vários jeitos ("1ºTEN", "ST", "ASP OF");
 * - para quem já está no SIGASE, nada é sobrescrito sem a pessoa marcar: campos vazios são preenchidos,
 *   valores diferentes ficam como estão até alguém escolher trocar.
 */
import { type XlsxCell, type XlsxSheet, cellText, excelSerialToParts } from '../lib/xlsx';
import { BLOOD_TYPES, CNH_OPTIONS, EDUCATION, UNIT_RANKS, type UnitPerson, type UnitPersonInput } from './unit';
import { norm } from './vacationImport';

/** Campos que a planilha pode preencher (além de nome, nome de guerra e posto). */
export const IMPORT_FIELDS = [
  ['military_number', 'Número'],
  ['military_id', 'IDT militar'],
  ['civil_id', 'IDT civil'],
  ['cpf', 'CPF'],
  ['birth_date', 'Nascimento'],
  ['prec_cp', 'Prec-CP'],
  ['qm', 'QM'],
  ['blood_type', 'Tipo sanguíneo'],
  ['email', 'E-mail'],
  ['religion', 'Religião'],
  ['address', 'Endereço'],
  ['phone', 'Telefone'],
  ['birth_city', 'Cidade natal'],
  ['father_name', 'Pai'],
  ['mother_name', 'Mãe'],
  ['cnh', 'CNH'],
  ['education', 'Escolaridade'],
  ['additional_data', 'Observações'],
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number][0];
/** Campos de identificação, comparados como os outros quando o militar já existe. */
export type CompareField = ImportField | 'full_name' | 'war_name' | 'rank';
export const FIELD_LABEL: Record<CompareField, string> = { ...Object.fromEntries(IMPORT_FIELDS), full_name: 'Nome completo', war_name: 'Nome de guerra', rank: 'Posto/graduação' } as Record<CompareField, string>;

export interface PersonRow {
  key: string;
  sheet: string;
  row: number;
  include: boolean;
  fullName: string;
  rankText: string;
  /** Posto já no padrão do SIGASE (null se não deu para reconhecer). */
  rank: string | null;
  warName: string;
  warNameSuggested: boolean;
  values: Partial<Record<ImportField, string>>;
  /** Avisos da leitura (CPF inválido, filiação sem dizer quem é quem...). */
  notes: string[];
  /** Cadastro do SIGASE que será atualizado (null = novo cadastro). */
  targetId: number | null;
  match: 'cpf' | 'idt' | 'nome' | 'aproximado' | 'manual' | 'novo';
  /** Campos diferentes que a pessoa escolheu trocar pelo valor da planilha. */
  replace: Partial<Record<CompareField, boolean>>;
}

// ---------- limpeza dos valores ----------

const EMPTY = /^(-+|—|N\/?A|NAO POSSUI|NAO INFORMADO|NAO DECLARADO|NIL|0)$/;
const clean = (cell?: XlsxCell) => {
  const t = cellText(cell);
  // "-", "—", "N/A", "Não possui"... e células só com pontuação contam como vazias.
  return !t || !norm(t) || EMPTY.test(norm(t)) ? '' : t;
};
/** Dígitos de uma célula (números gravados como número perdem a formatação e os zeros à esquerda). */
const digitsOf = (cell?: XlsxCell) => {
  if (!cell) return '';
  if (typeof cell.value === 'number') return String(Math.round(cell.value));
  return clean(cell).replace(/\D+/g, '');
};

export function cpfValid(digits: string) {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const dv = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(digits[9]) && dv(10) === Number(digits[10]);
}
const formatCpf = (d: string) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;

function formatPhone(cell?: XlsxCell) {
  let d = digitsOf(cell);
  if (!d) return '';
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 9) return `${d.slice(0, 5)}-${d.slice(5)}`;
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return clean(cell);
}

const RANK_ALIASES: Record<string, string> = {
  CAP: 'Cap', CAPITAO: 'Cap',
  '1TEN': '1º Ten', '1OTEN': '1º Ten', '1TENENTE': '1º Ten', '1OTENENTE': '1º Ten', TENENTE: '1º Ten',
  '2TEN': '2º Ten', '2OTEN': '2º Ten', '2TENENTE': '2º Ten', '2OTENENTE': '2º Ten',
  ST: 'STen', STEN: 'STen', SUBTEN: 'STen', SUBTENENTE: 'STen',
  '1SGT': '1º Sgt', '1OSGT': '1º Sgt', '1SARGENTO': '1º Sgt',
  '2SGT': '2º Sgt', '2OSGT': '2º Sgt', '2SARGENTO': '2º Sgt',
  '3SGT': '3º Sgt', '3OSGT': '3º Sgt', '3SARGENTO': '3º Sgt',
  CBEP: 'Cb EP', CABOEP: 'Cb EP', CB: 'Cb EP', CABO: 'Cb EP',
  SDEP: 'Sd EP', SOLDADOEP: 'Sd EP', SD: 'Sd EP', SOLDADO: 'Sd EP',
  SDEV: 'Sd EV', SOLDADOEV: 'Sd EV', RECRUTA: 'Sd EV',
};
/** "1ºTEN", "3º SGT ", "ST" → posto do SIGASE. Aspirante não existe na lista: vira 2º Ten com aviso. */
export function parseRank(text: string): { rank: string | null; note?: string } {
  const key = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[º°ª]/g, '').replace(/[^A-Z0-9]/g, '');
  if (!key) return { rank: null };
  if (/^ASP/.test(key)) return { rank: '2º Ten', note: `"${text}" não existe na lista do SIGASE: ficou como 2º Ten. Confira.` };
  return { rank: RANK_ALIASES[key] ?? null };
}
const looksLikeRank = (text: string) => !!parseRank(text).rank || /^ASP/i.test(text.trim());

const RELIGION_MAP: [RegExp, string][] = [
  [/CATOLIC/, 'Católico'],
  [/EVANGEL|PROTESTANT|CRISTA/, 'Evangélico'],
  [/ESPIRIT/, 'Espírita'],
  [/UMBAND/, 'Umbandista'],
  [/ATEU|AGNOST|NENHUMA|SEM RELIGIAO|NAO TEM/, 'Sem Religião'],
];
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());

function mapEducation(text: string) {
  const n = norm(text);
  if (!n) return '';
  const level = /SUPERIOR|GRADUA|FACULDADE|UNIVERSIT/.test(n) ? 'superior' : /MEDIO|2 GRAU/.test(n) ? 'médio' : /FUNDAMENTAL|1 GRAU/.test(n) ? 'fundamental' : '';
  if (!level) return titleCase(text);
  const done = /INCOMPLETO|CURSANDO|TRANCADO|ANDAMENTO/.test(n) ? 'incompleto' : 'completo';
  return EDUCATION.find((e) => e === `Ensino ${level} ${done}`) ?? titleCase(text);
}

function mapCnh(text: string, notes: string[]) {
  const n = norm(text).replace(/\s+/g, '');
  if (!n) return '';
  if (/^(NAO|N|SEM|NAOPOSSUI|NENHUMA)$/.test(n)) return 'Sem CNH';
  if (/TIRANDO|ANDAMENTO|PROCESSO/.test(n)) {
    notes.push(`CNH na planilha: "${text}" (em andamento) → Sem CNH.`);
    return 'Sem CNH';
  }
  return CNH_OPTIONS.find((o) => o.replace(/\s+/g, '').toUpperCase() === n) ?? text.toUpperCase();
}

function mapBlood(text: string, notes: string[]) {
  const t = text.toUpperCase().replace(/\s+/g, '').replace(/[-–−]/, '−').replace('POS', '+').replace('NEG', '−');
  if (!t) return '';
  const found = BLOOD_TYPES.find((b) => b === t);
  if (!found) notes.push(`Tipo sanguíneo ilegível: "${text}".`);
  return found ?? '';
}

/** "Pai: X Mãe: Y" → pai/mãe. Sem indicação de quem é quem, vai para as observações. */
function splitParents(text: string, notes: string[]): { father?: string; mother?: string; extra?: string } {
  if (!text) return {};
  const t = text.replace(/\s+/g, ' ').trim();
  const strip = (s?: string) => {
    const v = (s ?? '').replace(/^[\s:,-]+|[\s,.-]+$/g, '').replace(/\s+e$/i, '').trim();
    return EMPTY.test(norm(v)) ? '' : v;
  };
  let m = t.match(/pai\s*:?\s*(.*?)\s*(?:,|;|\be\b)?\s*m[ãa]e\s*:?\s*(.*)$/i);
  if (m) return { father: strip(m[1]), mother: strip(m[2]) };
  m = t.match(/m[ãa]e\s*:?\s*(.*?)\s*(?:,|;|\be\b)?\s*pai\s*:?\s*(.*)$/i);
  if (m) return { mother: strip(m[1]), father: strip(m[2]) };
  notes.push('Filiação sem indicar pai e mãe: o texto foi para Observações.');
  return { extra: `Filiação (planilha): ${t}` };
}

// ---------- leitura das abas ----------

type Column = 'fullName' | 'warName' | 'rank' | 'number' | 'militaryId' | 'civilId' | 'cpf' | 'birth' | 'prec' | 'qm' | 'blood' | 'email' | 'religion' | 'address' | 'cep' | 'phone' | 'city' | 'filiation' | 'father' | 'mother' | 'cnh' | 'education';
const HEADER_TESTS: [Column, RegExp][] = [
  ['warName', /^NOME (DE )?GUERRA$/],
  ['fullName', /^NOME( COMPLETO)?$/],
  ['rank', /^(P ?G(RAD)?|POSTO( GRAD(UACAO)?)?|GRAD(UACAO)?|F)$/],
  ['number', /^(N|NR|NUM|NUMERO)$/],
  ['militaryId', /^IDT( MILITAR)?$|IDT MILITAR|IDENTIDADE MILITAR/],
  ['civilId', /^(IDENTIDADE|RG|IDT CIVIL|IDENTIDADE CIVIL)$/],
  ['cpf', /^CPF$/],
  ['birth', /NASC/],
  ['prec', /^PREC/],
  ['qm', /^QM/],
  ['blood', /^(TS|TIPO SANG.*|FATOR RH)$/],
  ['email', /^E ?MAIL$/],
  ['religion', /^RELIGI/],
  ['address', /^ENDERECO$/],
  ['cep', /^CEP$/],
  ['phone', /^(TELEFONE|CELULAR|FONE|CONTATO)$/],
  ['city', /^(CIDADE( NATAL)?|NATURALIDADE)$/],
  ['filiation', /^FILIACAO$/],
  ['father', /^(NOME (DO )?PAI|PAI)$/],
  ['mother', /^(NOME (DA )?MAE|MAE)$/],
  ['cnh', /^CNH/],
  ['education', /^ESCOLARIDADE/],
];

export interface SheetSummary {
  name: string;
  rows: number;
  /** Abas com nome genérico ("Plan1", "Planilha1"...) costumam ser rascunho ou lista antiga. */
  suggested: boolean;
}

export interface ParsedPeople {
  rows: PersonRow[];
  sheets: SheetSummary[];
}

export function parsePeople(sheets: XlsxSheet[]): ParsedPeople {
  const rows: PersonRow[] = [];
  const summaries: SheetSummary[] = [];
  for (const sheet of sheets) {
    const rowNumbers = [...sheet.rows.keys()].sort((a, b) => a - b);
    const headerRow = rowNumbers.find((r) => [...sheet.rows.get(r)!.values()].some((c) => /^NOME/.test(norm(cellText(c)))));
    if (headerRow === undefined) continue;
    const columns: Partial<Record<Column, number>> = {};
    for (const [col, cell] of sheet.rows.get(headerRow)!) {
      const n = norm(cellText(cell));
      const hit = HEADER_TESTS.find(([, re]) => re.test(n));
      if (hit && columns[hit[0]] === undefined) columns[hit[0]] = col;
    }
    if (!columns.fullName) continue;
    // Sem coluna de posto: procura uma coluna cujos valores sejam postos; numa aba de recrutas, Sd EV.
    if (!columns.rank) {
      const counts = new Map<number, number>();
      for (const r of rowNumbers.filter((r) => r > headerRow).slice(0, 30)) for (const [col, cell] of sheet.rows.get(r)!) if (looksLikeRank(cellText(cell))) counts.set(col, (counts.get(col) ?? 0) + 1);
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (best && best[1] >= 3) columns.rank = best[0];
    }
    const defaultRank = !columns.rank && /VARIAVEL|RECRUT|\bEV\b/.test(norm(sheet.name)) ? 'Sd EV' : null;
    const before = rows.length;
    for (const r of rowNumbers.filter((r) => r > headerRow)) {
      const cells = sheet.rows.get(r)!;
      const cell = (c: Column) => (columns[c] ? cells.get(columns[c]!) : undefined);
      const fullName = cellText(cell('fullName'));
      if (!/\p{L}{2,}.*\s+\p{L}{2,}/u.test(fullName) || /^TOTAL\b/.test(norm(fullName))) continue;
      const notes: string[] = [];
      const rankText = cellText(cell('rank'));
      const parsedRank = rankText ? parseRank(rankText) : { rank: defaultRank };
      if (parsedRank.note) notes.push(parsedRank.note);
      if (rankText && !parsedRank.rank) notes.push(`Posto "${rankText}" não reconhecido.`);
      const values: Partial<Record<ImportField, string>> = {};

      const number = digitsOf(cell('number'));
      if (number && number !== '0') values.military_number = number;
      const militaryId = clean(cell('militaryId'));
      if (militaryId) values.military_id = typeof cell('militaryId')?.value === 'number' ? digitsOf(cell('militaryId')) : militaryId.replace(/\s+/g, '');
      const cpfDigits = digitsOf(cell('cpf'));
      if (cpfDigits) {
        if (cpfDigits.length >= 9 && cpfDigits.length <= 11) {
          const d = cpfDigits.padStart(11, '0');
          values.cpf = formatCpf(d);
          if (!cpfValid(d)) notes.push(`CPF ${formatCpf(d)} com dígito verificador inválido. Confira.`);
        } else notes.push(`CPF ilegível na planilha: "${cellText(cell('cpf'))}".`);
      }
      // Na carteira de identidade nova o número do RG é o próprio CPF: valor igual ao CPF é normal.
      const civil = cell('civilId');
      if (civil && clean(civil)) values.civil_id = typeof civil.value === 'number' ? digitsOf(civil) : clean(civil);
      const birth = cell('birth');
      if (birth) {
        let iso = '';
        if (typeof birth.value === 'number') {
          const p = excelSerialToParts(birth.value);
          iso = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
        } else {
          const m = clean(birth).match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
          if (m) iso = `${m[3].length === 2 ? (Number(m[3]) > 30 ? '19' : '20') + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
          else if (clean(birth)) notes.push(`Data de nascimento ilegível: "${clean(birth)}".`);
        }
        if (iso) {
          const age = (Date.now() - Date.parse(`${iso}T12:00:00`)) / (365.25 * 86_400_000);
          if (!(age >= 16 && age <= 70)) notes.push(`Nascimento ${iso.split('-').reverse().join('/')} parece errado (${Math.floor(age)} anos): não foi importado.`);
          else values.birth_date = iso;
        }
      }
      const prec = cell('prec');
      if (prec && clean(prec)) values.prec_cp = typeof prec.value === 'number' ? digitsOf(prec) : clean(prec);
      const qm = clean(cell('qm'));
      if (qm) values.qm = qm;
      const blood = mapBlood(clean(cell('blood')), notes);
      if (blood) values.blood_type = blood;
      const email = clean(cell('email')).toLowerCase();
      if (email) {
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) values.email = email;
        else notes.push(`E-mail inválido: "${email}".`);
      }
      const religion = clean(cell('religion'));
      if (religion) values.religion = RELIGION_MAP.find(([re]) => re.test(norm(religion)))?.[1] ?? titleCase(religion);
      const address = clean(cell('address'));
      const cep = digitsOf(cell('cep'));
      if (address) values.address = cep.length >= 7 && cep.length <= 8 && !/CEP/i.test(address) ? `${address.replace(/[\s,.]+$/, '')}, CEP ${cep.padStart(8, '0').replace(/(\d{5})(\d{3})/, '$1-$2')}` : address;
      const phone = formatPhone(cell('phone'));
      if (phone) values.phone = phone;
      const city = clean(cell('city'));
      if (city) values.birth_city = city;
      const parents = columns.filiation ? splitParents(clean(cell('filiation')), notes) : { father: clean(cell('father')), mother: clean(cell('mother')) };
      if (parents.father) values.father_name = parents.father;
      if (parents.mother) values.mother_name = parents.mother;
      if (parents.extra) values.additional_data = parents.extra;
      const cnh = mapCnh(clean(cell('cnh')), notes);
      if (cnh) values.cnh = cnh;
      const education = mapEducation(clean(cell('education')));
      if (education) values.education = education;

      const warText = clean(cell('warName'));
      const suggestion = fullName.split(/\s+/).filter((w) => !/^(DA|DE|DO|DAS|DOS|E|JUNIOR|JÚNIOR|NETO|FILHO|SOBRINHO)$/i.test(w)).slice(-1)[0] ?? '';
      rows.push({
        key: `${sheet.name}!${r}`,
        sheet: sheet.name,
        row: r,
        include: true,
        fullName: fullName.replace(/\s+/g, ' ').trim(),
        rankText,
        rank: parsedRank.rank,
        warName: titleCase(warText || suggestion),
        warNameSuggested: !warText,
        values,
        notes,
        targetId: null,
        match: 'novo',
        replace: {},
      });
    }
    if (rows.length > before) summaries.push({ name: sheet.name, rows: rows.length - before, suggested: !/^(PLAN|PLANILHA|SHEET|FOLHA)\s*\d*$/i.test(sheet.name.trim()) });
  }
  return { rows, sheets: summaries };
}

// ---------- vínculo com o efetivo ----------

const onlyDigits = (s?: string | null) => String(s ?? '').replace(/\D+/g, '');

/** Liga cada linha a um cadastro existente: CPF, depois identidade militar, depois nome. */
export function matchRoster(rows: PersonRow[], roster: UnitPerson[]): PersonRow[] {
  const people = roster.map((p) => ({ p, key: norm(p.full_name), tokens: new Set(norm(p.full_name).split(' ').filter((t) => t.length > 1)), cpf: onlyDigits(p.cpf), idt: onlyDigits(p.military_id) }));
  return rows.map((row) => {
    if (row.match === 'manual') return row;
    const cpf = onlyDigits(row.values.cpf);
    const idt = onlyDigits(row.values.military_id);
    const key = norm(row.fullName);
    const byCpf = cpf.length === 11 ? people.find((x) => x.cpf === cpf) : undefined;
    if (byCpf) return { ...row, targetId: byCpf.p.id, match: 'cpf' };
    const byIdt = idt.length >= 8 ? people.find((x) => x.idt === idt) : undefined;
    if (byIdt) return { ...row, targetId: byIdt.p.id, match: 'idt' };
    const exact = people.find((x) => x.key === key);
    if (exact) return { ...row, targetId: exact.p.id, match: 'nome' };
    const tokens = new Set(key.split(' ').filter((t) => t.length > 1));
    const scored = people
      .map((x) => {
        const inter = [...tokens].filter((t) => x.tokens.has(t)).length;
        const union = new Set([...tokens, ...x.tokens]).size;
        let score = union ? inter / union : 0;
        if (inter >= 2 && (inter === tokens.size || inter === x.tokens.size)) score = Math.max(score, 0.85);
        return { id: x.p.id, score };
      })
      .sort((a, b) => b.score - a.score);
    const [best, second] = scored;
    if (best && best.score >= 0.75 && (!second || best.score - second.score >= 0.1)) return { ...row, targetId: best.id, match: 'aproximado' };
    return { ...row, targetId: null, match: 'novo' };
  });
}

// ---------- comparação e conferência ----------

/** Valores equivalentes: iguais sem acento/caixa, mesmos dígitos (CPF, telefone) ou um é o começo do outro (QM "Artilharia" × "Artilharia - 5206"). */
function same(field: CompareField, a: string, b: string) {
  if (!a || !b) return a === b;
  if (['cpf', 'phone', 'prec_cp', 'military_id', 'civil_id', 'military_number'].includes(field)) {
    const da = onlyDigits(a);
    const db = onlyDigits(b);
    if (da && db) return da === db || (field === 'phone' && (da.endsWith(db) || db.endsWith(da)));
  }
  const na = norm(a);
  const nb = norm(b);
  return na === nb || (field === 'qm' && (na.startsWith(nb) || nb.startsWith(na)));
}

export interface FieldChange {
  field: CompareField;
  current: string;
  incoming: string;
  /** fill: campo vazio no SIGASE; diff: valores diferentes; append: observação acrescentada. */
  kind: 'fill' | 'diff' | 'append';
  applied: boolean;
}

export interface PersonCheck {
  record: (UnitPersonInput & { id?: number }) | null;
  changes: FieldChange[];
  errors: string[];
  warnings: string[];
  status: 'novo' | 'atualizar' | 'igual';
}

const LIMITS: Partial<Record<CompareField, number>> = { full_name: 120, war_name: 80, military_number: 20, qm: 40, address: 240, cpf: 20, military_id: 40, civil_id: 40, prec_cp: 40, blood_type: 10, email: 160, religion: 80, phone: 30, birth_city: 100, mother_name: 120, father_name: 120, cnh: 30, education: 100, additional_data: 1000 };

export function checkPeople(rows: PersonRow[], roster: UnitPerson[]): Map<string, PersonCheck> {
  const result = new Map<string, PersonCheck>();
  const byId = new Map(roster.map((p) => [p.id, p]));
  const seen = new Map<string, string>();
  for (const r of rows) {
    const errors: string[] = [];
    const warnings: string[] = [...r.notes];
    const target = r.targetId ? byId.get(r.targetId) : undefined;
    const changes: FieldChange[] = [];
    if (r.targetId && !target) errors.push('O cadastro escolhido não existe mais no efetivo.');

    let record: (UnitPersonInput & { id?: number }) | null = null;
    if (target) {
      const base: UnitPersonInput & { id?: number } = { ...target, id: target.id };
      delete (base as Partial<UnitPerson>).age;
      const incoming: Partial<Record<CompareField, string>> = { ...r.values, full_name: r.fullName, rank: r.rank ?? '' };
      if (!r.warNameSuggested) incoming.war_name = r.warName;
      for (const [field, value] of Object.entries(incoming) as [CompareField, string][]) {
        if (!value) continue;
        const current = String(base[field as keyof UnitPersonInput] ?? '');
        if (field === 'additional_data') {
          if (!norm(current).includes(norm(value))) {
            changes.push({ field, current, incoming: value, kind: 'append', applied: true });
            (base as Record<string, unknown>)[field] = current ? `${current}\n${value}` : value;
          }
          continue;
        }
        if (same(field, current, value)) continue;
        const kind = current ? 'diff' : 'fill';
        const applied = kind === 'fill' || !!r.replace[field];
        changes.push({ field, current, incoming: value, kind, applied });
        if (applied) (base as Record<string, unknown>)[field] = value;
      }
      record = base;
      if (r.match === 'aproximado') warnings.push(`Nome parecido com "${target.full_name}": confira se é a mesma pessoa.`);
    } else if (r.include) {
      if (!r.rank) errors.push('Escolha o posto/graduação.');
      if (!r.warName.trim()) errors.push('Informe o nome de guerra.');
      else if (r.warNameSuggested) warnings.push(`Nome de guerra sugerido ("${r.warName}"): confira.`);
      record = { full_name: r.fullName, war_name: r.warName.trim(), rank: r.rank ?? '', military_number: '', seniority_order: null, birth_date: '', qm: '', section: '', address: '', cpf: '', military_id: '', civil_id: '', prec_cp: '', blood_type: '', email: '', religion: '', phone: '', birth_city: '', mother_name: '', father_name: '', cnh: '', education: '', additional_data: '', ...r.values };
    }

    if (record) {
      // O servidor só aceita texto nos campos (nunca null).
      for (const field of [...Object.keys(LIMITS), 'rank', 'section', 'birth_date'] as (keyof UnitPersonInput)[]) (record as Record<string, unknown>)[field] = String((record as Record<string, unknown>)[field] ?? '');
    }
    if (r.include && record) {
      if (!UNIT_RANKS.some(([v]) => v === record!.rank)) errors.push('Posto/graduação fora da lista do SIGASE.');
      if (record.rank === 'Sd EV' && !String(record.military_number || '').trim()) errors.push('Soldado EV precisa do número.');
      for (const [field, max] of Object.entries(LIMITS) as [CompareField, number][]) {
        const v = String((record as Record<string, unknown>)[field] ?? '');
        if (v.length > max) errors.push(`${FIELD_LABEL[field]} passa de ${max} caracteres.`);
      }
      const cpf = String(record.cpf || '');
      if (cpf && cpf !== '000.000.000-00' && cpf.length !== 11 && cpf.length !== 14) errors.push('CPF fora do formato 000.000.000-00.');
      // A mesma pessoa duas vezes no lote (duas abas, ou duas linhas apontando para o mesmo cadastro).
      const dupKey = r.targetId ? `id:${r.targetId}` : onlyDigits(record.cpf).length === 11 ? `cpf:${onlyDigits(record.cpf)}` : `nome:${norm(r.fullName)}`;
      const other = seen.get(dupKey);
      if (other) errors.push(`Mesma pessoa da linha ${other}: deixe só uma marcada.`);
      else seen.set(dupKey, `${r.sheet} ${r.row}`);
    }
    const status = !target ? 'novo' : changes.some((c) => c.applied) ? 'atualizar' : 'igual';
    result.set(r.key, { record: r.include && !errors.length ? record : null, changes, errors: r.include ? errors : [], warnings, status });
  }
  return result;
}
