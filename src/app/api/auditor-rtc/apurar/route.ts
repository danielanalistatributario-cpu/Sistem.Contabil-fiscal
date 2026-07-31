import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'auditorRtc')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const periodo = body?.periodo ? String(body.periodo).trim() : null;
  const nfes = Array.isArray(body?.nfes) ? body.nfes : [];
  const arquivosComErro = Number(body?.arquivosComErro) || 0;

  if (nfes.length === 0) {
    return NextResponse.json({ error: 'Nenhuma NF-e recebida para salvar.' }, { status: 400 });
  }

  const ativas = nfes.filter((n: any) => n.status !== 'Cancelada' && n.status !== 'Denegada');
  const canceladas = nfes.filter((n: any) => n.status === 'Cancelada').length;
  const denegadas = nfes.filter((n: any) => n.status === 'Denegada').length;
  const validas = ativas.filter((n: any) => n.situacao === 'Válido').length;
  const comAlertas = ativas.filter((n: any) => n.situacao === 'Válido com alertas').length;
  const inconsistentes = ativas.filter((n: any) => n.situacao === 'Inconsistente').length;
  const pctConformidade = ativas.length ? Math.round(((validas + comAlertas) / ativas.length) * 1000) / 10 : 0;
  const totalItens = nfes.reduce((s: number, n: any) => s + (n.itens?.length || 0), 0);
  const itensAtivos = nfes.filter((n: any) => n.status !== 'Cancelada' && n.status !== 'Denegada').flatMap((n: any) => n.itens || []);
  const semIBS = itensAtivos.filter((i: any) => !i.hasIBS).length;
  const semCBS = itensAtivos.filter((i: any) => !i.hasCBS).length;

  const apuracao = await prisma.auditorRtcApuracao.create({
    data: {
      companyId: session.currentCompanyId,
      periodo,
      totalNfes: nfes.length,
      totalItens,
      canceladas,
      denegadas,
      validas,
      comAlertas,
      inconsistentes,
      pctConformidade,
      semIBS,
      semCBS,
      arquivosComErro,
      nfes: {
        create: nfes.map((n: any) => ({
          fileName: n.fileName,
          chave: n.chave || null,
          nNF: n.nNF || null,
          serie: n.serie || null,
          dhEmi: n.dhEmi || null,
          cnpjEmit: n.cnpjEmit || null,
          xNomeEmit: n.xNomeEmit || null,
          status: n.status,
          statusDetail: n.statusDetail || null,
          situacao: n.situacao,
          itemCount: n.itemCount || 0,
          itensErro: n.itensErro || 0,
          itensAlerta: n.itensAlerta || 0,
          itensSemIBS: n.itensSemIBS || 0,
          itensSemCBS: n.itensSemCBS || 0,
          observacoes: n.observacoes || null,
          nProt: n.nProt || null,
          synthetic: !!n.synthetic,
          itens: {
            create: (n.itens || []).map((i: any) => ({
              nItem: i.nItem || null,
              xProd: i.xProd || null,
              cProd: i.cProd || null,
              ncm: i.ncm || null,
              cfop: i.cfop || null,
              tes: i.tes || null,
              cClassTrib: i.cClassTrib || null,
              cst: i.cst || null,
              groupType: i.groupType || null,
              qCom: i.qCom,
              vUnCom: i.vUnCom,
              vProd: i.vProd,
              vDesc: i.vDesc,
              vFrete: i.vFrete,
              vSeg: i.vSeg,
              vOutro: i.vOutro,
              vBC: i.vBC,
              pIBSUF: i.pIBSUF,
              vIBSUF: i.vIBSUF,
              pIBSMun: i.pIBSMun,
              vIBSMun: i.vIBSMun,
              pIBSTotal: i.pIBSTotal,
              vIBS: i.vIBS,
              pCBS: i.pCBS,
              vCBS: i.vCBS,
              hasIBS: !!i.hasIBS,
              hasCBS: !!i.hasCBS,
              cstPis: i.cstPis || null,
              pPis: i.pPis,
              vPis: i.vPis,
              cstCofins: i.cstCofins || null,
              pCofins: i.pCofins,
              vCofins: i.vCofins,
              situacao: i.situacao,
              missingLabel: i.missingLabel || null,
              alertLabel: i.alertLabel || null,
            })),
          },
        })),
      },
    },
    select: { id: true },
  });

  await logActivity(
    session.id,
    'PROCESSOU_AUDITORIA_RTC',
    `${nfes.length} nota(s), conformidade ${pctConformidade.toFixed(1)}%`,
    session.currentCompanyId
  );

  const completa = await prisma.auditorRtcApuracao.findUnique({
    where: { id: apuracao.id },
    include: { nfes: { include: { itens: true } } },
  });

  return NextResponse.json({ apuracao: completa });
}
