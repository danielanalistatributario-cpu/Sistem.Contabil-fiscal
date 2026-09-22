import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { gerarExcelTributos } from '@/lib/analise-fiscal-excel-tributos';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Planilha de conferência ICMS/PIS/COFINS por nota e produto — pedido
// explícito do usuário, todas as linhas da apuração (não só as com
// divergência, diferente de /excel), com CST PIS/CST COFINS.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
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

  const itens = await prisma.analiseFiscalItem.findMany({
    where: { apuracaoId: params.id },
    orderBy: [{ numeroNf: 'asc' }, { linha: 'asc' }],
    select: {
      numeroNf: true, produtoDescricao: true, ncm: true, tes: true,
      cstPis: true, aliquotaPis: true, cstCofins: true, aliquotaCofins: true,
      total: true, baseIcms: true, valorIcms: true, basePis: true, baseCofins: true, valorPis: true, valorCofins: true,
    },
  });

  const buffer = await gerarExcelTributos(itens, 'ICMS-PIS-COFINS');

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="ICMS_PIS_COFINS_Entradas_${(apuracao.periodo || apuracao.id).replace(/[/\\]/g, '-')}.xlsx"`,
    },
  });
}
