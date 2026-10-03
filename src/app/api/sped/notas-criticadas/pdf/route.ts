import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';

// PDF das notas de Saída canceladas/inutilizadas/denegadas lidas do COD_SIT
// (C100) do SPED — uma seção por modelo + série (ex: NF-e Série 001,
// NFC-e Série 005). Dados já vêm calculados do navegador; esta rota só
// desenha, mesmo padrão de numeracao/pdf/route.ts.
type NotaRecebida = {
  modeloLabel: string;
  serie: string;
  numero: string;
  situacao: string;
  chave: string;
  dataEmissao: string;
  valor: string;
};

const MARGEM = 40;
const LARGURA_UTIL = 842 - MARGEM * 2; // A4 landscape
const COLS = [
  { key: 'numero', label: 'Número', x: MARGEM, width: 80 },
  { key: 'situacao', label: 'Situação', x: MARGEM + 80, width: 110 },
  { key: 'emissao', label: 'Emissão', x: MARGEM + 190, width: 80 },
  { key: 'valor', label: 'Valor', x: MARGEM + 270, width: 80 },
  { key: 'chave', label: 'Chave NF-e', x: MARGEM + 350, width: LARGURA_UTIL - 350 },
];

function gerarPdf(
  notas: NotaRecebida[],
  meta: { fileName: string; nomeEmpresa: string | null; competencia: string | null }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGEM, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Notas de Saída canceladas / inutilizadas / denegadas (Conversor SPED Fiscal)');
    doc.fontSize(10).fillColor('#666');
    doc.text(`Arquivo: ${meta.fileName}`);
    if (meta.nomeEmpresa) doc.text(`Empresa: ${meta.nomeEmpresa}`);
    if (meta.competencia) doc.text(`Competência: ${meta.competencia}`);
    doc.text(`Total: ${notas.length} nota(s) — lido do COD_SIT do registro C100`);
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
      doc.fontSize(10).fillColor('#888').text('Nenhuma nota de Saída cancelada, inutilizada ou denegada encontrada no arquivo.');
      doc.end();
      return;
    }

    // Agrupa por modelo + série, na ordem em que vieram (o navegador já ordena).
    const grupos = new Map<string, NotaRecebida[]>();
    for (const n of notas) {
      const chave = `${n.modeloLabel}|${n.serie}`;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave)!.push(n);
    }

    for (const lista of grupos.values()) {
      if (doc.y > doc.page.height - MARGEM - 80) doc.addPage();
      doc.x = MARGEM; // a última coluna da tabela anterior deixa doc.x deslocado
      const porSituacao = new Map<string, number>();
      for (const n of lista) porSituacao.set(n.situacao, (porSituacao.get(n.situacao) || 0) + 1);
      doc.fontSize(11).fillColor('#00753A').text(`${lista[0].modeloLabel} · Série ${lista[0].serie} — ${lista.length} nota(s)`);
      doc.fontSize(9).fillColor('#333').text(
        Array.from(porSituacao.entries()).map(([s, q]) => `${s}: ${q}`).join('  ·  ')
      );
      doc.fillColor('#000').moveDown(0.3);

      desenharCabecalho();
      doc.fontSize(7.5);
      for (const n of lista) {
        quebrarPaginaSeNecessario();
        const yInicio = doc.y;
        const linhas: [string, string][] = [
          ['numero', n.numero],
          ['situacao', n.situacao],
          ['emissao', n.dataEmissao || '—'],
          ['valor', n.valor || '—'],
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
      doc.moveDown(1);
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
  const competencia = body?.competencia ? String(body.competencia) : null;

  const buffer = await gerarPdf(notas, { fileName, nomeEmpresa, competencia });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Notas_Saida_Canceladas_Inutilizadas_Denegadas_${fileName.replace(/\.[^.]+$/, '')}.pdf"`,
    },
  });
}
