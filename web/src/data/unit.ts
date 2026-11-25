import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export interface UnitPerson {
  id: number;
  full_name: string;
  war_name: string;
  rank: string;
  military_number: string;
  seniority_order: number | null;
  birth_date: string;
  age: number | null;
  qm: string;
  section: string;
  address: string;
  cpf: string;
  military_id: string;
  civil_id: string;
  prec_cp: string;
  blood_type: string;
  email: string;
  religion: string;
  phone: string;
  birth_city: string;
  mother_name: string;
  father_name: string;
  cnh: string;
  education: string;
  additional_data: string;
}

export type UnitPersonInput = Omit<UnitPerson, 'id' | 'age'>;

// Mesmas listas e regras da versão atual.
export const UNIT_RANKS: [string, string][] = [
  ['Cap', 'Capitão (Cap)'],
  ['1º Ten', '1º Tenente (1º Ten)'],
  ['2º Ten', '2º Tenente (2º Ten)'],
  ['STen', 'Subtenente (STen)'],
  ['1º Sgt', '1º Sargento (1º Sgt)'],
  ['2º Sgt', '2º Sargento (2º Sgt)'],
  ['3º Sgt', '3º Sargento (3º Sgt)'],
  ['Cb EP', 'Cabo EP (Cb EP)'],
  ['Sd EP', 'Soldado EP (Sd EP)'],
  ['Sd EV', 'Soldado EV (Sd EV)'],
];
export const BLOOD_TYPES = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'];
export const QM_OPTIONS: [string, string][] = [
  ['Artilharia - 8106', 'OF Art'], ['Artilharia - 5206', 'Sgt Art'], ['Artilharia - 0601', 'LF'], ['Artilharia - 0615', 'Topo'],
  ['Artilharia - 0604', 'CTiro'], ['Comunicações - 5211', 'Sgt Com'], ['Comunicações - 1174', 'Rop'], ['Material Bélico - 5209', 'Sgt MBel'],
  ['Material Bélico - 0951', 'Mec Auto'], ['Material Bélico - 0945', 'Arm Leve'], ['Intendência - 1055', 'Motorista'], ['Intendência - 1061', 'Cozinheiro'],
];
export const RELIGIONS = ['Católico', 'Evangélico', 'Umbandista', 'Espírita', 'Sem Religião'];
export const CNH_OPTIONS = ['A', 'B', 'AB', 'C', 'AC', 'D', 'AD', 'E', 'AE', 'Sem CNH'];
export const EDUCATION = ['Ensino fundamental incompleto', 'Ensino fundamental completo', 'Ensino médio incompleto', 'Ensino médio completo', 'Ensino superior incompleto', 'Ensino superior completo'];
export const SECTIONS = ['Reserva de material', 'Reserva de armamento', 'Sargenteação', 'S1', 'S2', 'S3', 'S4', 'Almoxarifado', 'Fiscalização', 'Conformidade', 'Jurídica', 'Tesouraria', 'Rancho', 'Cassino', 'Secretaria', 'Saúde', 'PMT', 'RP', 'PI', 'HT', 'PO'];

const DATA_FIELDS: (keyof UnitPerson)[] = ['rank', 'military_id', 'civil_id', 'cpf', 'birth_date', 'prec_cp', 'qm', 'blood_type', 'email', 'religion', 'address', 'phone', 'birth_city', 'mother_name', 'father_name', 'cnh', 'education', 'section', 'additional_data'];

export function missingFields(p: UnitPerson) {
  const missing = DATA_FIELDS.filter((key) => !String(p[key] ?? '').trim());
  if (p.rank === 'Sd EV' && !String(p.military_number || '').trim()) missing.push('military_number');
  return missing;
}

export const rankIndex = (rank: string) => {
  const i = UNIT_RANKS.findIndex(([r]) => r === rank);
  return i < 0 ? UNIT_RANKS.length : i;
};

/** Ordem: posto/graduação → antiguidade → nome de guerra. */
export const sortUnit = <T extends { rank: string; seniority_order?: number | null; war_name?: string }>(people: T[]) =>
  [...people].sort(
    (a, b) =>
      rankIndex(a.rank) - rankIndex(b.rank) ||
      (Number(a.seniority_order) || 9999) - (Number(b.seniority_order) || 9999) ||
      String(a.war_name || '').localeCompare(String(b.war_name || ''), 'pt-BR'),
  );

/** "Sd EV 123 Silva" / "3º Sgt Almeida" */
export const identity = (p: Pick<UnitPerson, 'rank' | 'military_number' | 'war_name'>) =>
  `${p.rank || 'P/G não informada'}${p.rank === 'Sd EV' && p.military_number ? ` ${p.military_number}` : ''} ${p.war_name || ''}`.trim();

export function useUnitPersonnel() {
  return useQuery({
    queryKey: ['unit-personnel'],
    queryFn: async () => sortUnit((await api<{ personnel: UnitPerson[] }>('/api/unit-personnel')).personnel),
    staleTime: 60_000,
  });
}

export function useSaveUnitPerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<UnitPersonInput> & { id?: number }) =>
      api(id ? `/api/unit-personnel/${id}` : '/api/unit-personnel', { method: id ? 'PUT' : 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unit-personnel'] }),
  });
}
