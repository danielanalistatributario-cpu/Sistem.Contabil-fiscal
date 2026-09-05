import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import type { ResumoApuracao } from '@/lib/analise-fiscal-compute';

// Etapa 1 do fluxo em lotes: cria o cabeçalho da apuração com o resumo já
// calculado no navegador. Entradas passou a usar o mesmo fluxo em lotes
// de Saídas (ver [[analise-apuracao-fiscal-modulo]] na memória do
// projeto) porque um arquivo real de ~5MB já estoura o limite de payload
// da Vercel mesmo enviado bruto (sem JSON) — o problema não é mais só
// tamanho de JSON, é o próprio arquivo. Devolve o id pra os lotes
// seguintes (/apurar/lote) linkarem os itens.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const periodo = body?.periodo ? String(body.periodo).trim() : null;
  const fileName = body?.fileName ? String(body.fileName).trim() : null;
  const resumo = body?.resumo as ResumoApuracao | undefined;

  if (!resumo || typeof resumo.totalLinhas !== 'number') {
    return NextResponse.json({ error: 'Resumo da apuração ausente ou inválido.' }, { status: 400 });
  }

  const apuracao = await prisma.analiseFiscalApuracao.create({
    data: {
      companyId: session.currentCompanyId,
      periodo,
      fileName,
      status: 'PROCESSANDO',
      totalLinhas: resumo.totalLinhas,
      totalNotas: resumo.totalNotas,
      totalProdutos: resumo.totalProdutos,
      totalTes: resumo.totalTes,
      totalCfops: resumo.totalCfops,
      qtdTesNovas: resumo.qtdTesNovas,
      qtdCfopsNovos: resumo.qtdCfopsNovos,
      qtdNotasSemChave: resumo.qtdNotasSemChave,
      qtdDivergenciaCfopUf: resumo.qtdDivergenciaCfopUf,
      qtdDivergenciaIcms: resumo.qtdDivergenciaIcms,
      qtdDivergenciaPisCofins: resumo.qtdDivergenciaPisCofins,
      qtdProdutosIncompativeis: resumo.qtdProdutosIncompativeis,
      totalDivergencias: resumo.totalDivergencias,
      qtdCritico: resumo.qtdCritico,
      qtdAlto: resumo.qtdAlto,
      qtdMedio: resumo.qtdMedio,
      qtdBaixo: resumo.qtdBaixo,
      qtdInformativo: resumo.qtdInformativo,
      tesNovasEncontradas: resumo.tesNovasEncontradas.join(', ') || null,
    },
    select: { id: true },
  });

  await logActivity(
    session.id,
    'INICIOU_ANALISE_FISCAL',
    `${fileName || periodo || apuracao.id} — ${resumo.totalLinhas} linha(s) previstas`,
    session.currentCompanyId
  );

  return NextResponse.json({ apuracaoId: apuracao.id });
}
