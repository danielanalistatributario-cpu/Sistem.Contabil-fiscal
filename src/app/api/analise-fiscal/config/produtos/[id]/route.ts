import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

const CLASSIFICACOES_VALIDAS = ['ISENTO', 'TRIBUTADO'];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscalConfig')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const atual = await prisma.analiseFiscalProdutoClassificacao.findUnique({ where: { id: params.id } });
  if (!atual || atual.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Produto não encontrado.' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const descricao = body?.descricao !== undefined ? String(body.descricao).trim() : atual.descricao;
  const classificacao = body?.classificacao !== undefined ? String(body.classificacao).trim() : atual.classificacao;
  const observacao = body?.observacao !== undefined ? (String(body.observacao).trim() || null) : atual.observacao;

  if (!descricao || !CLASSIFICACOES_VALIDAS.includes(classificacao)) {
    return NextResponse.json(
      { error: 'Descrição e classificação (ISENTO/TRIBUTADO) são obrigatórios.' },
      { status: 400 }
    );
  }

  const produto = await prisma.analiseFiscalProdutoClassificacao.update({
    where: { id: params.id },
    data: { descricao, classificacao, observacao },
  });

  await logActivity(session.id, 'EDITOU_PRODUTO_CLASSIFICACAO_ANALISE_FISCAL', `${atual.codigoProduto} — ${descricao} (${classificacao})`, session.currentCompanyId);

  return NextResponse.json({ produto });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscalConfig')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const atual = await prisma.analiseFiscalProdutoClassificacao.findUnique({ where: { id: params.id } });
  if (!atual || atual.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Produto não encontrado.' }, { status: 404 });
  }

  await prisma.analiseFiscalProdutoClassificacao.delete({ where: { id: params.id } });
  await logActivity(session.id, 'EXCLUIU_PRODUTO_CLASSIFICACAO_ANALISE_FISCAL', `${atual.codigoProduto} — ${atual.descricao}`, session.currentCompanyId);

  return NextResponse.json({ ok: true });
}
