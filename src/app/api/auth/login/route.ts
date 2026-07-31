import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword, signToken, AUTH_COOKIE_NAME, COMPANY_COOKIE_NAME, logActivity } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = body?.email?.toLowerCase()?.trim();
  const password = body?.password;

  if (!email || !password) {
    return NextResponse.json({ error: 'Informe e-mail e senha.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'E-mail ou senha inválidos.' }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: 'E-mail ou senha inválidos.' }, { status: 401 });
  }

  if (user.memberships.length === 0) {
    return NextResponse.json(
      { error: 'Este usuário ainda não possui acesso a nenhuma empresa. Contate um administrador.' },
      { status: 403 }
    );
  }

  const token = signToken(user.id);
  const res = NextResponse.json({ ok: true });

  res.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  res.cookies.set(COMPANY_COOKIE_NAME, user.memberships[0].companyId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  await logActivity(user.id, 'LOGIN', undefined, user.memberships[0].companyId);

  return res;
}
