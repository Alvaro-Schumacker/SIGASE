import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { AppUser, Role, TaskCategory } from '../types';

export const PROFILE_ICONS = [
  '01_soldado_camuflado.png', '02_soldado_tatico.png', '03_oficial_marinha.png', '04_oficial_marinha_branca.png',
  '05_soldado_mascara_gas.png', '06_atirador_furtivo.png', '07_soldado_colete.png', '08_soldado_infantaria.png',
  '09_operador_noturno.png', '10_policial.png', '11_tanque.png', '12_helicoptero.png', '13_caca.png', '14_navio.png',
  '15_obus.png', '16_cao_militar.png', '17_paraquedas.png', '18_medalha.png', '19_mapa.png', '20_radio_e_binomio.png',
];

export const EDIT_AREAS: { value: string; label: string }[] = [
  { value: 'tasks', label: 'Tarefas' },
  { value: 'unit', label: 'Dados da unidade' },
  { value: 'scales', label: 'Escalas de serviço' },
  { value: 'documents', label: 'Documentos' },
  { value: 'requirements', label: 'Requerimentos' },
  { value: 'force_maps', label: 'Mapas da força' },
  { value: 'vacation', label: 'Plano de férias' },
];

export interface UserInput {
  display_name: string;
  login: string;
  password: string;
  role: Role;
  functions: string[];
  permissions: string[];
  avatar_icon: string;
}

export function useSaveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UserInput & { id?: number }) =>
      api<{ user: AppUser }>(id ? `/api/users/${id}` : '/api/users', { method: id ? 'PUT' : 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api<{ category: TaskCategory }>('/api/task-categories', { method: 'POST', body: { name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-categories'] }),
  });
}
