import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

// Só devolve os itens COM divergência — arquivos de Saídas reais chegam a
// dezenas de milhares de linhas, e a esmagadora maioria não diverge (ver
// [[analise-apuracao-fiscal-modulo]] na memória do projeto); devolver
// tudo estouraria o limite de resposta da hospedagem. Os totais (todas as
// linhas, não só as divergentes) já vêm prontos no resumo, calculado no
// navegador antes do envio — não dependem de carregar os itens aqui. Pra
// ver/exportar todos os itens (mesmo sem divergência), usar a exportação
// em Excel (gerada no servidor, não passa pela resposta desta rota).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const apuracao = await prisma.analiseFiscalSaidaApuracao.findUnique({
    where: { id: params.id },
    include: {
      itens: {
        where: { divergencias: { some: {} } },
        orderBy: { linha: 'asc' },
        select: {
          id: true,
          linha: true,
          tes: true,
          tesConhecida: true,
          produtoCodigo: true,
          produtoDescricao: true,
          cfop: true,
          uf: true,
          cliente: true,
          cnpjCpf: true,
          chaveNf: true,
          numeroNf: true,
          divergencias: true,
        },
      },
    },
  });

  if (!apuracao || apuracao.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Apuração não encontrada.' }, { status: 404 });
  }

  return NextResponse.json({ apuracao });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const apuracao = await prisma.analiseFiscalSaidaApuracao.findUnique({ where: { id: params.id } });
  if (!apuracao || apuracao.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Apuração não encontrada.' }, { status: 404 });
  }

  await prisma.analiseFiscalSaidaApuracao.delete({ where: { id: params.id } });
  await logActivity(session.id, 'EXCLUIU_ANALISE_FISCAL_SAIDA', apuracao.periodo || apuracao.fileName || apuracao.id, session.currentCompanyId);

  return NextResponse.json({ ok: true });
}
