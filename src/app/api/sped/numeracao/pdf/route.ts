import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { STATUS_SF3_LABELS } from '@/lib/sped-numeracao';

// PDF da Análise de Numeração — Saída (ver sped-numeracao.ts). Os dados
// já vêm prontos do navegador (calculados lá, cruzando SPED + Protheus)
// — esta rota só desenha, não recalcula nada, mesmo padrão de
// auditor-rtc/classificacao/pdf/route.ts.
type ItemNumeracaoRecebido = {
  numero: number;
  categoria: string;
  situacaoDetalhe: string | null;
  fonte: string | null;
  statusSf3?: string;
  cfopsSf3?: string | null;
  cStatSf3?: string | null;
};
type GrupoRecebido = {
  modeloLabel: string;
  serie: string;
  numeroMinimo: number;
  numeroMaximo: number;
  totalEsperado: number;
  qtdAutorizadas: number;
  qtdCanceladas: number;
  qtdInutilizadas: number;
  qtdDenegadas: number;
  qtdNaoLocalizadas: number;
  qtdResolvidasPorSf3: number;
  intervaloGrandeDemais: boolean;
  faltantes: ItemNumeracaoRecebido[];
};

const MARGEM = 40;
const LARGURA_UTIL = 842 - MARGEM * 2; // A4 landscape

function gerarPdf(grupos: GrupoRecebido[], meta: { fileName: string; nomeEmpresa: string | null; competencia: string | null }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGEM, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Análise de Numeração — Saída (Auditor SPED Fiscal ICMS/PIS/COFINS)');
    doc.fontSize(10).fillColor('#666');
    doc.text(`Arquivo: ${meta.fileName}`);
    if (meta.nomeEmpresa) doc.text(`Empresa: ${meta.nomeEmpresa}`);
    if (meta.competencia) doc.text(`Competência: ${meta.competencia}`);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`);
    doc.fillColor('#000').moveDown(1);

    const COLS = [
      { key: 'numero', label: 'Número', x: MARGEM, width: 60 },
      { key: 'categoria', label: 'Situação', x: MARGEM + 60, width: 130 },
      { key: 'fonte', label: 'Fonte', x: MARGEM + 190, width: 85 },
      { key: 'sf3', label: 'No SF3?', x: MARGEM + 275, width: 125 },
      { key: 'cfop', label: 'CFOP (SF3)', x: MARGEM + 400, width: 95 },
      { key: 'detalhe', label: 'Detalhe', x: MARGEM + 495, width: LARGURA_UTIL - 495 },
    ];

    function desenharCabecalhoTabela() {
      doc.fontSize(8).fillColor('#fff');
      const y = doc.y;
      doc.rect(MARGEM, y, LARGURA_UTIL, 16).fill('#00753A');
      doc.fillColor('#fff');
      for (const col of COLS) doc.text(col.label, col.x + 3, y + 4, { width: col.width - 6 });
      doc.fillColor('#000');
      doc.y = y + 18;
    }
    function quebrarPaginaSeNecessario() {
      if (doc.y > doc.page.height - MARGEM - 40) {
        doc.addPage();
        desenharCabecalhoTabela();
      }
    }

    for (const g of grupos) {
      // Quebra de página manual aqui (não quebrarPaginaSeNecessario): essa
      // função redesenha o cabeçalho da TABELA, que ficaria acima do título
      // do grupo.
      if (doc.y > doc.page.height - MARGEM - 80) doc.addPage();
      doc.x = MARGEM; // a última coluna da tabela anterior deixa doc.x deslocado
      doc.fontSize(11).fillColor('#00753A').text(
        `${g.modeloLabel} · Série ${g.serie} — nº ${g.numeroMinimo} a ${g.numeroMaximo} (${g.totalEsperado} esperado(s))`
      );
      doc.fontSize(9).fillColor('#333').text(
        `Autorizadas: ${g.qtdAutorizadas}  ·  Canceladas: ${g.qtdCanceladas}  ·  Inutilizadas: ${g.qtdInutilizadas}  ·  Denegadas: ${g.qtdDenegadas}  ·  Quebra de sequencial/Faltantes: ${g.qtdNaoLocalizadas}${g.qtdResolvidasPorSf3 > 0 ? `  ·  Resolvidas pelo Protheus: ${g.qtdResolvidasPorSf3}` : ''}`
      );
      doc.fillColor('#000').moveDown(0.3);

      if (g.intervaloGrandeDemais) {
        doc.fontSize(9).fillColor('#9C6500').text('Intervalo grande demais pra listar um a um — confira o número da nota lido nesta série.');
        doc.fillColor('#000').moveDown(0.5);
        continue;
      }

      if (g.faltantes.length === 0) {
        doc.fontSize(9).fillColor('#1E7A54').text('Nenhum número faltante — sequência completa.');
        doc.fillColor('#000').moveDown(0.5);
        continue;
      }

      desenharCabecalhoTabela();
      doc.fontSize(8);
      for (const f of g.faltantes) {
        quebrarPaginaSeNecessario();
        const yInicio = doc.y;
        const linhas: [string, string][] = [
          ['numero', String(f.numero)],
          ['categoria', f.categoria],
          ['fonte', f.fonte === 'SF3' ? 'Planilha/Protheus' : 'SPED'],
          ['sf3', STATUS_SF3_LABELS[f.statusSf3 as keyof typeof STATUS_SF3_LABELS] || '—'],
          ['cfop', f.cfopsSf3 ? f.cfopsSf3.split(',').join(', ') : '—'],
          ['detalhe', f.situacaoDetalhe || '—'],
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
        doc.moveTo(MARGEM, doc.y - 3).lineTo(MARGEM + LARGURA_UTIL, doc.y - 3).strokeColor('#eee').stroke();
      }
      doc.moveDown(1);
    }

    if (grupos.length === 0) {
      doc.fontSize(10).fillColor('#888').text('Nenhum grupo (modelo + série) de Saída encontrado neste arquivo.');
    }

    doc.end();
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'sped')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const grupos = Array.isArray(body?.grupos) ? (body.grupos as GrupoRecebido[]) : [];
  const fileName = String(body?.fileName || 'arquivo.txt');
  const nomeEmpresa = body?.nomeEmpresa ? String(body.nomeEmpresa) : null;
  const competencia = body?.competencia ? String(body.competencia) : null;

  const buffer = await gerarPdf(grupos, { fileName, nomeEmpresa, competencia });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Analise_Numeracao_${fileName.replace(/\.[^.]+$/, '')}.pdf"`,
    },
  });
}
