// Perfis de acesso do portal. Definidos aqui (e não como enum do Prisma)
// porque o SQLite não suporta enums nativos — o campo Membership.role
// é uma String simples no banco, validada contra esta lista em código.
export type Role = 'ADMINISTRADOR' | 'GESTOR' | 'ANALISTA' | 'USUARIO' | 'CLIENTE';

export const ALL_ROLES: Role[] = ['ADMINISTRADOR', 'GESTOR', 'ANALISTA', 'USUARIO', 'CLIENTE'];

export const MODULE_PERMISSIONS = {
  dashboard: ['ADMINISTRADOR', 'GESTOR', 'ANALISTA', 'USUARIO', 'CLIENTE'],
  sped: ['ADMINISTRADOR', 'GESTOR', 'ANALISTA', 'USUARIO'],
  icms: ['ADMINISTRADOR', 'GESTOR', 'ANALISTA', 'USUARIO'],
  difal: ['ADMINISTRADOR', 'GESTOR', 'ANALISTA', 'USUARIO'],
  conciliacao: ['ADMINISTRADOR', 'GESTOR', 'ANALISTA', 'USUARIO'],
  auditorRtc: ['ADMINISTRADOR', 'GESTOR', 'ANALISTA', 'USUARIO'],
  validacaoCadastro: ['ADMINISTRADOR', 'GESTOR', 'ANALISTA', 'USUARIO'],
  analiseFiscal: ['ADMINISTRADOR', 'GESTOR', 'ANALISTA', 'USUARIO'],
  analiseFiscalConfig: ['ADMINISTRADOR'],
  // Cadastro de Produtos com classificação tributária — liberado pra todo
  // usuário que já usa a Análise Fiscal (mesmo conjunto de 'analiseFiscal'),
  // diferente do resto de "Configurar Análise Fiscal" (TES, CNPJs do grupo),
  // que continua só ADMINISTRADOR.
  analiseFiscalProdutos: ['ADMINISTRADOR', 'GESTOR', 'ANALISTA', 'USUARIO'],
  users: ['ADMINISTRADOR', 'GESTOR'],
  companyConfig: ['ADMINISTRADOR'],
} satisfies Record<string, Role[]>;

export type ModuleKey = keyof typeof MODULE_PERMISSIONS;

export function canAccess(role: Role | null, moduleKey: ModuleKey): boolean {
  if (!role) return false;
  return (MODULE_PERMISSIONS[moduleKey] as string[]).includes(role);
}

// Acesso extra ao módulo 'analiseFiscalConfig' (Regras da Análise e
// Apuração Fiscal + Configurar TES), concedido por usuário — não por
// papel — via Membership.analiseFiscalConfigExtra. Existe porque o
// sistema só tem permissão por papel (mesma coisa pra todo mundo com
// aquele papel) e o pedido foi liberar esse módulo específico pra UM
// usuário (ex: Leandro) sem promover o papel dele nem afetar os demais
// ANALISTA/GESTOR/USUARIO da empresa. Todo lugar que checava
// `canAccess(role, 'analiseFiscalConfig')` deve usar esta função no
// lugar, passando o `analiseFiscalConfigExtra` da sessão/membership.
export function canAccessAnaliseFiscalConfig(role: Role | null, extra: boolean): boolean {
  return canAccess(role, 'analiseFiscalConfig') || extra;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMINISTRADOR: 'Administrador',
  GESTOR: 'Gestor',
  ANALISTA: 'Analista',
  USUARIO: 'Usuário',
  CLIENTE: 'Cliente',
};
