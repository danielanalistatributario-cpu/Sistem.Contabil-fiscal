import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { compararCadastro, type ItemCadastro, type PerfilRef } from '@/lib/validacao-cadastro-rules';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'validacaoCadastro')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const periodo = body?.periodo ? String(body.periodo).trim() : null;
  const itensRaw: ItemCadastro[] = Array.isArray(body?.itens) ? body.itens : [];

  if (itensRaw.length === 0) {
    return NextResponse.json({ error: 'Envie o cadastro de produtos a ser validado.' }, { status: 400 });
  }

  const perfisCadastrados = await prisma.perfilProduto.findMany({
    where: { companyId: session.currentCompanyId },
    include: { itens: { select: { codigo: true } } },
  });

  if (perfisCadastrados.length === 0) {
    return NextResponse.json(
      { error: 'Nenhum Perfil de Produto cadastrado ainda. Cadastre os perfis antes de validar o cadastro de produtos.' },
      { status: 400 }
    );
  }

  const perfis: PerfilRef[] = perfisCadastrados.map((p) => ({
    nome: p.nome,
    codigos: new Set(p.itens.map((i) => i.codigo)),
  }));

  const resultado = compararCadastro(itensRaw, perfis);

  const totais = resultado.reduce(
    (acc, item) => {
      acc.totalItens++;
      if (item.status === 'OK') acc.totalOk++;
      else if (item.status === 'DIVERGENTE') acc.totalDivergente++;
      else if (item.status === 'SEM_PERFIL') acc.totalSemPerfil++;
      else if (item.status === 'DUPLICADO') acc.totalDuplicado++;
      return acc;
    },
    { totalItens: 0, totalOk: 0, totalDivergente: 0, totalSemPerfil: 0, totalDuplicado: 0 }
  );

  const apuracao = await prisma.validacaoCadastroApuracao.create({
    data: {
      companyId: session.currentCompanyId,
      periodo,
      ...totais,
      itens: {
        create: resultado.map((i) => ({
          codigo: i.codigo,
          descricao: i.descricao,
          perfilAtual: i.perfilAtual,
          perfilEncontrado: i.perfilEncontrado,
          perfisEncontrados: i.perfisEncontrados,
          status: i.status,
          observacao: i.observacao,
        })),
      },
    },
    include: { itens: true },
  });

  await logActivity(
    session.id,
    'PROCESSOU_VALIDACAO_CADASTRO',
    `${totais.totalItens} produto(s) — ${totais.totalDivergente} divergente(s), ${totais.totalSemPerfil} sem perfil, ${totais.totalDuplicado} duplicado(s)`,
    session.currentCompanyId
  );

  return NextResponse.json({ apuracao });
}
