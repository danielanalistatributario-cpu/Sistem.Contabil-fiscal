import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { CSTAT_LABELS } from '@/lib/sf3-situacao-reader';

// PDF do relatório "Notas com Retorno SEFA diferente de 100" — dados já
// vêm prontos do navegador (buscados em /api/sped/notas-retorno-diferente),
// esta rota só desenha.
type NotaRecebida = {
  modeloLabel: string;
  serie: string;
  numero: number;
  cStat: string;
  chave: string | null;
  dataEmissao: string | null;
};

const MARGEM = 40;
const LARGURA_UTIL = 842 - MARGEM * 2; // A4 landscape
const COLS = [
  { key: 'modelo', label: 'Modelo', x: MARGEM, width: 70 },
  { key: 'serie', label: 'Série', x: MARGEM + 70, width: 50 },
  { key: 'numero', label: 'Número', x: MARGEM + 120, width: 70 },
  { key: 'cStat', label: 'Retorno SEFA', x: MARGEM + 190, width: 280 },
  { key: 'emissao', label: 'Emissão', x: MARGEM + 470, width: 70 },
  { key: 'chave', label: 'Chave NF-e', x: MARGEM + 540, width: LARGURA_UTIL - 540 },
];

function fmtData(d: string | null): string {
  if (!d || d.length !== 8) return '—';
  return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`;
}

function gerarPdf(
  notas: NotaRecebida[],
  meta: { fileName: string; nomeEmpresa: string | null; competenciaInicio: string | null; competenciaFim: string | null }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGEM, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Notas com Retorno SEFA diferente de 100 (Auditor SPED Fiscal ICMS/PIS/COFINS)');
    doc.fontSize(10).fillColor('#666');
    doc.text(`Arquivo: ${meta.fileName}`);
    if (meta.nomeEmpresa) doc.text(`Empresa: ${meta.nomeEmpresa}`);
    if (meta.competenciaInicio && meta.competenciaFim) {
      doc.text(`Competência: ${fmtData(meta.competenciaInicio)} a ${fmtData(meta.competenciaFim)}`);
    }
    doc.text(`Total: ${notas.length} nota(s)`);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`);
    doc.fillColor('#000').moveDown(1);

    function desenharCabecalho() {
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
        desenharCabecalho();
      }
    }

    if (notas.length === 0) {
      doc.fontSize(10).fillColor('#888').text('Nenhuma nota com Retorno SEFA diferente de 100 encontrada no período.');
      doc.end();
      return;
    }

    desenharCabecalho();
    doc.fontSize(7.5);
    for (const n of notas) {
      quebrarPaginaSeNecessario();
      const yInicio = doc.y;
      const descricaoCstat = `${n.cStat} — ${CSTAT_LABELS[n.cStat] || 'Código ' + n.cStat}`;
      const linhas: [string, string][] = [
        ['modelo', n.modeloLabel],
        ['serie', n.serie],
        ['numero', String(n.numero)],
        ['cStat', descricaoCstat],
        ['emissao', fmtData(n.dataEmissao)],
        ['chave', n.chave || '—'],
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
  const notas = Array.isArray(body?.notas) ? (body.notas as NotaRecebida[]) : [];
  const fileName = String(body?.fileName || 'arquivo.txt');
  const nomeEmpresa = body?.nomeEmpresa ? String(body.nomeEmpresa) : null;
  const competenciaInicio = body?.competenciaInicio ? String(body.competenciaInicio) : null;
  const competenciaFim = body?.competenciaFim ? String(body.competenciaFim) : null;

  const buffer = await gerarPdf(notas, { fileName, nomeEmpresa, competenciaInicio, competenciaFim });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Retorno_SEFA_Diferente_100_${fileName.replace(/\.[^.]+$/, '')}.pdf"`,
    },
  });
}
