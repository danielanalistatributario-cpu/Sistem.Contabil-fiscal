import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sessaoLegislacao } from '@/lib/legislacao/servidor';

// Histórico de análises, com pesquisa por nome do arquivo, título,
// número, tipo, órgão e resumo.
export async function GET(req: NextRequest) {
  const auth = await sessaoLegislacao();
  if ('erro' in auth) return auth.erro;

  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  const status = req.nextUrl.searchParams.get('status') || '';
  const campos = ['titulo', 'nomeArquivo', 'nomeArquivoB', 'numero', 'tipoDocumento', 'orgao', 'resumo'] as const;

  const analises = await prisma.legislacaoAnalise.findMany({
    where: {
      companyId: auth.session.currentCompanyId,
      ...(status ? { status } : {}),
      ...(q ? { OR: campos.map((c) => ({ [c]: { contains: q, mode: 'insensitive' as const } })) } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      modo: true,
      nomeArquivo: true,
      nomeArquivoB: true,
      tipoDocumento: true,
      numero: true,
      dataDocumento: true,
      orgao: true,
      titulo: true,
      resumo: true,
      status: true,
      userName: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ analises });
}
