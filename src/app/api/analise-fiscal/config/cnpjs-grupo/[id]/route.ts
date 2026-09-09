import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscalConfig')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const atual = await prisma.analiseFiscalCnpjGrupo.findUnique({ where: { id: params.id } });
  if (!atual || atual.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'CNPJ não encontrado.' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const nome = body?.nome !== undefined ? String(body.nome).trim() : atual.nome;
  const cnpj = body?.cnpj !== undefined ? String(body.cnpj).trim() : atual.cnpj;
  const uf = body?.uf !== undefined ? (String(body.uf).trim().toUpperCase() || null) : atual.uf;
  const aliquotaInterna = body?.aliquotaInterna !== undefined
    ? (body.aliquotaInterna === null || body.aliquotaInterna === '' ? null : Number(body.aliquotaInterna))
    : atual.aliquotaInterna;

  if (!nome || cnpj.replace(/\D/g, '').length !== 14) {
    return NextResponse.json({ error: 'Nome e um CNPJ válido (14 dígitos) são obrigatórios.' }, { status: 400 });
  }
  if (uf !== null && uf.length !== 2) {
    return NextResponse.json({ error: 'UF inválida — use a sigla com 2 letras (ex: PA, SP).' }, { status: 400 });
  }
  if (aliquotaInterna !== null && (Number.isNaN(aliquotaInterna) || aliquotaInterna <= 0 || aliquotaInterna >= 1)) {
    return NextResponse.json({ error: 'Alíquota interna inválida — informe um valor entre 0 e 1 (ex: 0.18 para 18%).' }, { status: 400 });
  }

  const registro = await prisma.analiseFiscalCnpjGrupo.update({
    where: { id: params.id },
    data: { nome, cnpj, uf, aliquotaInterna },
  });

  await logActivity(session.id, 'EDITOU_CNPJ_GRUPO_ANALISE_FISCAL', `${nome} (${cnpj})`, session.currentCompanyId);

  return NextResponse.json({ cnpj: registro });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscalConfig')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const atual = await prisma.analiseFiscalCnpjGrupo.findUnique({ where: { id: params.id } });
  if (!atual || atual.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'CNPJ não encontrado.' }, { status: 404 });
  }

  await prisma.analiseFiscalCnpjGrupo.delete({ where: { id: params.id } });
  await logActivity(session.id, 'EXCLUIU_CNPJ_GRUPO_ANALISE_FISCAL', `${atual.nome} (${atual.cnpj})`, session.currentCompanyId);

  return NextResponse.json({ ok: true });
}
