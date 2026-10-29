// Monta o texto de uma página a partir dos itens que o pdf.js devolve
// (getTextContent). Puro, sem dependência do pdf.js — usado no navegador
// (extrairTextoPdf.ts) e nos scripts de teste em Node.
//
// O pdf.js quebra palavras em vários pedaços quando o PDF ajusta o
// espaçamento entre letras ("202 6 . 0 1 0", "NF - e"). Juntar os pedaços
// sempre com espaço estraga números, datas e códigos — então o espaço só
// entra quando há um vão real entre o fim de um pedaço e o começo do
// próximo, e a quebra de linha quando muda a altura (y).

export type ItemTexto = { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean };

export function textoDaPagina(itens: ItemTexto[]): string {
  let texto = '';
  let fimX: number | null = null;
  let ultimoY: number | null = null;
  for (const it of itens) {
    if (!it.str) {
      if (it.hasEOL) {
        texto += '\n';
        fimX = null;
      }
      continue;
    }
    const x = it.transform[4];
    const y = it.transform[5];
    const fonte = Math.abs(it.transform[3]) || it.height || 10;
    if (ultimoY !== null && Math.abs(y - ultimoY) > fonte * 0.6) {
      if (!texto.endsWith('\n')) texto += '\n';
    } else if (fimX !== null && !texto.endsWith(' ') && !texto.endsWith('\n') && !it.str.startsWith(' ')) {
      const vao = x - fimX;
      if (vao > fonte * 0.18 || vao < -fonte) texto += ' ';
    }
    texto += it.str;
    fimX = x + it.width;
    ultimoY = y;
    if (it.hasEOL) {
      texto += '\n';
      fimX = null;
    }
  }
  return texto
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
