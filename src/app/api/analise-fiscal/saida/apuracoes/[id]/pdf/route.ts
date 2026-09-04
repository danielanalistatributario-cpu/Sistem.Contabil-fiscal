import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SEVERIDADE_LABEL: Record<string, string> = {
  CRITICO: 'Crítico',
  ALTO: 'Alto',
  MEDIO: 'Médio',
  BAIXO: 'Baixo',
  INFORMATIVO: 'Informativo',
};
const SEVERIDADE_ORDEM = ['CRITICO', 'ALTO', 'MEDIO', 'BAIXO', 'INFORMATIVO'];

const MARGEM = 40;
const COLS = [
  { key: 'severidade', label: 'Severidade', x: MARGEM, width: 55 },
  { key: 'nota', label: 'Nota', x: MARGEM + 55, width: 55 },
  { key: 'tes', label: 'TES', x: MARGEM + 110, width: 35 },
  { key: 'motivo', label: 'Motivo', x: MARGEM + 145, width: 210 },
  { key: 'sugestao', label: 'Sugestão', x: MARGEM + 355, width: 155 },
];

function gerarPdf(apuracao: {
  periodo: string | null;
  fileName: string | null;
  processedAt: Date;
  totalLinhas: number;
  totalNotas: number;
  totalDivergencias: number;
  qtdCritico: number;
  qtdAlto: number;
  qtdMedio: number;
  qtdBaixo: number;
  itens: { numeroNf: string | null; linha: number; tes: string; divergencias: { severidade: string; motivo: string; sugestaoCorrecao: string | null }[] }[];
}, companyName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGEM, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Análise e Apuração Fiscal — Saídas — Divergências', { align: 'left' });
    doc.fontSize(10).fillColor('#666').text(companyName);
    doc.text(
      `${apuracao.periodo ? apuracao.periodo + ' — ' : ''}${apuracao.fileName || ''}  ·  processado em ${apuracao.processedAt.toLocaleString('pt-BR')}`
    );
    doc.moveDown(0.5);
    doc.fillColor('#333').fontSize(10).text(
      `${apuracao.totalLinhas} linha(s) · ${apuracao.totalNotas} nota(s) · ${apuracao.totalDivergencias} divergência(s) — ` +
        `${apuracao.qtdCritico} crítica(s), ${apuracao.qtdAlto} alta(s), ${apuracao.qtdMedio} média(s), ${apuracao.qtdBaixo} baixa(s)`
    );
    doc.moveDown(1);

    const divergencias = apuracao.itens
      .flatMap((item) => item.divergencias.map((d) => ({ ...d, numeroNf: item.numeroNf, linha: item.linha, tes: item.tes })))
      .sort((a, b) => SEVERIDADE_ORDEM.indexOf(a.severidade) - SEVERIDADE_ORDEM.indexOf(b.severidade));

    function desenharCabecalho() {
      doc.fontSize(9).fillColor('#fff');
      const y = doc.y;
      doc.rect(MARGEM, y, COLS[COLS.length - 1].x + COLS[COLS.length - 1].width - MARGEM, 18).fill('#00753A');
      doc.fillColor('#fff');
      for (const col of COLS) {
        doc.text(col.label, col.x + 3, y + 5, { width: col.width - 6 });
      }
      doc.fillColor('#000');
      doc.y = y + 20;
    }

    function quebrarPaginaSeNecessario() {
      if (doc.y > doc.page.height - MARGEM - 40) {
        doc.addPage();
        desenharCabecalho();
      }
    }

    desenharCabecalho();
    doc.fontSize(8);
    for (const d of divergencias) {
      quebrarPaginaSeNecessario();
      const yInicio = doc.y;
      const linhas: [string, string][] = [
        ['severidade', SEVERIDADE_LABEL[d.severidade] || d.severidade],
        ['nota', d.numeroNf || `Linha ${d.linha}`],
        ['tes', d.tes],
        ['motivo', d.motivo],
        ['sugestao', d.sugestaoCorrecao || '—'],
      ];
      let maxAltura = 12;
      for (const [key, texto] of linhas) {
        const col = COLS.find((c) => c.key === key)!;
        const altura = doc.heightOfString(texto, { width: col.width - 6 });
        maxAltura = Math.max(maxAltura, altura);
      }
      for (const [key, texto] of linhas) {
        const col = COLS.find((c) => c.key === key)!;
        doc.text(texto, col.x + 3, yInicio, { width: col.width - 6 });
      }
      doc.y = yInicio + maxAltura + 6;
      doc.moveTo(MARGEM, doc.y - 3).lineTo(COLS[COLS.length - 1].x + COLS[COLS.length - 1].width, doc.y - 3).strokeColor('#eee').stroke();
    }

    if (divergencias.length === 0) {
      doc.fontSize(10).fillColor('#888').text('Nenhuma divergência encontrada nesta apuração.');
    }

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

  const apuracao = await prisma.analiseFiscalSaidaApuracao.findUnique({
    where: { id: params.id },
    include: {
      itens: {
        where: { divergencias: { some: {} } },
        orderBy: { linha: 'asc' },
        select: { numeroNf: true, linha: true, tes: true, divergencias: true },
      },
      company: true,
    },
  });

  if (!apuracao || apuracao.companyId !== session.currentCompanyId) {
    return NextResponse.json({ error: 'Apuração não encontrada.' }, { status: 404 });
  }

  const buffer = await gerarPdf(apuracao, apuracao.company.name);

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Analise_Fiscal_Saidas_Divergencias_${apuracao.id}.pdf"`,
    },
  });
}
