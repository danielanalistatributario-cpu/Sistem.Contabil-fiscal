import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { parseSpedFiscal } from '@/lib/sped-parser';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Acima disso, devolver toda linha individual (com todos os campos) faz a
// resposta JSON passar de vários MB — já vimos isso quebrar em produção
// (Vercel) pra respostas grandes noutras rotas desta mesma ferramenta. O
// resumo por bloco/registro (porBloco/porRegistro/totalLinhas) sempre reflete
// o arquivo inteiro, nunca é cortado — só a lista linha-a-linha é limitada.
const LIMITE_LINHAS_DETALHADAS = 15000;

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

  const linhasTruncadas = resumo.linhas.length > LIMITE_LINHAS_DETALHADAS;

  return NextResponse.json({
    spedFileId: registro.id,
    fileName: file.name,
    competencia: resumo.competencia,
    nomeEmpresa: resumo.nomeEmpresa,
    totalLinhas: resumo.totalLinhas,
    porBloco: resumo.porBloco,
    porRegistro: resumo.porRegistro,
    linhasTruncadas,
    // Lista linha-a-linha limitada pra não estourar o tamanho da resposta em
    // arquivos grandes (ex: EFD Contribuições, com muito mais registros que
    // um EFD ICMS/IPI do mesmo período) — porBloco/porRegistro acima sempre
    // contam o arquivo inteiro, independente desse corte.
    linhas: linhasTruncadas ? resumo.linhas.slice(0, LIMITE_LINHAS_DETALHADAS) : resumo.linhas,
  });
}
