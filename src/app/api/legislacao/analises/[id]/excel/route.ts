import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sessaoLegislacao } from '@/lib/legislacao/servidor';
import type { ResultadoAnalise, ResultadoComparacao } from '@/lib/legislacao/tipos';
import { gerarExcel } from '@/lib/legislacao/relatorioExcel';

export const maxDuration = 30;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await sessaoLegislacao();
  if ('erro' in auth) return auth.erro;
  const a = await prisma.legislacaoAnalise.findFirst({ where: { id: params.id, companyId: auth.session.currentCompanyId } });
  if (!a) return NextResponse.json({ error: 'Análise não encontrada.' }, { status: 404 });

  const r = a.resultado as unknown as ResultadoAnalise | ResultadoComparacao;
  const marcados = Array.isArray(a.checklistMarcados) ? (a.checklistMarcados as number[]) : [];
  const buf = await gerarExcel(a, r, marcados);
  const nome = `Analise - ${a.titulo}`.replace(/[\\/:*?"<>|]/g, '-').slice(0, 120);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="analise-legislacao.xlsx"; filename*=UTF-8''${encodeURIComponent(nome)}.xlsx`,
    },
  });
}
