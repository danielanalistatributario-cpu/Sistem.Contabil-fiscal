import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { parseSpedFiscal } from '@/lib/sped-parser';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'sped')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });

  const text = await file.text();
  if (!text.trim()) {
    return NextResponse.json({ error: 'Arquivo vazio ou ilegível.' }, { status: 400 });
  }

  const resumo = parseSpedFiscal(text);

  const registro = await prisma.spedFile.create({
    data: {
      companyId: session.currentCompanyId,
      fileName: file.name,
      competencia: resumo.competencia,
      totalLinhas: resumo.totalLinhas,
      blocksJson: JSON.stringify({
        porBloco: resumo.porBloco,
        porRegistro: resumo.porRegistro,
        nomeEmpresa: resumo.nomeEmpresa,
      }),
    },
  });

  await logActivity(
    session.id,
    'IMPORTOU_SPED_FISCAL',
    `${file.name} (${resumo.totalLinhas} linhas)`,
    session.currentCompanyId
  );

  return NextResponse.json({
    spedFileId: registro.id,
    fileName: file.name,
    competencia: resumo.competencia,
    nomeEmpresa: resumo.nomeEmpresa,
    totalLinhas: resumo.totalLinhas,
    porBloco: resumo.porBloco,
    porRegistro: resumo.porRegistro,
    // Para arquivos muito grandes (produção), este processamento deve migrar
    // para uma fila assíncrona, conforme recomendado no documento de escopo (seção 5.1).
    linhas: resumo.linhas,
  });
}
