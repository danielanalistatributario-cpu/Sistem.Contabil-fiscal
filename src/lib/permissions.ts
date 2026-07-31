// Perfis de acesso do portal. Definidos aqui (e não como enum do Prisma)
// porque o SQLite não suporta enums nativos — o campo Membership.role
// é uma String simples no banco, validada contra esta lista em código.
export type Role = 'ADMINISTRADOR' | 'GESTOR' | 'ANALISTA' | 'USUARIO' | 'CLIENTE';

export const ALL_ROLES: Role[] = ['ADMINISTRADOR', 'GESTOR', 'ANALISTA', 'USUARIO', 'CLIENTE'];

export const MODULE_PERMISSIONS = {
  dashboard: ['ADMINISTRADOR', 'GESTOR', 'ANALISTA', 'USUARIO', 'CLIENTE'],
  sped: ['ADMINISTRADOR', 'GESTOR', 'ANALISTA'],
  icms: ['ADMINISTRADOR', 'GESTOR', 'ANALISTA'],
  difal: ['ADMINISTRADOR', 'GESTOR', 'ANALISTA'],
  conciliacao: ['ADMINISTRADOR', 'GESTOR', 'ANALISTA'],
  auditorRtc: ['ADMINISTRADOR', 'GESTOR', 'ANALISTA'],
  users: ['ADMINISTRADOR', 'GESTOR'],
  companyConfig: ['ADMINISTRADOR'],
} satisfies Record<string, Role[]>;

export type ModuleKey = keyof typeof MODULE_PERMISSIONS;

export function canAccess(role: Role | null, moduleKey: ModuleKey): boolean {
  if (!role) return false;
  return (MODULE_PERMISSIONS[moduleKey] as string[]).includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMINISTRADOR: 'Administrador',
  GESTOR: 'Gestor',
  ANALISTA: 'Analista',
  USUARIO: 'Usuário',
  CLIENTE: 'Cliente',
};
