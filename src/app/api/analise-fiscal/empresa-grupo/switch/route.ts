import { NextRequest, NextResponse } from 'next/server';
import { getSession, EMPRESA_GRUPO_COOKIE_NAME, logActivity } from '@/lib/auth';
import { carregarEmpresasGrupo } from '@/lib/analise-fiscal-config-db';

// Troca a filial (AnaliseFiscalCnpjGrupo) ativa globalmente pro módulo
// Análise e Apuração Fiscal — mesmo padrão de /api/companies/switch, só
// que pra filial em vez de empresa/tenant. empresaGrupoId vazio/null
// limpa a seleção (volta pro cadastro geral, comportamento de antes
// deste seletor existir).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const empresaGrupoId: string | null = body?.empresaGrupoId || null;

  const res = NextResponse.json({ ok: true });

  if (!empresaGrupoId) {
    res.cookies.set(EMPRESA_GRUPO_COOKIE_NAME, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
    return res;
  }

  const empresasGrupo = await carregarEmpresasGrupo(session.currentCompanyId);
  const empresa = empresasGrupo.find((e) => e.id === empresaGrupoId);
  if (!empresa) {
    return NextResponse.json({ error: 'Filial não encontrada.' }, { status: 403 });
  }

  res.cookies.set(EMPRESA_GRUPO_COOKIE_NAME, empresaGrupoId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  await logActivity(session.id, 'TROCOU_FILIAL_ANALISE_FISCAL', empresa.nome, session.currentCompanyId);
  return res;
}
