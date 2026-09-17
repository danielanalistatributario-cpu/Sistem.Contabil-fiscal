import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import type { LinhaClassificacaoReferencia } from '@/lib/classificacao-produto-referencia-reader';

// Classificação de referência (ex: estudo de reclassificação pra Reforma
// Tributária IBS/CBS) — o que DEVERIA estar cadastrado, sempre por filial
// (pedido explícito do usuário: cadastros de cada filial independentes).
// Sem filial ativa no seletor do Topbar, não dá pra importar — não existe
// "geral" aqui, diferente de PerfilProduto.

export async function GET() {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'validacaoCadastro')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const empresaGrupoId = session.currentEmpresaGrupoId;
  if (!empresaGrupoId) {
    return NextResponse.json({ total: 0, empresaGrupoId: null });
  }

  const total = await prisma.classificacaoProdutoReferencia.count({ where: { empresaGrupoId } });
  const ultima = await prisma.classificacaoProdutoReferencia.findFirst({
    where: { empresaGrupoId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  return NextResponse.json({ total, empresaGrupoId, importadoEm: ultima?.createdAt ?? null });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'validacaoCadastro')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const empresaGrupoId = session.currentEmpresaGrupoId;
  if (!empresaGrupoId) {
    return NextResponse.json(
      { error: 'Selecione a Filial no topo da tela antes de importar — esse cadastro é sempre por filial.' },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const linhas: LinhaClassificacaoReferencia[] = Array.isArray(body?.linhas) ? body.linhas : [];
  if (linhas.length === 0) {
    return NextResponse.json({ error: 'Envie a planilha de classificação de referência.' }, { status: 400 });
  }

  const companyId = session.currentCompanyId;
  const dados = linhas.map((l) => ({
    companyId,
    empresaGrupoId,
    codigo: l.codigo,
    descricao: l.descricao,
    ncm: l.ncm,
    tipo: l.tipo,
    grupo: l.grupo,
    finalidade: l.finalidade,
    cst: l.cst,
    cClassTrib: l.cClassTrib,
    perfilCorreto: l.perfilCorreto,
    reducao: l.reducao,
    fundamentoLegal: l.fundamentoLegal,
    confianca: l.confianca,
    homologado: l.homologado,
  }));

  await prisma.$transaction([
    prisma.classificacaoProdutoReferencia.deleteMany({ where: { companyId, empresaGrupoId } }),
    prisma.classificacaoProdutoReferencia.createMany({ data: dados }),
  ]);

  await logActivity(
    session.id,
    'IMPORTOU_CLASSIFICACAO_REFERENCIA',
    `${dados.length} produto(s) classificado(s)`,
    session.currentCompanyId
  );

  return NextResponse.json({ total: dados.length });
}
