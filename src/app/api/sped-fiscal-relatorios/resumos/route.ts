import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import type { ResumoMensal } from '@/lib/efd-icms/tipos';

export const dynamic = 'force-dynamic';

const MAX_RESUMOS = 12;
const MAX_BYTES_POR_RESUMO = 400_000;

async function sessao() {
  const session = await getSession();
  if (!session || !session.currentCompanyId) return { erro: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };
  if (!canAccess(session.currentRole, 'spedFiscalRelatorios')) return { erro: NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 }) };
  return { session: session as typeof session & { currentCompanyId: string } };
}

const digitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

// Sem parâmetros: lista (sem o conteúdo) o que está guardado, por empresa e ano.
// Com cnpj, ie e ano: devolve os resumos mensais completos daquele exercício.
export async function GET(req: NextRequest) {
  const auth = await sessao();
  if ('erro' in auth) return auth.erro;
  const companyId = auth.session.currentCompanyId;
  const cnpj = digitos(req.nextUrl.searchParams.get('cnpj'));
  const ie = digitos(req.nextUrl.searchParams.get('ie'));
  const ano = String(req.nextUrl.searchParams.get('ano') ?? '');

  if (cnpj && ano) {
    const linhas = await prisma.spedFiscalResumo.findMany({
      where: { companyId, cnpj, ...(ie ? { ie } : {}), ym: { startsWith: ano } },
      orderBy: { ym: 'asc' },
      select: { resumo: true, id: true, updatedAt: true, userName: true },
    });
    return NextResponse.json({ resumos: linhas.map((l) => ({ ...(l.resumo as unknown as ResumoMensal), _id: l.id, _salvoEm: l.updatedAt, _por: l.userName })) });
  }

  const linhas = await prisma.spedFiscalResumo.findMany({
    where: { companyId },
    orderBy: [{ cnpj: 'asc' }, { ym: 'asc' }],
    select: { id: true, cnpj: true, ie: true, empresaNome: true, uf: true, ym: true, codFin: true, nomeArquivo: true, userName: true, updatedAt: true },
  });
  // agrupa por empresa + ano
  const grupos = new Map<string, { cnpj: string; ie: string; empresaNome: string; uf: string | null; ano: string; meses: { id: string; ym: string; codFin: string | null; nomeArquivo: string; updatedAt: Date; userName: string | null }[] }>();
  for (const l of linhas) {
    const k = `${l.cnpj}|${l.ie}|${l.ym.slice(0, 4)}`;
    const g = grupos.get(k) ?? { cnpj: l.cnpj, ie: l.ie, empresaNome: l.empresaNome, uf: l.uf, ano: l.ym.slice(0, 4), meses: [] };
    g.meses.push({ id: l.id, ym: l.ym, codFin: l.codFin, nomeArquivo: l.nomeArquivo, updatedAt: l.updatedAt, userName: l.userName });
    grupos.set(k, g);
  }
  return NextResponse.json({ grupos: [...grupos.values()] });
}

// Guarda (ou atualiza) o resumo de cada mês enviado. Só o resumo — nunca o arquivo.
export async function POST(req: NextRequest) {
  const auth = await sessao();
  if ('erro' in auth) return auth.erro;
  const body = await req.json().catch(() => null);
  const resumos: ResumoMensal[] = Array.isArray(body?.resumos) ? body.resumos : [];
  if (resumos.length === 0) return NextResponse.json({ error: 'Nenhum resumo enviado.' }, { status: 400 });
  if (resumos.length > MAX_RESUMOS) return NextResponse.json({ error: `No máximo ${MAX_RESUMOS} meses por vez.` }, { status: 400 });

  const companyId = auth.session.currentCompanyId;
  let salvos = 0;
  for (const r of resumos) {
    const cnpj = digitos(r?.empresa?.cnpj);
    const ie = digitos(r?.empresa?.ie);
    if (r?.versao !== 1 || !/^\d{6}$/.test(String(r?.ym)) || cnpj.length < 11 || !Array.isArray(r?.entradas?.linhas) || !Array.isArray(r?.saidas?.linhas)) {
      return NextResponse.json({ error: 'Resumo inválido.' }, { status: 400 });
    }
    if (JSON.stringify(r).length > MAX_BYTES_POR_RESUMO) return NextResponse.json({ error: `O resumo de ${r.ym} é grande demais para guardar.` }, { status: 413 });
    const dados = {
      userId: auth.session.id,
      userName: auth.session.name,
      empresaNome: String(r.empresa.nome ?? '').slice(0, 200),
      uf: r.empresa.uf ? String(r.empresa.uf).slice(0, 2) : null,
      codFin: r.codFin ? String(r.codFin).slice(0, 2) : null,
      nomeArquivo: String(r.nomeArquivo ?? '').slice(0, 250),
      resumo: r as unknown as object,
    };
    await prisma.spedFiscalResumo.upsert({
      where: { companyId_cnpj_ie_ym: { companyId, cnpj, ie, ym: r.ym } },
      update: dados,
      create: { companyId, cnpj, ie, ym: r.ym, ...dados },
    });
    salvos++;
  }
  return NextResponse.json({ salvos });
}

// ?id=<resumo> apaga um mês; ?cnpj=&ie=&ano= apaga o exercício inteiro daquela empresa.
export async function DELETE(req: NextRequest) {
  const auth = await sessao();
  if ('erro' in auth) return auth.erro;
  const companyId = auth.session.currentCompanyId;
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const { count } = await prisma.spedFiscalResumo.deleteMany({ where: { id, companyId } });
    return NextResponse.json({ apagados: count });
  }
  const cnpj = digitos(req.nextUrl.searchParams.get('cnpj'));
  const ie = digitos(req.nextUrl.searchParams.get('ie'));
  const ano = String(req.nextUrl.searchParams.get('ano') ?? '');
  if (!cnpj || !ano) return NextResponse.json({ error: 'Informe o resumo ou a empresa e o ano.' }, { status: 400 });
  const { count } = await prisma.spedFiscalResumo.deleteMany({ where: { companyId, cnpj, ie, ym: { startsWith: ano } } });
  return NextResponse.json({ apagados: count });
}
