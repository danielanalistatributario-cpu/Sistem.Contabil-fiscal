import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { garantirSeedTesConfig } from '@/lib/analise-fiscal-config-db';

const CHAVE_NF_VALIDAS = ['obrigatoria', 'proibida', 'livre'];

export async function GET() {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscalConfig')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  await garantirSeedTesConfig(session.currentCompanyId);
  const tes = await prisma.analiseFiscalTesConfig.findMany({
    where: { companyId: session.currentCompanyId },
    orderBy: { codigo: 'asc' },
  });

  return NextResponse.json({ tes });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscalConfig')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const codigo = String(body?.codigo || '').trim();
  const grupo = String(body?.grupo || '').trim();
  const chaveNf = String(body?.chaveNf || '').trim();
  const permiteProdutos = !!body?.permiteProdutos;
  const validarCfopUf = body?.validarCfopUf === undefined ? true : !!body.validarCfopUf;

  if (!codigo || !grupo || !CHAVE_NF_VALIDAS.includes(chaveNf)) {
    return NextResponse.json(
      { error: 'Código, grupo e política de Chave NF (obrigatoria/proibida/livre) são obrigatórios.' },
      { status: 400 }
    );
  }

  const existente = await prisma.analiseFiscalTesConfig.findUnique({
    where: { companyId_codigo: { companyId: session.currentCompanyId, codigo } },
  });
  if (existente) {
    return NextResponse.json({ error: `A TES ${codigo} já está cadastrada.` }, { status: 400 });
  }

  const tes = await prisma.analiseFiscalTesConfig.create({
    data: { companyId: session.currentCompanyId, codigo, grupo, chaveNf, permiteProdutos, validarCfopUf },
  });

  await logActivity(session.id, 'CADASTROU_TES_ANALISE_FISCAL', `TES ${codigo} — ${grupo}`, session.currentCompanyId);

  return NextResponse.json({ tes });
}
