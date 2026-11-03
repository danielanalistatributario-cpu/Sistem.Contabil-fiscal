import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sessaoValidadorXml } from '@/lib/validador-xml/servidor';
import { saneNorma } from '@/lib/validador-xml/sanear';
import type { RegraNorma } from '@/lib/validador-xml/tipos';

export const dynamic = 'force-dynamic';

function resumoRegras(regras: RegraNorma[]) {
  return {
    total: regras.length,
    executaveis: regras.filter((r) => r.exec && r.situacao !== 'REMOVIDA').length,
    catalogadas: regras.filter((r) => !r.exec && r.situacao !== 'REMOVIDA').length,
    futuras: regras.filter((r) => r.situacao === 'FUTURA').length,
    removidas: regras.filter((r) => r.situacao === 'REMOVIDA').length,
  };
}

export async function GET() {
  const auth = await sessaoValidadorXml();
  if ('erro' in auth) return auth.erro;
  const normas = await prisma.normaXml.findMany({
    where: { companyId: auth.session.currentCompanyId },
    orderBy: [{ numero: 'desc' }, { versao: 'desc' }],
    select: {
      id: true, tipo: true, numero: true, versao: true, titulo: true, documentos: true, modelos: true, arquivoNome: true, paginas: true,
      homologacaoEm: true, producaoEm: true, situacao: true, userName: true, createdAt: true, regras: true,
      _count: { select: { validacoes: true } },
    },
  });
  return NextResponse.json({
    normas: normas.map(({ regras, _count, ...n }) => ({ ...n, resumo: resumoRegras(regras as unknown as RegraNorma[]), validacoes: _count.validacoes })),
  });
}

// Cadastra (ou substitui) a norma extraída no navegador. Nada é interpretado
// aqui — só saneado e gravado; o PDF não é guardado.
export async function POST(req: NextRequest) {
  const auth = await sessaoValidadorXml();
  if ('erro' in auth) return auth.erro;
  const body = await req.json().catch(() => null);
  const norma = saneNorma(body?.norma);
  if ('erro' in norma) return NextResponse.json({ error: norma.erro }, { status: 400 });

  const companyId = auth.session.currentCompanyId;
  const existente = await prisma.normaXml.findUnique({
    where: { companyId_numero_versao: { companyId, numero: norma.numero, versao: norma.versao } },
    select: { id: true },
  });
  if (existente && body?.substituir !== true) {
    return NextResponse.json({ error: `${norma.numero} versão ${norma.versao} já está cadastrada.`, existe: true, id: existente.id }, { status: 409 });
  }

  const dados = {
    tipo: norma.tipo,
    titulo: norma.titulo || null,
    documentos: norma.documentos.join('/'),
    modelos: norma.modelos.join(','),
    arquivoNome: typeof body?.arquivoNome === 'string' ? body.arquivoNome.slice(0, 200) : null,
    paginas: Number.isInteger(body?.paginas) ? (body.paginas as number) : null,
    homologacaoEm: norma.homologacaoEm,
    producaoEm: norma.producaoEm,
    situacao: 'ATIVA',
    marcos: norma.marcos as object[],
    campos: norma.campos as object[],
    regras: norma.regras as object[],
    userId: auth.session.id,
    userName: auth.session.name,
  };
  const salva = existente
    ? await prisma.normaXml.update({ where: { id: existente.id }, data: dados, select: { id: true } })
    : await prisma.normaXml.create({ data: { companyId, numero: norma.numero, versao: norma.versao, ...dados }, select: { id: true } });
  return NextResponse.json({ id: salva.id, resumo: resumoRegras(norma.regras) });
}
