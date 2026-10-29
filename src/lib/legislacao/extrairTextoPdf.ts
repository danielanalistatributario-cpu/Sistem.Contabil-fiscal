'use client';

// Extrai o texto de cada página de um PDF no navegador (pdf.js). Usado
// só quando o PDF é grande demais pro limite de upload da Vercel (~4,5MB
// por requisição): em vez do arquivo, vai pro servidor o texto página a
// página — perde imagens e parte da estrutura das tabelas, mas mantém a
// numeração das páginas pra rastreabilidade.

export const LIMITE_UPLOAD_PDF = 4 * 1024 * 1024; // folga sob os 4,5MB da Vercel (o multipart soma cabeçalhos)

export async function extrairTextoPdf(arquivo: File, onPagina?: (atual: number, total: number) => void): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  // Worker servido de public/ (cópia de node_modules/pdfjs-dist/build/
  // pdf.worker.min.mjs, mesma versão 4.10.38 do package.json): deixar o
  // webpack empacotar via `new URL(..., import.meta.url)` funciona no
  // `next dev` mas quebra o `next build` (o Terser não minifica o .mjs).
  // Ao atualizar o pdfjs-dist, copiar o worker de novo.
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const dados = new Uint8Array(await arquivo.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: dados }).promise;
  const paginas: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const conteudo = await pagina.getTextContent();
    let texto = '';
    for (const item of conteudo.items) {
      if (!('str' in item)) continue;
      texto += item.str + (item.hasEOL ? '\n' : ' ');
    }
    paginas.push(texto.replace(/[ \t]+/g, ' ').trim());
    onPagina?.(n, pdf.numPages);
  }
  await pdf.destroy();
  return paginas;
}
