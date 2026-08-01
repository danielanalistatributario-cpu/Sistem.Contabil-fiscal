import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

export async function GET() {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'validacaoCadastro')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const perfis = await prisma.perfilProduto.findMany({
    where: { companyId: session.currentCompanyId },
    orderBy: { nome: 'asc' },
    select: {
      id: true,
      nome: true,
      descricao: true,
      createdAt: true,
      _count: { select: { itens: true } },
    },
  });

  return NextResponse.json({ perfis });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'validacaoCadastro')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const nome = String(body?.nome || '').trim();
  const descricao = body?.descricao ? String(body.descricao).trim() : null;

  if (!nome) {
    return NextResponse.json({ error: 'Informe o nome do perfil.' }, { status: 400 });
  }

  const existente = await prisma.perfilProduto.findUnique({
    where: { companyId_nome: { companyId: session.currentCompanyId, nome } },
  });
  if (existente) {
    return NextResponse.json({ error: 'Já existe um perfil com esse nome.' }, { status: 400 });
  }

  const perfil = await prisma.perfilProduto.create({
    data: { companyId: session.currentCompanyId, nome, descricao },
  });

  await logActivity(session.id, 'CRIOU_PERFIL_PRODUTO', nome, session.currentCompanyId);

  return NextResponse.json({ perfil });
}
