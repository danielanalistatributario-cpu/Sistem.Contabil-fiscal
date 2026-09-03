import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  // seleciona só os campos que a tela realmente usa — evita respostas
  // pesadas desnecessárias em apurações com muitos milhares de itens
  const apuracao = await prisma.analiseFiscalApuracao.findUnique({
    where: { id: params.id },
    include: {
      itens: {
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
          fornecedor: true,
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

  const apuracao = await prisma.analiseFiscalApuracao.findUnique({ where: { id: params.id } });
  if (!apuracao || apuracao.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Apuração não encontrada.' }, { status: 404 });
  }

  await prisma.analiseFiscalApuracao.delete({ where: { id: params.id } });
  await logActivity(session.id, 'EXCLUIU_ANALISE_FISCAL', apuracao.periodo || apuracao.fileName || apuracao.id, session.currentCompanyId);

  return NextResponse.json({ ok: true });
}
