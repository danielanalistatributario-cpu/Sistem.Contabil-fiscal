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
  for (const l of registro.linhas) {
    linha([l.cfop, fmt(l.valorContabil), fmt(l.baseIcms), fmt(l.valorIcms), fmt(l.isento), fmt(l.baseOutros)]);
  }
  linha(['TOTAIS', fmt(registro.totais.valorContabil), fmt(registro.totais.baseIcms), fmt(registro.totais.valorIcms), fmt(registro.totais.isento), fmt(registro.totais.baseOutros)], true);
  doc.moveDown(0.8);
}

// Réplica da estrutura "Descrição | Coluna Auxiliar | Soma" do Resumo da
// Apuração do imposto real: `auxiliar` só aparece nas linhas
// discriminadas (um lançamento manual por linha) e `soma` só aparece nas
// linhas numeradas (001-014) — mesma convenção do livro fiscal.
const COL_AUXILIAR_W = 85;
const COL_SOMA_W = 85;

function desenharResumoLinha(
  doc: PDFKit.PDFDocument,
  label: string,
  { auxiliar, soma, negrito = false, indent = false }: { auxiliar?: string | null; soma?: string | null; negrito?: boolean; indent?: boolean }
) {
  doc.fontSize(9).font(negrito ? 'Helvetica-Bold' : 'Helvetica');
  const y = doc.y;
  const xSoma = MARGEM + LARGURA_UTIL - COL_SOMA_W;
  const xAuxiliar = xSoma - COL_AUXILIAR_W;
  doc.text(label, MARGEM + (indent ? 14 : 0), y, { width: xAuxiliar - MARGEM - (indent ? 14 : 0) - 6 });
  if (auxiliar) doc.text(auxiliar, xAuxiliar, y, { width: COL_AUXILIAR_W - 6, align: 'right' });
  if (soma) doc.text(soma, xSoma, y, { width: COL_SOMA_W, align: 'right' });
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

    // Resumo sempre numa página nova e própria, com cada seção
    // (Débito/Crédito/Saldo) num quadro fechado (faixa verde de título +
    // borda ao redor) — a pedido do usuário, pra caber tudo numa página só.
    doc.addPage();
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#00753A').text('Resumo da Apuração do Imposto', { align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor('#666').text(
      `${apuracao.company.name}   ·   Período: ${apuracao.periodo}`,
      { align: 'center' }
    );
    doc.fillColor('#000');
    doc.moveDown(1.2);

    // desenha uma categoria "NNN — Título (discriminar abaixo)": some no
    // total direto se não houver lançamento, senão o total aparece só na
    // coluna Soma da última linha discriminada — mesma convenção do
    // documento original.
    function categoria(numero: string, titulo: string, cat: CategoriaLancamento, total: number) {
      const itens = apuracao.lancamentos.filter((l) => l.categoria === cat);
      if (itens.length === 0) {
        desenharResumoLinha(doc, `${numero} — ${titulo}`, { soma: fmt(total) });
        return;
      }
      desenharResumoLinha(doc, `${numero} — ${titulo} (discriminar abaixo)`, {});
      itens.forEach((l, idx) => {
        desenharResumoLinha(doc, l.descricao, {
          auxiliar: fmt(l.valor),
          soma: idx === itens.length - 1 ? fmt(total) : null,
          indent: true,
        });
      });
    }

    // Um "quadrado" por seção: faixa verde com o título, cabeçalho das
    // colunas, o conteúdo (via callback) e por fim uma borda ao redor de
    // tudo — desenhada depois do conteúdo pra não cobrir o texto.
    function desenharCaixaSecao(titulo: string, desenharConteudo: () => void) {
      const yInicio = doc.y;
      doc.rect(MARGEM, yInicio, LARGURA_UTIL, 20).fill('#00753A');
      doc.fillColor('#fff').fontSize(11).font('Helvetica-Bold').text(titulo, MARGEM + 10, yInicio + 5);
      doc.fillColor('#000').font('Helvetica');
      doc.y = yInicio + 28;

      doc.fontSize(7).fillColor('#888');
      doc.text('Coluna Auxiliar', MARGEM + LARGURA_UTIL - COL_SOMA_W - COL_AUXILIAR_W, doc.y, { width: COL_AUXILIAR_W - 6, align: 'right' });
      doc.text('Soma', MARGEM + LARGURA_UTIL - COL_SOMA_W, doc.y, { width: COL_SOMA_W, align: 'right' });
      doc.fillColor('#000');
      doc.moveDown(0.7);

      desenharConteudo();

      const yFim = doc.y + 8;
      doc.rect(MARGEM, yInicio, LARGURA_UTIL, yFim - yInicio).lineWidth(1).stroke('#00753A');
      doc.y = yFim + 16;
    }

    desenharCaixaSecao('DÉBITO DO IMPOSTO', () => {
      desenharResumoLinha(doc, '001 — Por saídas/prestações com débito do imposto', { soma: fmt(resumo.porSaidasComDebito) });
      categoria('002', 'Outros débitos', 'OUTROS_DEBITOS', resumo.outrosDebitos);
      categoria('003', 'Estorno de créditos', 'ESTORNO_CREDITOS', resumo.estornoCreditos);
      desenharResumoLinha(doc, '004 — Sub-total', { soma: fmt(resumo.subTotalDebito), negrito: true });
    });

    desenharCaixaSecao('CRÉDITO DO IMPOSTO', () => {
      desenharResumoLinha(doc, '005 — Por entradas/aquisições com crédito do imposto', { soma: fmt(resumo.porEntradasComCredito) });
      categoria('006', 'Outros créditos', 'OUTROS_CREDITOS', resumo.outrosCreditos);
      categoria('007', 'Estorno de débitos', 'ESTORNO_DEBITOS', resumo.estornoDebitos);
      desenharResumoLinha(doc, '008 — Sub-total', { soma: fmt(resumo.subTotalCredito), negrito: true });
      desenharResumoLinha(doc, '009 — Saldo credor do período anterior', { soma: fmt(resumo.saldoCredorAnterior) });
      desenharResumoLinha(doc, '010 — Total', { soma: fmt(resumo.totalCredito), negrito: true });
    });

    desenharCaixaSecao('APURAÇÃO DO SALDO', () => {
      desenharResumoLinha(doc, '011 — Saldo devedor (débito menos crédito)', { soma: fmt(resumo.saldoDevedor) });
      categoria('012', 'Deduções', 'DEDUCOES', resumo.deducoes);
      desenharResumoLinha(doc, '013 — Imposto a recolher', { soma: fmt(resumo.impostoARecolher), negrito: true });
      desenharResumoLinha(doc, '014 — Saldo credor a transportar p/ período seguinte', { soma: fmt(resumo.saldoCredorTransportar), negrito: true });
    });

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
