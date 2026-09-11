// Helper compartilhado pra ler um workbook Excel que pode ter mais de uma
// aba — o leitor sempre assumiu `wb.SheetNames[0]` (a primeira aba), mas
// isso já quebrou duas vezes com dado real: o usuário adiciona abas
// próprias de análise (tabela dinâmica, cópia com ajustes etc.) na
// frente da aba real do relatório ("NF-e de Entrada e Saída"), empurrando
// os dados de verdade pra uma aba mais adiante. Em vez de travar em
// SheetNames[0], tenta cada aba em ordem e usa a primeira que o leitor
// aceita (sem erro e com linhas) — silenciosamente resiliente a abas
// extras antes ou depois da aba real, sem exigir nenhuma ação do usuário.
import * as XLSX from 'xlsx';

export function lerPrimeiraAbaValida<T>(
  wb: XLSX.WorkBook,
  ler: (aoa: unknown[][]) => { rows: T[]; erro: string | null }
): { rows: T[]; erro: string | null } {
  let primeiroErro: string | null = null;
  for (const nome of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: true, defval: null }) as unknown[][];
    const resultado = ler(aoa);
    if (!resultado.erro && resultado.rows.length > 0) return resultado;
    if (primeiroErro === null && resultado.erro) primeiroErro = resultado.erro;
  }
  return { rows: [], erro: primeiroErro ?? 'Não foi possível localizar dados em nenhuma aba da planilha.' };
}
