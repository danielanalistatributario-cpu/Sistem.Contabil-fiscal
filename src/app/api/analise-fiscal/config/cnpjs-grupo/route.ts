import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

export async function GET() {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscalConfig')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const cnpjs = await prisma.analiseFiscalCnpjGrupo.findMany({
    where: { companyId: session.currentCompanyId },
    orderBy: { nome: 'asc' },
  });

  return NextResponse.json({ cnpjs });
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
  const nome = String(body?.nome || '').trim();
  const cnpj = String(body?.cnpj || '').trim();

  if (!nome || cnpj.replace(/\D/g, '').length !== 14) {
    return NextResponse.json({ error: 'Nome e um CNPJ válido (14 dígitos) são obrigatórios.' }, { status: 400 });
  }

  const existente = await prisma.analiseFiscalCnpjGrupo.findUnique({
    where: { companyId_cnpj: { companyId: session.currentCompanyId, cnpj } },
  });
  if (existente) {
    return NextResponse.json({ error: 'Este CNPJ já está cadastrado no grupo.' }, { status: 400 });
  }

  const registro = await prisma.analiseFiscalCnpjGrupo.create({
    data: { companyId: session.currentCompanyId, nome, cnpj },
  });

  await logActivity(session.id, 'ADICIONOU_CNPJ_GRUPO_ANALISE_FISCAL', `${nome} (${cnpj})`, session.currentCompanyId);

  return NextResponse.json({ cnpj: registro });
}
