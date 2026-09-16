import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import type { TipoSped } from '@/lib/sped-parser';

export const runtime = 'nodejs';

// O parse (parseSpedFiscal) roda no navegador agora — um EFD Contribuições
// real já passou dos ~4,5MB que a Vercel aceita de corpo de requisição, e
// enviar o arquivo bruto pro servidor processar não é mais viável (ver
// [[analise-apuracao-fiscal-modulo]]). As linhas detalhadas (SpedLine[])
// nunca saem do navegador — ficam só no estado da página, usadas pra
// tabela/filtros/export locais; o servidor só recebe e persiste o resumo
// (contagens por bloco/registro, nome da empresa, competência), que é
// pequeno independente do tamanho do arquivo original.
type ResumoRecebido = {
  fileName: string;
  competencia: string | null;
  nomeEmpresa: string | null;
  totalLinhas: number;
  porBloco: Record<string, number>;
  porRegistro: Record<string, number>;
  tipoSped: TipoSped;
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'sped')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const resumo = (await req.json().catch(() => null)) as ResumoRecebido | null;
  if (!resumo || !resumo.fileName) {
    return NextResponse.json({ error: 'Dados do arquivo não recebidos.' }, { status: 400 });
  }

  const registro = await prisma.spedFile.create({
    data: {
      companyId: session.currentCompanyId,
      fileName: resumo.fileName,
      competencia: resumo.competencia,
      totalLinhas: resumo.totalLinhas,
      blocksJson: JSON.stringify({
        porBloco: resumo.porBloco,
        porRegistro: resumo.porRegistro,
        nomeEmpresa: resumo.nomeEmpresa,
        tipoSped: resumo.tipoSped,
      }),
    },
  });

  await logActivity(
    session.id,
    'IMPORTOU_SPED_FISCAL',
    `${resumo.fileName} (${resumo.totalLinhas} linhas)`,
    session.currentCompanyId
  );

  return NextResponse.json({ spedFileId: registro.id });
}
