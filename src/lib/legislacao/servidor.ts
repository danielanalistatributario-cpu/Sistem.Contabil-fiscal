import { NextResponse } from 'next/server';
import { getSession, type SessionUser } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { proximoModelo, modeloDaAnalise, type ModeloVisual } from './modelos';
import type { DocumentoEntrada } from './ia';

// Utilidades das rotas /api/legislacao/*.

export async function sessaoLegislacao(): Promise<{ session: SessionUser & { currentCompanyId: string } } | { erro: NextResponse }> {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return { erro: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };
  }
  if (!canAccess(session.currentRole, 'legislacao')) {
    return { erro: NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 }) };
  }
  return { session: session as SessionUser & { currentCompanyId: string } };
}

// Rodízio de modelos visuais: a análise nova recebe o modelo seguinte ao
// da última análise da empresa, pra os comunicados variarem.
export async function modeloParaNovaAnalise(companyId: string): Promise<ModeloVisual> {
  const ultima = await prisma.legislacaoAnalise.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' }, select: { id: true, resultado: true } });
  if (!ultima) return 'corporativo';
  return proximoModelo(modeloDaAnalise(ultima.id, (ultima.resultado as { modeloVisual?: unknown } | null)?.modeloVisual));
}

const MAX_PAGINAS_TEXTO = 1500;

// Lê um documento do FormData: ou o PDF (`<prefixo>arquivo`), ou o texto
// já extraído no navegador (`<prefixo>textoPaginas`, JSON string[]) quando
// o PDF é grande demais pro limite de upload.
export async function lerDocumentoDoForm(form: FormData, prefixo = ''): Promise<{ doc: DocumentoEntrada; paginas: number | null; leituraTexto: boolean } | { erro: string }> {
  const nome = String(form.get(`${prefixo}nome`) || '').trim();
  const arquivo = form.get(`${prefixo}arquivo`);
  const textoPaginas = form.get(`${prefixo}textoPaginas`);

  if (arquivo && typeof arquivo !== 'string') {
    const buf = Buffer.from(await arquivo.arrayBuffer());
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return { erro: `"${arquivo.name}" não é um PDF válido.` };
    const paginas = contarPaginasPdf(buf);
    return { doc: { nome: nome || arquivo.name, pdfBase64: buf.toString('base64') }, paginas, leituraTexto: false };
  }
  if (typeof textoPaginas === 'string' && textoPaginas) {
    let paginas: unknown;
    try {
      paginas = JSON.parse(textoPaginas);
    } catch {
      return { erro: 'Texto do PDF inválido.' };
    }
    if (!Array.isArray(paginas) || paginas.length === 0 || paginas.length > MAX_PAGINAS_TEXTO || !paginas.every((p) => typeof p === 'string')) {
      return { erro: 'Texto do PDF inválido.' };
    }
    const totalChars = (paginas as string[]).reduce((s, p) => s + p.trim().length, 0);
    if (totalChars < 200) {
      return { erro: 'O PDF parece ser escaneado (sem texto selecionável) e é grande demais para envio como imagem. Envie uma versão menor (até 4 MB) ou só as páginas de interesse.' };
    }
    return { doc: { nome: nome || 'documento.pdf', paginasTexto: paginas as string[] }, paginas: paginas.length, leituraTexto: true };
  }
  return { erro: 'Nenhum arquivo enviado.' };
}

// Contagem aproximada de páginas lendo os objetos /Type /Page do PDF
// (sem dependência extra). Só pra informação no histórico.
function contarPaginasPdf(buf: Buffer): number | null {
  const s = buf.toString('latin1');
  const m = s.match(/\/Type\s*\/Page(?!s)/g);
  return m ? m.length : null;
}

// Resposta em NDJSON: a análise leva de 30s a alguns minutos, então o
// navegador recebe progresso ("caracteres gerados") enquanto a IA
// trabalha, e no fim o id da análise salva.
export function respostaStreaming(executar: (enviar: (evento: Record<string, unknown>) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fechado = false;
      const enviar = (evento: Record<string, unknown>) => {
        if (!fechado) controller.enqueue(encoder.encode(JSON.stringify(evento) + '\n'));
      };
      // Mantém a conexão viva durante a fase em que a IA só "pensa".
      const batimento = setInterval(() => enviar({ tipo: 'aguardando' }), 5000);
      try {
        await executar(enviar);
      } catch (e) {
        enviar({ tipo: 'erro', mensagem: e instanceof Error ? e.message : 'Erro inesperado.' });
      } finally {
        clearInterval(batimento);
        fechado = true;
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// Envia progresso no máximo 1x por segundo.
export function progressoThrottled(enviar: (evento: Record<string, unknown>) => void) {
  let ultimo = 0;
  return (caracteres: number) => {
    const agora = Date.now();
    if (agora - ultimo < 1000) return;
    ultimo = agora;
    enviar({ tipo: 'progresso', caracteres });
  };
}
