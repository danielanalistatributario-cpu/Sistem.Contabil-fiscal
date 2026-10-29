import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sessaoLegislacao } from '@/lib/legislacao/servidor';
import { ASSINATURA_PADRAO, type ResultadoAnalise, type ResultadoComparacao } from '@/lib/legislacao/tipos';
import { gerarPdf } from '@/lib/legislacao/relatorioPdf';

export const maxDuration = 30;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await sessaoLegislacao();
  if ('erro' in auth) return auth.erro;
  const a = await prisma.legislacaoAnalise.findFirst({ where: { id: params.id, companyId: auth.session.currentCompanyId } });
  if (!a) return NextResponse.json({ error: 'Análise não encontrada.' }, { status: 404 });

  const assinatura = (a.assinaturaId && (await prisma.legislacaoAssinatura.findFirst({ where: { id: a.assinaturaId, companyId: a.companyId } }))) ||
    (await prisma.legislacaoAssinatura.findFirst({ where: { companyId: a.companyId, padrao: true } })) || { ...ASSINATURA_PADRAO, setor: null };

  const buf = await gerarPdf(
    { titulo: a.titulo, nomeArquivo: a.nomeArquivo, nomeArquivoB: a.nomeArquivoB, createdAt: a.createdAt, semIa: (a.modelo ?? '').startsWith('regras'), assinatura },
    a.resultado as unknown as ResultadoAnalise | ResultadoComparacao,
    Array.isArray(a.checklistMarcados) ? (a.checklistMarcados as number[]) : []
  );
  const nome = `Analise - ${a.titulo}`.replace(/[\\/:*?"<>|]/g, '-').slice(0, 120);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="analise-legislacao.pdf"; filename*=UTF-8''${encodeURIComponent(nome)}.pdf`,
    },
  });
}
