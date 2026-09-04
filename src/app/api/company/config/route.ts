import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

export async function GET() {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  const company = await prisma.company.findUnique({ where: { id: session.currentCompanyId } });
  if (!company) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });

  return NextResponse.json({
    ufDestino: company.ufDestino,
    aliquotaInterna: company.aliquotaInterna,
    protheusSufixo: company.protheusSufixo,
    inscricaoEstadual: company.inscricaoEstadual,
  });
}

// Sufixo vira nome de tabela numa query SQL (F24${sufixo}), que não pode ser
// parametrizado como valor — por isso a validação estrita aqui é a única
// barreira contra SQL injection nesse campo.
const PROTHEUS_SUFIXO_REGEX = /^[0-9]{2,4}$/;

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'companyConfig')) {
    return NextResponse.json({ error: 'Apenas administradores podem alterar esta configuração.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const ufDestino = String(body?.ufDestino || '').trim().toUpperCase();
  const aliquotaInterna = Number(body?.aliquotaInterna);
  const protheusSufixoRaw = String(body?.protheusSufixo || '').trim();
  const protheusSufixo = protheusSufixoRaw === '' ? null : protheusSufixoRaw;
  const inscricaoEstadualRaw = String(body?.inscricaoEstadual || '').trim();
  const inscricaoEstadual = inscricaoEstadualRaw === '' ? null : inscricaoEstadualRaw;

  if (ufDestino.length !== 2 || Number.isNaN(aliquotaInterna) || aliquotaInterna <= 0 || aliquotaInterna >= 1) {
    return NextResponse.json(
      { error: 'Informe uma UF válida (2 letras) e uma alíquota entre 0 e 1 (ex: 0.19 para 19%).' },
      { status: 400 }
    );
  }
  if (protheusSufixo !== null && !PROTHEUS_SUFIXO_REGEX.test(protheusSufixo)) {
    return NextResponse.json(
      { error: 'Sufixo do Protheus inválido — informe só os dígitos do sufixo da tabela (ex: 140).' },
      { status: 400 }
    );
  }

  const company = await prisma.company.update({
    where: { id: session.currentCompanyId },
    data: { ufDestino, aliquotaInterna, protheusSufixo, inscricaoEstadual },
  });

  await logActivity(
    session.id,
    'ATUALIZOU_CONFIG_FISCAL',
    `UF destino: ${ufDestino}, alíquota interna: ${(aliquotaInterna * 100).toFixed(2)}%, sufixo Protheus: ${protheusSufixo || '(não configurado)'}, IE: ${inscricaoEstadual || '(não configurada)'}`,
    session.currentCompanyId
  );

  return NextResponse.json({
    ufDestino: company.ufDestino,
    aliquotaInterna: company.aliquotaInterna,
    protheusSufixo: company.protheusSufixo,
    inscricaoEstadual: company.inscricaoEstadual,
  });
}
