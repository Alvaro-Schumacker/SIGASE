export type Role = 'viewer' | 'editor' | 'admin';

/** Resposta de /api/me e /api/login. */
export interface Me {
  id: number;
  user: string;
  role: Role;
  functions: string[];
  avatar_icon: string;
  permissions: string[];
  canEditTasks: boolean;
  canEditPersonnel: boolean;
  canEditDocuments: boolean;
  canEditRequirements: boolean;
  canEditForceMaps: boolean;
  canEditVacation: boolean;
  canEditScales: boolean;
  canManageUsers: boolean;
  canManageNotices: boolean;
  mustChangePassword?: boolean;
}

export type TaskStatus = 'Pendente' | 'Em andamento' | 'Concluída';
export type TaskPriority = 'Baixa' | 'Média' | 'Alta';
/** [ação, autor, data ISO] */
export type TaskEvent = [string, string, string];

export interface Task {
  id: string;
  title: string;
  description: string;
  classification: string;
  requester: string;
  requester_id: number;
  assignee: string;
  assignee_ids: number[];
  assignees: { id: number; display_name: string }[];
  priority: TaskPriority;
  due: string;
  created: string;
  status: TaskStatus;
  events: TaskEvent[];
  completed_by: string | null;
}

export interface AppUser {
  id: number;
  display_name: string;
  login: string;
  role: Role;
  avatar_icon: string;
  functions: string[];
  permissions: string[];
}

export interface Notice {
  id: number;
  title: string;
  subject: string;
  notice_date: string;
  created_by: string;
  category: string;
  is_recipient: boolean;
  acknowledged: boolean;
  all_acknowledged: boolean;
  can_manage?: boolean;
  recipient_count: number;
  acknowledged_count: number;
  recipients: { id: number; display_name: string; acknowledged_at: string | null }[];
}

export interface HistoryEntry {
  id: number;
  actor_name: string;
  action: string;
  entity: string;
  entity_label: string | null;
  created_at: string;
}

export interface OnlineUser {
  id: number;
  display_name: string;
  avatar_icon: string;
  last_seen: string;
}

export interface VacationPeriod {
  id: number;
  person_id: number;
  full_name: string;
  rank: string;
  start_date: string;
  end_date: string;
  travel_days: 0 | 1;
  vacation_days: number;
  presentation_date: string;
  period_number: number;
  period_total: number;
  reference_year: number;
  task_added: 0 | 1;
}

export interface TaskCategory {
  id: number;
  name: string;
}
