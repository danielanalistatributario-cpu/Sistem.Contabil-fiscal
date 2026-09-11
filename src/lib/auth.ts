import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { prisma } from './db';
import type { Role } from './permissions';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_COOKIE = 'portal_token';
const COMPANY_COOKIE = 'portal_company_id';
const EMPRESA_GRUPO_COOKIE = 'portal_empresa_grupo_id';

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signToken(userId: string) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    return null;
  }
}

export const AUTH_COOKIE_NAME = TOKEN_COOKIE;
export const COMPANY_COOKIE_NAME = COMPANY_COOKIE;
export const EMPRESA_GRUPO_COOKIE_NAME = EMPRESA_GRUPO_COOKIE;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  memberships: { companyId: string; companyName: string; role: Role }[];
  currentCompanyId: string | null;
  currentRole: Role | null;
  // Filial ativa (AnaliseFiscalCnpjGrupo) dentro da empresa/tenant atual,
  // escolhida no seletor "Filial" do Topbar — hoje só usada pelo módulo
  // Análise e Apuração Fiscal. null = nenhuma filial selecionada (tenant
  // sem cadastro de filiais, ou usuário ainda não escolheu).
  currentEmpresaGrupoId: string | null;
};

// Resolve o usuario autenticado a partir do cookie de sessao (uso em server components e API routes).
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(TOKEN_COOKIE)?.value;
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { memberships: { include: { company: true } } },
  });
  if (!user) return null;

  const memberships = user.memberships.map((m) => ({
    companyId: m.companyId,
    companyName: m.company.name,
    role: m.role as Role,
  }));

  let currentCompanyId = cookieStore.get(COMPANY_COOKIE)?.value || null;
  if (!currentCompanyId || !memberships.some((m) => m.companyId === currentCompanyId)) {
    currentCompanyId = memberships[0]?.companyId || null;
  }

  const currentRole = memberships.find((m) => m.companyId === currentCompanyId)?.role || null;

  // Só consulta o banco se o cookie de filial existir — usuário/tenant que
  // nunca usou o seletor "Filial" (Análise Fiscal) não paga esse custo em
  // toda requisição autenticada do sistema.
  let currentEmpresaGrupoId: string | null = cookieStore.get(EMPRESA_GRUPO_COOKIE)?.value || null;
  if (currentEmpresaGrupoId && currentCompanyId) {
    const valida = await prisma.analiseFiscalCnpjGrupo.findFirst({
      where: { id: currentEmpresaGrupoId, companyId: currentCompanyId, uf: { not: null } },
      select: { id: true },
    });
    if (!valida) currentEmpresaGrupoId = null;
  } else {
    currentEmpresaGrupoId = null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    memberships,
    currentCompanyId,
    currentRole,
    currentEmpresaGrupoId,
  };
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new Error('UNAUTHENTICATED');
  }
  return session;
}

export async function logActivity(
  userId: string,
  action: string,
  details?: string,
  companyId?: string | null
) {
  await prisma.activityLog.create({
    data: { userId, action, details, companyId: companyId ?? null },
  });
}
