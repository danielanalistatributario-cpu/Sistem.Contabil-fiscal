import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

const CLASSIFICACOES_VALIDAS = ['ISENTO', 'TRIBUTADO'];

export async function GET() {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscalConfig')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const produtos = await prisma.analiseFiscalProdutoClassificacao.findMany({
    where: { companyId: session.currentCompanyId },
    orderBy: { descricao: 'asc' },
  });

  return NextResponse.json({ produtos });
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
  const codigoProduto = String(body?.codigoProduto || '').trim();
  const descricao = String(body?.descricao || '').trim();
  const classificacao = String(body?.classificacao || '').trim();
  const observacao = body?.observacao ? String(body.observacao).trim() : null;

  if (!codigoProduto || !descricao || !CLASSIFICACOES_VALIDAS.includes(classificacao)) {
    return NextResponse.json(
      { error: 'Código do produto, descrição e classificação (ISENTO/TRIBUTADO) são obrigatórios.' },
      { status: 400 }
    );
  }

  const existente = await prisma.analiseFiscalProdutoClassificacao.findUnique({
    where: { companyId_codigoProduto: { companyId: session.currentCompanyId, codigoProduto } },
  });
  if (existente) {
    return NextResponse.json({ error: 'Este código de produto já está cadastrado.' }, { status: 400 });
  }

  const produto = await prisma.analiseFiscalProdutoClassificacao.create({
    data: { companyId: session.currentCompanyId, codigoProduto, descricao, classificacao, observacao },
  });

  await logActivity(session.id, 'CADASTROU_PRODUTO_CLASSIFICACAO_ANALISE_FISCAL', `${codigoProduto} — ${descricao} (${classificacao})`, session.currentCompanyId);

  return NextResponse.json({ produto });
}
