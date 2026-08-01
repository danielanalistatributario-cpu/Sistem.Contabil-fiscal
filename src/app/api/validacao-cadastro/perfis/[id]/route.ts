import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'validacaoCadastro')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const perfil = await prisma.perfilProduto.findUnique({
    where: { id: params.id },
    include: { itens: { orderBy: { codigo: 'asc' } } },
  });

  if (!perfil || perfil.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
  }

  return NextResponse.json({ perfil });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'validacaoCadastro')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const perfil = await prisma.perfilProduto.findUnique({ where: { id: params.id } });
  if (!perfil || perfil.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const nome = String(body?.nome || '').trim();
  const descricao = body?.descricao !== undefined ? (String(body.descricao).trim() || null) : perfil.descricao;

  if (!nome) {
    return NextResponse.json({ error: 'Informe o nome do perfil.' }, { status: 400 });
  }

  if (nome !== perfil.nome) {
    const existente = await prisma.perfilProduto.findUnique({
      where: { companyId_nome: { companyId: session.currentCompanyId, nome } },
    });
    if (existente) {
      return NextResponse.json({ error: 'Já existe um perfil com esse nome.' }, { status: 400 });
    }
  }

  const atualizado = await prisma.perfilProduto.update({
    where: { id: params.id },
    data: { nome, descricao },
  });

  return NextResponse.json({ perfil: atualizado });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'validacaoCadastro')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const perfil = await prisma.perfilProduto.findUnique({ where: { id: params.id } });
  if (!perfil || perfil.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
  }

  await prisma.perfilProduto.delete({ where: { id: params.id } });
  await logActivity(session.id, 'EXCLUIU_PERFIL_PRODUTO', perfil.nome, session.currentCompanyId);

  return NextResponse.json({ ok: true });
}
