import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { compararCadastro, type ItemCadastro } from '@/lib/validacao-cadastro-rules';
import { buscarPerfisPorCodigos } from '@/lib/protheus/perfil-produto';

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

  const company = await prisma.company.findUnique({ where: { id: session.currentCompanyId } });
  if (!company?.protheusSufixo) {
    return NextResponse.json(
      { error: 'Configure o sufixo do Protheus desta empresa em Configurações antes de validar o cadastro.' },
      { status: 400 }
    );
  }

  let perfis, perfisComTodos;
  try {
    ({ perfis, perfisComTodos } = await buscarPerfisPorCodigos(
      itensRaw.map((i) => i.codigo),
      company.protheusSufixo
    ));
  } catch (err) {
    console.error('Falha ao consultar Perfis de Produto no Protheus:', err);
    return NextResponse.json(
      { error: 'Não foi possível consultar os Perfis de Produto no Protheus. Verifique a conexão com o banco.' },
      { status: 502 }
    );
  }

  const resultado = compararCadastro(itensRaw, perfis).map((item) => {
    if (item.status !== 'SEM_PERFIL' || perfisComTodos.length === 0) return item;
    return {
      ...item,
      observacao: `${item.observacao ? item.observacao + ' ' : ''}Perfil(is) com regra "TODOS" no Protheus (aplicação genérica, não confirmada): ${perfisComTodos.join(', ')} — verificar manualmente.`,
    };
  });

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
