import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sessaoValidadorXml } from '@/lib/validador-xml/servidor';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await sessaoValidadorXml();
  if ('erro' in auth) return auth.erro;
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  const veredito = req.nextUrl.searchParams.get('veredito') || '';
  const normaId = req.nextUrl.searchParams.get('normaId') || '';
  const campos = ['arquivoNome', 'chave', 'numeroNf', 'emitenteDoc', 'emitenteNome', 'destinatarioDoc', 'destinatarioNome', 'normaRotulo'] as const;

  const validacoes = await prisma.validacaoXml.findMany({
    where: {
      companyId: auth.session.currentCompanyId,
      ...(veredito ? { veredito } : {}),
      ...(normaId ? { normaId } : {}),
      ...(q ? { OR: campos.map((c) => ({ [c]: { contains: q, mode: 'insensitive' as const } })) } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: {
      id: true, normaRotulo: true, arquivoNome: true, chave: true, numeroNf: true, serie: true, modelo: true, dataEmissao: true,
      emitenteDoc: true, emitenteNome: true, destinatarioDoc: true, destinatarioNome: true, veredito: true, conformidade: true,
      qtdConformes: true, qtdAlertas: true, qtdDivergencias: true, qtdAusentes: true, qtdIndevidos: true, qtdNaoValidaveis: true,
      ignorouVigencia: true, userName: true, createdAt: true, erro: true,
    },
  });
  return NextResponse.json({ validacoes });
}
