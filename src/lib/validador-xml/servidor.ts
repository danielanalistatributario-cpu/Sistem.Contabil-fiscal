import { NextResponse } from 'next/server';
import { getSession, type SessionUser } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

// Sessão + permissão das rotas /api/validador-xml/*.
export async function sessaoValidadorXml(): Promise<{ session: SessionUser & { currentCompanyId: string } } | { erro: NextResponse }> {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return { erro: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };
  }
  if (!canAccess(session.currentRole, 'validadorXml')) {
    return { erro: NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 }) };
  }
  return { session: session as SessionUser & { currentCompanyId: string } };
}
