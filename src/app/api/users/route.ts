import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, hashPassword, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import type { Role } from '@/lib/permissions';

export async function GET() {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'users')) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
  }

  const memberships = await prisma.membership.findMany({
    where: { companyId: session.currentCompanyId },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  });

  const users = memberships.map((m) => ({
    membershipId: m.id,
    userId: m.user.id,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
  }));

  return NextResponse.json({ users });
}

// Cria (ou vincula, se já existir) um usuário à empresa atual com um papel definido.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'users')) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const name = String(body?.name || '').trim();
  const email = String(body?.email || '').trim().toLowerCase();
  const role = body?.role as Role;
  const password = body?.password || Math.random().toString(36).slice(2, 10);

  const validRoles: Role[] = ['ADMINISTRADOR', 'GESTOR', 'ANALISTA', 'USUARIO', 'CLIENTE'];
  if (!name || !email || !validRoles.includes(role)) {
    return NextResponse.json({ error: 'Nome, e-mail e perfil válido são obrigatórios.' }, { status: 400 });
  }

  let user = await prisma.user.findUnique({ where: { email } });
  let temporaryPassword: string | null = null;

  if (!user) {
    temporaryPassword = password;
    user = await prisma.user.create({
      data: { name, email, passwordHash: await hashPassword(password) },
    });
  }

  const existingMembership = await prisma.membership.findUnique({
    where: { userId_companyId: { userId: user.id, companyId: session.currentCompanyId } },
  });

  if (existingMembership) {
    return NextResponse.json({ error: 'Este usuário já tem acesso a esta empresa.' }, { status: 400 });
  }

  await prisma.membership.create({
    data: { userId: user.id, companyId: session.currentCompanyId, role },
  });

  await logActivity(session.id, 'ADICIONOU_USUARIO', `${email} como ${role}`, session.currentCompanyId);

  return NextResponse.json({
    ok: true,
    temporaryPassword, // exibido uma única vez na tela — em produção seria enviado por e-mail
  });
}
