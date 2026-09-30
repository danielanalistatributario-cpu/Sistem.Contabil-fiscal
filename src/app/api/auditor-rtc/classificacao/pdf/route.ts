import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { pesquisarClassificacaoTributaria, type ResultadoPesquisaClassificacao } from '@/lib/auditor-rtc-classificacao';

const MARGEM = 40;
const COLS = [
  { key: 'ncm', label: 'NCM', x: MARGEM, width: 55 },
  { key: 'cclasstrib', label: 'cClassTrib', x: MARGEM + 55, width: 55 },
  { key: 'cst', label: 'CST', x: MARGEM + 110, width: 35 },
  { key: 'anexo', label: 'Anexo', x: MARGEM + 145, width: 60 },
  { key: 'tratamento', label: 'Tratamento', x: MARGEM + 205, width: 220 },
  { key: 'reducao', label: 'Redução', x: MARGEM + 425, width: 55 },
  { key: 'fundamento', label: 'Fundamento legal', x: MARGEM + 480, width: 175 },
];

function gerarPdf(resultado: ResultadoPesquisaClassificacao): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGEM, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Pesquisa de Classificação Tributária do Produto — Reforma Tributária (IBS/CBS)');
    doc.fontSize(10).fillColor('#666');
    const criterios = [
      resultado.descricaoPesquisada ? `Descrição: "${resultado.descricaoPesquisada}"` : null,
      resultado.ncmPesquisado ? `NCM: ${resultado.ncmPesquisado}` : null,
    ].filter(Boolean).join('  ·  ');
    doc.text(criterios || 'Sem critério informado');
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`);
    doc.moveDown(1);

    function desenharCabecalho() {
      doc.fontSize(8).fillColor('#fff');
      const y = doc.y;
      doc.rect(MARGEM, y, COLS[COLS.length - 1].x + COLS[COLS.length - 1].width - MARGEM, 16).fill('#00753A');
      doc.fillColor('#fff');
      for (const col of COLS) doc.text(col.label, col.x + 3, y + 4, { width: col.width - 6 });
      doc.fillColor('#000');
      doc.y = y + 18;
    }
    function quebrarPaginaSeNecessario() {
      if (doc.y > doc.page.height - MARGEM - 40) {
        doc.addPage();
        desenharCabecalho();
      }
    }

    if (resultado.resultadosNcm.length > 0) {
      desenharCabecalho();
      doc.fontSize(7.5);
      for (const r of resultado.resultadosNcm) {
        quebrarPaginaSeNecessario();
        const yInicio = doc.y;
        const linhas: [string, string][] = [
          ['ncm', r.ncm],
          ['cclasstrib', r.cclasstribCodigo],
          ['cst', r.cclasstrib.cstCodigo],
          ['anexo', r.anexo || '—'],
          ['tratamento', r.cclasstrib.descricao],
          ['reducao', r.cclasstrib.percentualReducao != null ? `${(r.cclasstrib.percentualReducao * 100).toFixed(0)}%` : '—'],
          ['fundamento', r.fundamentoLegal || r.cclasstrib.fundamentoLegal || '—'],
        ];
        let maxAltura = 12;
        for (const [key, texto] of linhas) {
          const col = COLS.find((c) => c.key === key)!;
          maxAltura = Math.max(maxAltura, doc.heightOfString(texto, { width: col.width - 6 }));
        }
        for (const [key, texto] of linhas) {
          const col = COLS.find((c) => c.key === key)!;
          doc.text(texto, col.x + 3, yInicio, { width: col.width - 6 });
        }
        doc.y = yInicio + maxAltura + 5;
        doc.moveTo(MARGEM, doc.y - 3).lineTo(COLS[COLS.length - 1].x + COLS[COLS.length - 1].width, doc.y - 3).strokeColor('#eee').stroke();
      }
      doc.moveDown(1);
    } else if (resultado.ncmPesquisado && resultado.avisoPadrao) {
      doc.fontSize(9).fillColor('#9C6500').text(
        `NCM ${resultado.ncmPesquisado} não encontrado em nenhum Anexo de tratamento diferenciado — aplica-se o tratamento padrão: cClassTrib ${resultado.avisoPadrao.codigo} (${resultado.avisoPadrao.descricao}), CST ${resultado.avisoPadrao.cstCodigo}.`,
        { width: COLS[COLS.length - 1].x + COLS[COLS.length - 1].width - MARGEM }
      );
      doc.fillColor('#000').moveDown(1);
    }

    if (resultado.resultadosCclasstrib.length > 0) {
      doc.fontSize(11).text('Regimes/tratamentos encontrados pela descrição (sem NCM específico vinculado):');
      doc.moveDown(0.3);
      doc.fontSize(8);
      for (const c of resultado.resultadosCclasstrib) {
        quebrarPaginaSeNecessario();
        doc.text(`${c.codigo} (CST ${c.cstCodigo}) — ${c.descricao}${c.fundamentoLegal ? ' — ' + c.fundamentoLegal : ''}`, { width: COLS[COLS.length - 1].x + COLS[COLS.length - 1].width - MARGEM });
      }
    }

    if (resultado.resultadosNcm.length === 0 && resultado.resultadosCclasstrib.length === 0 && !resultado.avisoPadrao) {
      doc.fontSize(10).fillColor('#888').text('Nenhum resultado encontrado para os critérios informados.');
    }

    doc.end();
  });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'auditorRtc')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const descricao = (searchParams.get('descricao') || '').trim();
  const ncm = (searchParams.get('ncm') || '').trim();
  if (!descricao && !ncm) {
    return NextResponse.json({ error: 'Informe a descrição do produto ou o NCM.' }, { status: 400 });
  }

  const resultado = await pesquisarClassificacaoTributaria(descricao, ncm);
  const buffer = await gerarPdf(resultado);

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Classificacao_Tributaria_${ncm || 'pesquisa'}.pdf"`,
    },
  });
}
