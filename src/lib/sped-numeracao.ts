// Análise de numeração das notas de Saída (C100) lidas do SPED — pedido
// explícito do usuário: identificar números faltantes na sequência e
// separar em Autorizada × Cancelada × Inutilizada × Denegada ×
// Não localizada. "Não localizada" é um número dentro do intervalo
// mín-máx da série que simplesmente não aparece em nenhum C100 do
// arquivo — pode ser uma nota que existe na Sefaz mas não foi
// escriturada neste SPED, ou nunca ter sido emitida; o arquivo sozinho
// não distingue os dois casos, por isso o rótulo é "não localizada", não
// "nunca emitida".

import type { NotaSaida } from './sped-parser';

export type CategoriaNumeracao = 'Autorizada' | 'Cancelada' | 'Inutilizada' | 'Denegada' | 'Não localizada';

// COD_SIT 00/01/06/07/08 representam documento válido (regular,
// complementar ou regime especial) — todos contam como "Autorizada" pra
// fins desta análise de sequência. 02/03 = Cancelada, 04 = Denegada,
// 05 = Inutilizada (ver COD_SIT_LABELS em sped-parser.ts pra tabela
// completa e a ressalva sobre 04/05 terem deixado de ser obrigatórios
// na escrituração a partir de 01/2023).
const COD_SIT_CATEGORIA: Record<string, CategoriaNumeracao> = {
  '00': 'Autorizada',
  '01': 'Autorizada',
  '02': 'Cancelada',
  '03': 'Cancelada',
  '04': 'Denegada',
  '05': 'Inutilizada',
  '06': 'Autorizada',
  '07': 'Autorizada',
  '08': 'Autorizada',
};

export const COD_MOD_LABELS: Record<string, string> = {
  '55': 'NF-e',
  '65': 'NFC-e',
  '01': 'Nota Fiscal (modelo 1/1A)',
  '1B': 'Nota Fiscal Avulsa',
  '04': 'Nota Fiscal de Produtor',
  '06': 'Nota Fiscal/Conta de Energia Elétrica',
};

export type ItemNumeracao = {
  numero: number;
  categoria: CategoriaNumeracao;
  codSit: string | null;
  situacaoDetalhe: string | null;
  chave: string | null;
  dataEmissao: string | null;
  valor: string | null;
  linhaOriginal: number | null;
};

export type GrupoNumeracao = {
  modelo: string;
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
  // Só as "Não localizada" — são o achado principal pedido pelo usuário;
  // as autorizadas/canceladas/etc. já aparecem contadas acima, listar
  // cada uma aqui também poderia significar milhares de linhas sem
  // utilidade extra.
  faltantes: ItemNumeracao[];
  // true quando o intervalo mín-máx é grande demais pra enumerar com
  // segurança (proteção contra um campo NUM_DOC ilegível/corrompido que
  // produziria um "gap" de milhões de números) — nesse caso qtdNaoLocalizadas
  // e faltantes ficam zerados/vazios pra esse grupo, sinalizado aqui.
  intervaloGrandeDemais: boolean;
};

// Acima disso, a enumeração número a número do intervalo não roda —
// nenhuma sequência real de notas chega nem perto disso; serve só de
// proteção contra dado corrompido (ex: NUM_DOC lido errado como
// "99999999").
const LIMITE_INTERVALO = 500_000;

export function analisarNumeracaoSaida(notas: NotaSaida[]): GrupoNumeracao[] {
  const porGrupo = new Map<string, { modelo: string; serie: string; itens: Map<number, ItemNumeracao> }>();

  for (const nota of notas) {
    const numero = parseInt(nota.numero, 10);
    if (!Number.isFinite(numero) || numero < 0) continue; // número ilegível não entra na sequência

    const modelo = (nota.modelo || '').trim();
    const serie = (nota.serie || '').trim();
    const chaveGrupo = `${modelo}|${serie}`;
    if (!porGrupo.has(chaveGrupo)) porGrupo.set(chaveGrupo, { modelo, serie, itens: new Map() });
    const grupo = porGrupo.get(chaveGrupo)!;

    const categoria = COD_SIT_CATEGORIA[nota.codSit] || 'Autorizada';
    // Mesmo número repetido no arquivo (erro de escrituração) fica só
    // com a última ocorrência — não é objetivo desta análise apontar
    // duplicidade, só os números ausentes.
    grupo.itens.set(numero, {
      numero,
      categoria,
      codSit: nota.codSit || null,
      situacaoDetalhe: nota.situacao || null,
      chave: nota.chave || null,
      dataEmissao: nota.dataEmissao || null,
      valor: nota.valor || null,
      linhaOriginal: nota.linhaOriginal,
    });
  }

  const resultado: GrupoNumeracao[] = [];
  for (const { modelo, serie, itens } of porGrupo.values()) {
    const numeros = Array.from(itens.keys());
    const numeroMinimo = Math.min(...numeros);
    const numeroMaximo = Math.max(...numeros);
    const totalEsperado = numeroMaximo - numeroMinimo + 1;

    let qtdAutorizadas = 0, qtdCanceladas = 0, qtdInutilizadas = 0, qtdDenegadas = 0, qtdNaoLocalizadas = 0;
    const faltantes: ItemNumeracao[] = [];
    const intervaloGrandeDemais = totalEsperado > LIMITE_INTERVALO;

    if (!intervaloGrandeDemais) {
      for (let n = numeroMinimo; n <= numeroMaximo; n++) {
        const item = itens.get(n);
        if (!item) {
          qtdNaoLocalizadas++;
          faltantes.push({ numero: n, categoria: 'Não localizada', codSit: null, situacaoDetalhe: null, chave: null, dataEmissao: null, valor: null, linhaOriginal: null });
          continue;
        }
        if (item.categoria === 'Autorizada') qtdAutorizadas++;
        else if (item.categoria === 'Cancelada') qtdCanceladas++;
        else if (item.categoria === 'Inutilizada') qtdInutilizadas++;
        else if (item.categoria === 'Denegada') qtdDenegadas++;
      }
    } else {
      // Ainda conta o que está presente (não precisa do loop do
      // intervalo inteiro pra isso), só não enumera os ausentes.
      for (const item of itens.values()) {
        if (item.categoria === 'Autorizada') qtdAutorizadas++;
        else if (item.categoria === 'Cancelada') qtdCanceladas++;
        else if (item.categoria === 'Inutilizada') qtdInutilizadas++;
        else if (item.categoria === 'Denegada') qtdDenegadas++;
      }
    }

    resultado.push({
      modelo,
      modeloLabel: COD_MOD_LABELS[modelo] || (modelo ? `Modelo ${modelo}` : '—'),
      serie: serie || '—',
      numeroMinimo,
      numeroMaximo,
      totalEsperado,
      qtdAutorizadas,
      qtdCanceladas,
      qtdInutilizadas,
      qtdDenegadas,
      qtdNaoLocalizadas,
      faltantes,
      intervaloGrandeDemais,
    });
  }

  return resultado.sort((a, b) => a.modelo.localeCompare(b.modelo) || a.serie.localeCompare(b.serie));
}
