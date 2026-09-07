import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CLASSIFICACOES_VALIDAS = ['ISENTO', 'TRIBUTADO'];

// Importação em massa — o Excel já foi lido e mapeado no navegador (ver
// analise-fiscal-produtos-import.ts), aqui só valida e grava. Faz
// upsert por código: produto já cadastrado tem descrição/classificação
// atualizadas, produto novo é criado — permite reimportar uma planilha
// corrigida sem duplicar nem precisar apagar tudo antes.
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

  await prisma.$transaction(async (tx) => {
    for (const p of validos) {
      const resultado = await tx.analiseFiscalProdutoClassificacao.upsert({
        where: { companyId_codigoProduto: { companyId: session.currentCompanyId!, codigoProduto: p.codigoProduto } },
        create: { companyId: session.currentCompanyId!, ...p },
        update: { descricao: p.descricao, classificacao: p.classificacao, observacao: p.observacao },
      });
      if (resultado.createdAt.getTime() === resultado.updatedAt.getTime()) criados++;
      else atualizados++;
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
