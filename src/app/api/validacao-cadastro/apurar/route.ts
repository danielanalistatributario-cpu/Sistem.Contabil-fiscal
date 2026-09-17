import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { compararCadastro, type ItemCadastro } from '@/lib/validacao-cadastro-rules';
import {
  buscarPerfisPorCodigosSincronizados,
  obterUltimaSincronizacao,
  obterSufixoConfigurado,
} from '@/lib/validacao-cadastro-perfil-sync';

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

  const empresaGrupoId = session.currentEmpresaGrupoId;
  const sufixo = await obterSufixoConfigurado(session.currentCompanyId, empresaGrupoId);
  if (!sufixo) {
    return NextResponse.json(
      {
        error: empresaGrupoId
          ? 'Esta filial não tem o sufixo do Protheus configurado — configure em Análise Fiscal → Configurar TES → Empresas do grupo.'
          : 'Configure o sufixo do Protheus desta empresa em Configurações antes de validar o cadastro.',
      },
      { status: 400 }
    );
  }

  const ultimaSincronizacao = await obterUltimaSincronizacao(session.currentCompanyId, empresaGrupoId);
  if (!ultimaSincronizacao) {
    return NextResponse.json(
      {
        error:
          'Nenhum dado de Perfil de Produto sincronizado ainda para esta empresa/filial. A sincronização com o Protheus roda periodicamente a partir do escritório — aguarde a próxima rodada ou verifique se o script está sendo executado.',
      },
      { status: 400 }
    );
  }

  const { perfis, perfisComTodos } = await buscarPerfisPorCodigosSincronizados(
    itensRaw.map((i) => i.codigo),
    session.currentCompanyId,
    empresaGrupoId
  );

  // Classificação de referência (ex: estudo IBS/CBS) — o que DEVERIA estar
  // cadastrado, sempre por filial. Independente da comparação acima (que só
  // usa o que ESTÁ sincronizado do Protheus) — não existe pra toda filial,
  // por isso é um Map à parte, não bloqueia a apuração se estiver vazio.
  const classificacaoReferencia = empresaGrupoId
    ? await prisma.classificacaoProdutoReferencia.findMany({ where: { companyId: session.currentCompanyId, empresaGrupoId } })
    : [];
  const referenciaPorCodigo = new Map<string, typeof classificacaoReferencia>();
  for (const c of classificacaoReferencia) {
    if (!referenciaPorCodigo.has(c.codigo)) referenciaPorCodigo.set(c.codigo, []);
    referenciaPorCodigo.get(c.codigo)!.push(c);
  }

  const resultado = compararCadastro(itensRaw, perfis).map((item) => {
    const refs = referenciaPorCodigo.get(item.codigo) || [];
    const perfisDistintos = Array.from(new Set(refs.map((r) => r.perfilCorreto)));
    // Achado real: um código pode aparecer mais de uma vez na referência com
    // classificações DIFERENTES (produto reaproveitado no Protheus) — nesse
    // caso não escolhe um arbitrariamente, sinaliza a ambiguidade.
    const comReferencia =
      refs.length === 0
        ? {
            perfilCorreto: null,
            cstCorreto: null,
            cClassTribCorreto: null,
            reducaoCorreta: null,
            fundamentoLegalCorreto: null,
            confiancaCorreta: null,
          }
        : perfisDistintos.length > 1
        ? {
            perfilCorreto: `AMBÍGUO: ${perfisDistintos.join(' / ')} — código repetido na referência com classificações diferentes`,
            cstCorreto: null,
            cClassTribCorreto: null,
            reducaoCorreta: null,
            fundamentoLegalCorreto: null,
            confiancaCorreta: null,
          }
        : {
            perfilCorreto: refs[0].perfilCorreto,
            cstCorreto: refs[0].cst,
            cClassTribCorreto: refs[0].cClassTrib,
            reducaoCorreta: refs[0].reducao,
            fundamentoLegalCorreto: refs[0].fundamentoLegal,
            confiancaCorreta: refs[0].confianca,
          };

    if (item.status !== 'SEM_PERFIL' || perfisComTodos.length === 0) return { ...item, ...comReferencia };
    return {
      ...item,
      ...comReferencia,
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
          perfilCorreto: i.perfilCorreto,
          cstCorreto: i.cstCorreto,
          cClassTribCorreto: i.cClassTribCorreto,
          reducaoCorreta: i.reducaoCorreta,
          fundamentoLegalCorreto: i.fundamentoLegalCorreto,
          confiancaCorreta: i.confiancaCorreta,
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

  return NextResponse.json({ apuracao, ultimaSincronizacao });
}
