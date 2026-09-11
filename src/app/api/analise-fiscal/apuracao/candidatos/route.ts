import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { buscarCandidatosPeriodo } from '@/lib/analise-fiscal-icms-apuracao';
import { carregarEmpresasGrupo } from '@/lib/analise-fiscal-config-db';

// Busca as análises de Entrada/Saída já processadas cujo período bate
// com o texto informado — passo 1 do vínculo automático da Apuração
// Fiscal. Não cria nada, só devolve os candidatos pro front-end decidir
// (auto-selecionar se vier 1 de cada lado, ou mostrar um seletor manual
// se vier 0 ou mais de 1).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const periodo = String(body?.periodo || '').trim();
  if (!periodo) {
    return NextResponse.json({ error: 'Informe o período.' }, { status: 400 });
  }

  let empresaCnpj: string | null = null;
  if (session.currentEmpresaGrupoId) {
    const empresasGrupo = await carregarEmpresasGrupo(session.currentCompanyId);
    empresaCnpj = empresasGrupo.find((e) => e.id === session.currentEmpresaGrupoId)?.cnpj || null;
  }

  const candidatos = await buscarCandidatosPeriodo(session.currentCompanyId, periodo, empresaCnpj);
  return NextResponse.json(candidatos);
}
