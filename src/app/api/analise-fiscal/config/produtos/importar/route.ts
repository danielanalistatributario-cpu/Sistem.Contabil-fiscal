import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { resolverEmpresaGrupoId } from '@/lib/analise-fiscal-config-db';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CLASSIFICACOES_VALIDAS = ['ISENTO', 'TRIBUTADO'];

// Importação em massa — o Excel já foi lido e mapeado no navegador (ver
// analise-fiscal-produtos-import.ts), aqui só valida e grava. Faz
// upsert por código dentro da empresa selecionada (empresaGrupoId): produto
// já cadastrado pra aquela empresa tem descrição/classificação
// atualizadas, produto novo é criado — permite reimportar uma planilha
// corrigida sem duplicar nem precisar apagar tudo antes. Não afeta o
// cadastro de outras empresas do grupo.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscalConfig')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const linhas = Array.isArray(body?.produtos) ? body.produtos : [];
  if (linhas.length === 0) {
    return NextResponse.json({ error: 'Nenhum produto para importar.' }, { status: 400 });
  }

  const { empresaGrupoId, erro } = await resolverEmpresaGrupoId(
    session.currentCompanyId,
    session.currentEmpresaGrupoId,
    true,
    'Selecione a filial no topo da tela para importar os produtos.'
  );
  if (erro) {
    return NextResponse.json({ error: erro }, { status: 400 });
  }

  const validos: { codigoProduto: string; descricao: string; classificacao: string; observacao: string | null }[] = [];
  let invalidos = 0;

  for (const l of linhas) {
    const codigoProduto = String(l?.codigoProduto || '').trim();
    const descricao = String(l?.descricao || '').trim();
    const classificacao = String(l?.classificacao || '').trim();
    const observacao = l?.observacao ? String(l.observacao).trim() : null;
    if (!codigoProduto || !descricao || !CLASSIFICACOES_VALIDAS.includes(classificacao)) {
      invalidos++;
      continue;
    }
    validos.push({ codigoProduto, descricao, classificacao, observacao });
  }

  if (validos.length === 0) {
    return NextResponse.json({ error: 'Nenhuma linha válida encontrada na importação.' }, { status: 400 });
  }

  let criados = 0;
  let atualizados = 0;

  // Não dá pra usar upsert() com a chave composta aqui — o tipo gerado
  // pelo Prisma pra `companyId_empresaGrupoId_codigoProduto` exige
  // `empresaGrupoId: string` (não aceita null), mesmo a coluna sendo
  // opcional no schema (Postgres não suporta bem índice único composto
  // com campo nulo nesse tipo de lookup). findFirst + create/update
  // manual contorna isso, mesmo padrão já usado no restante do arquivo.
  await prisma.$transaction(async (tx) => {
    for (const p of validos) {
      const existente = await tx.analiseFiscalProdutoClassificacao.findFirst({
        where: { companyId: session.currentCompanyId!, empresaGrupoId, codigoProduto: p.codigoProduto },
        select: { id: true },
      });
      if (existente) {
        await tx.analiseFiscalProdutoClassificacao.update({
          where: { id: existente.id },
          data: { descricao: p.descricao, classificacao: p.classificacao, observacao: p.observacao },
        });
        atualizados++;
      } else {
        await tx.analiseFiscalProdutoClassificacao.create({
          data: { companyId: session.currentCompanyId!, empresaGrupoId, ...p },
        });
        criados++;
      }
    }
  });

  await logActivity(
    session.id,
    'IMPORTOU_PRODUTOS_CLASSIFICACAO_ANALISE_FISCAL',
    `${criados} criado(s), ${atualizados} atualizado(s), ${invalidos} linha(s) inválida(s)`,
    session.currentCompanyId
  );

  return NextResponse.json({ criados, atualizados, invalidos });
}
