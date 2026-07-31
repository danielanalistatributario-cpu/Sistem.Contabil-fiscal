import { NextRequest, NextResponse } from 'next/server';
import { getSession, COMPANY_COOKIE_NAME, logActivity } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const companyId = body?.companyId;

  const membership = session.memberships.find((m) => m.companyId === companyId);
  if (!membership) {
    return NextResponse.json({ error: 'Você não tem acesso a esta empresa.' }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COMPANY_COOKIE_NAME, companyId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  await logActivity(session.id, 'TROCOU_EMPRESA', membership.companyName, companyId);
  return res;
}
