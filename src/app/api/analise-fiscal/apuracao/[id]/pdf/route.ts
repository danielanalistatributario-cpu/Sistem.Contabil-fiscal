import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { agregarIcmsPorCfop, somaIcms, calcularResumoApuracao, type RegistroIcms, type CategoriaLancamento, type LancamentoManual } from '@/lib/analise-fiscal-icms-apuracao';

const MARGEM = 40;
const LARGURA_UTIL = 595 - MARGEM * 2; // A4 retrato

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CATEGORIA_LABEL: Record<CategoriaLancamento, string> = {
  OUTROS_DEBITOS: 'Outros Débitos',
  ESTORNO_CREDITOS: 'Estorno de Créditos',
  OUTROS_CREDITOS: 'Outros Créditos',
  ESTORNO_DEBITOS: 'Estorno de Débitos',
  DEDUCOES: 'Deduções',
};

function desenharRegistro(doc: PDFKit.PDFDocument, titulo: string, registro: RegistroIcms) {
  doc.fontSize(11).fillColor('#00753A').text(titulo, { underline: false });
  doc.moveDown(0.3);

  const cols = [
    { label: 'CFOP', width: 45 },
    { label: 'Valores Contábeis', width: 95 },
    { label: 'Base de Cálculo', width: 90 },
    { label: 'ICMS', width: 75 },
    { label: 'Isentas/NT', width: 90 },
    { label: 'Outras', width: 90 },
  ];

  function cabecalho() {
    doc.fontSize(8).fillColor('#fff');
    const y = doc.y;
    doc.rect(MARGEM, y, LARGURA_UTIL, 16).fill('#00753A');
    doc.fillColor('#fff');
    let x = MARGEM;
    for (const c of cols) {
      doc.text(c.label, x + 2, y + 4, { width: c.width - 4, align: c.label === 'CFOP' ? 'left' : 'right' });
      x += c.width;
    }
    doc.fillColor('#000');
    doc.y = y + 18;
  }

  function linha(valores: string[], negrito = false) {
    if (doc.y > 780) {
      doc.addPage();
      cabecalho();
    }
    doc.fontSize(8).font(negrito ? 'Helvetica-Bold' : 'Helvetica');
    const y = doc.y;
    let x = MARGEM;
    for (let i = 0; i < cols.length; i++) {
      doc.text(valores[i], x + 2, y, { width: cols[i].width - 4, align: i === 0 ? 'left' : 'right' });
      x += cols[i].width;
    }
    doc.font('Helvetica');
    doc.y = y + 12;
  }

  cabecalho();
  for (const bucket of [registro.doEstado, registro.outrosEstados, registro.exterior]) {
    if (bucket.linhas.length === 0) continue;
    for (const l of bucket.linhas) {
      linha([l.cfop, fmt(l.valorContabil), fmt(l.baseIcms), fmt(l.valorIcms), fmt(l.isento), fmt(l.baseOutros)]);
    }
    linha([bucket.label, fmt(bucket.subtotal.valorContabil), fmt(bucket.subtotal.baseIcms), fmt(bucket.subtotal.valorIcms), fmt(bucket.subtotal.isento), fmt(bucket.subtotal.baseOutros)], true);
    doc.moveDown(0.2);
  }
  linha(['TOTAIS', fmt(registro.totais.valorContabil), fmt(registro.totais.baseIcms), fmt(registro.totais.valorIcms), fmt(registro.totais.isento), fmt(registro.totais.baseOutros)], true);
  doc.moveDown(0.8);
}

function desenharResumoLinha(doc: PDFKit.PDFDocument, label: string, valor: string | null, negrito = false) {
  doc.fontSize(9).font(negrito ? 'Helvetica-Bold' : 'Helvetica');
  const y = doc.y;
  doc.text(label, MARGEM, y, { width: LARGURA_UTIL - 110 });
  if (valor !== null) doc.text(valor, MARGEM + LARGURA_UTIL - 110, y, { width: 110, align: 'right' });
  doc.font('Helvetica');
  doc.moveDown(0.4);
}

async function gerarPdf(apuracao: {
  periodo: string;
  saldoCredorAnterior: number;
  createdAt: Date;
  company: { name: string; cnpj: string; inscricaoEstadual: string | null };
  entradaApuracaoId: string | null;
  saidaApuracaoId: string | null;
  lancamentos: { categoria: string; descricao: string; valor: number }[];
}): Promise<Buffer> {
  const [registroEntradas, registroSaidas, porEntradasComCredito, porSaidasComDebito] = await Promise.all([
    apuracao.entradaApuracaoId ? agregarIcmsPorCfop(apuracao.entradaApuracaoId, 'entrada') : null,
    apuracao.saidaApuracaoId ? agregarIcmsPorCfop(apuracao.saidaApuracaoId, 'saida') : null,
    apuracao.entradaApuracaoId ? somaIcms(apuracao.entradaApuracaoId, 'entrada') : 0,
    apuracao.saidaApuracaoId ? somaIcms(apuracao.saidaApuracaoId, 'saida') : 0,
  ]);

  const lancamentos: LancamentoManual[] = apuracao.lancamentos.map((l) => ({
    categoria: l.categoria as CategoriaLancamento,
    descricao: l.descricao,
    valor: l.valor,
    ordem: 0,
  }));

  const resumo = calcularResumoApuracao({
    porSaidasComDebito,
    porEntradasComCredito,
    lancamentos,
    saldoCredorAnterior: apuracao.saldoCredorAnterior,
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGEM, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).fillColor('#00753A').text('Livro de Apuração do ICMS');
    doc.fontSize(10).fillColor('#666').text(apuracao.company.name);
    doc.text(
      `Insc. Est.: ${apuracao.company.inscricaoEstadual || '—'}   CNPJ: ${apuracao.company.cnpj}   Período: ${apuracao.periodo}`
    );
    doc.fillColor('#000');
    doc.moveDown(1);

    if (registroEntradas) {
      desenharRegistro(doc, 'ENTRADAS — ICMS por CFOP', registroEntradas);
    }
    if (registroSaidas) {
      desenharRegistro(doc, 'SAÍDAS — ICMS por CFOP', registroSaidas);
    }

    if (doc.y > 650) doc.addPage();
    doc.fontSize(12).fillColor('#00753A').text('Resumo da Apuração do Imposto');
    doc.fillColor('#000');
    doc.moveDown(0.5);

    doc.fontSize(10).font('Helvetica-Bold').text('Débito do Imposto');
    doc.font('Helvetica');
    desenharResumoLinha(doc, '001 — Por saídas/prestações com débito do imposto', fmt(resumo.porSaidasComDebito));
    desenharResumoLinha(doc, '002 — Outros débitos', fmt(resumo.outrosDebitos));
    for (const l of apuracao.lancamentos.filter((l) => l.categoria === 'OUTROS_DEBITOS')) {
      desenharResumoLinha(doc, `        ${l.descricao}`, fmt(l.valor));
    }
    desenharResumoLinha(doc, '003 — Estorno de créditos', fmt(resumo.estornoCreditos));
    for (const l of apuracao.lancamentos.filter((l) => l.categoria === 'ESTORNO_CREDITOS')) {
      desenharResumoLinha(doc, `        ${l.descricao}`, fmt(l.valor));
    }
    desenharResumoLinha(doc, '004 — Sub-total', fmt(resumo.subTotalDebito), true);
    doc.moveDown(0.5);

    doc.fontSize(10).font('Helvetica-Bold').text('Crédito do Imposto');
    doc.font('Helvetica');
    desenharResumoLinha(doc, '005 — Por entradas/aquisições com crédito do imposto', fmt(resumo.porEntradasComCredito));
    desenharResumoLinha(doc, '006 — Outros créditos', fmt(resumo.outrosCreditos));
    for (const l of apuracao.lancamentos.filter((l) => l.categoria === 'OUTROS_CREDITOS')) {
      desenharResumoLinha(doc, `        ${l.descricao}`, fmt(l.valor));
    }
    desenharResumoLinha(doc, '007 — Estorno de débitos', fmt(resumo.estornoDebitos));
    for (const l of apuracao.lancamentos.filter((l) => l.categoria === 'ESTORNO_DEBITOS')) {
      desenharResumoLinha(doc, `        ${l.descricao}`, fmt(l.valor));
    }
    desenharResumoLinha(doc, '008 — Sub-total', fmt(resumo.subTotalCredito), true);
    desenharResumoLinha(doc, '009 — Saldo credor do período anterior', fmt(resumo.saldoCredorAnterior));
    desenharResumoLinha(doc, '010 — Total', fmt(resumo.totalCredito), true);
    doc.moveDown(0.5);

    doc.fontSize(10).font('Helvetica-Bold').text('Apuração do Saldo');
    doc.font('Helvetica');
    desenharResumoLinha(doc, '011 — Saldo devedor (débito menos crédito)', fmt(resumo.saldoDevedor));
    desenharResumoLinha(doc, '012 — Deduções', fmt(resumo.deducoes));
    for (const l of apuracao.lancamentos.filter((l) => l.categoria === 'DEDUCOES')) {
      desenharResumoLinha(doc, `        ${l.descricao}`, fmt(l.valor));
    }
    desenharResumoLinha(doc, '013 — Imposto a recolher', fmt(resumo.impostoARecolher), true);
    desenharResumoLinha(doc, '014 — Saldo credor a transportar p/ período seguinte', fmt(resumo.saldoCredorTransportar), true);

    doc.end();
  });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const apuracao = await prisma.analiseFiscalApuracaoIcms.findUnique({
    where: { id: params.id },
    include: {
      lancamentos: { orderBy: [{ categoria: 'asc' }, { ordem: 'asc' }] },
      company: { select: { name: true, cnpj: true, inscricaoEstadual: true } },
    },
  });

  if (!apuracao || apuracao.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Apuração não encontrada.' }, { status: 404 });
  }

  const buffer = await gerarPdf(apuracao);

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Apuracao_Fiscal_${apuracao.id}.pdf"`,
    },
  });
}
