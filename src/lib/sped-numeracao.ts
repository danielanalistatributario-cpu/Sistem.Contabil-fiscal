// Análise de numeração das notas de Saída (C100) lidas do SPED — pedido
// explícito do usuário: identificar números faltantes na sequência e
// separar em Autorizada × Cancelada × Inutilizada × Denegada ×
// Não localizada. "Não localizada" é um número dentro do intervalo
// mín-máx da série que simplesmente não aparece em nenhum C100 do
// arquivo — pode ser uma nota que existe na Sefaz mas não foi
// escriturada neste SPED, ou nunca ter sido emitida; o arquivo sozinho
// não distingue os dois casos, por isso o rótulo é "não localizada", não
// "nunca emitida".
//
// Achado real (01/10/2026, arquivo da filial Passarela): desde 01/2023
// denegada/inutilizada deixaram de ser obrigatórias no SPED (ver
// sped-parser.ts), então o Protheus às vezes simplesmente não gera a
// linha C100 pra uma nota inutilizada — ela vira "Não localizada" no
// SPED mesmo tendo sido inutilizada de verdade, com protocolo Sefaz.
// Confirmado contra a planilha SF3 do próprio Protheus (ver
// sf3-situacao-reader.ts): a nota 186424 (NFC-e, série 5) tinha
// "Retorno SEFA" 102 = Inutilização homologada, com protocolo e tudo,
// e não aparecia em NENHUM C100 do SPED. Por isso esta função aceita
// uma segunda fonte opcional (`situacoesSf3`) pra reclassificar um
// "não localizado" quando a planilha Protheus souber o que aconteceu
// com aquele número — sem essa segunda fonte, continua "Não localizada"
// como antes.

import type { NotaSaida } from './sped-parser';
import type { NotaSf3 } from './sf3-situacao-reader';

// Série pode vir com ou sem zeros à esquerda dependendo da fonte (SPED
// usa "005", a planilha SF3 do Protheus usa "5" pro mesmo documento,
// confirmado contra dado real) — normaliza pra poder cruzar as duas.
export function normalizarSerie(serie: string): string {
  const t = (serie || '').trim();
  const semZeros = t.replace(/^0+(?=.)/, '');
  return semZeros || '0';
}

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
  // 'SF3' quando este item só foi classificado (tirado de "Não
  // localizada") graças à planilha Protheus — null nos demais casos
  // (achado direto no C100 do SPED, ou ainda "Não localizada" mesmo
  // depois de checar a segunda fonte).
  fonte: 'SF3' | null;
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
  // Quantas das "faltantes" originais (pelo SPED) foram explicadas pela
  // planilha SF3 do Protheus — 0 quando a segunda fonte não foi
  // informada ou não achou nada pra este grupo.
  qtdResolvidasPorSf3: number;
  // TODOS os números que faltavam no SPED, inclusive os já resolvidos
  // pela SF3 (ver campo `fonte` de cada item) — são o achado principal
  // pedido pelo usuário; as autorizadas/canceladas/etc. já contadas
  // acima não entram aqui, listar cada uma também não traria utilidade
  // extra.
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

// Busca na SF3 primeiro pela chave exata (modelo+série+número — mais
// segura, já que modelos diferentes podem ter a mesma série) e cai pro
// coringa (só série+número) quando a SF3 não tinha como saber o modelo
// daquela nota (ver construirMapaSf3 em sf3-situacao-reader.ts).
function buscarSf3(mapa: Map<string, NotaSf3> | undefined, modelo: string, serie: string, numero: number): NotaSf3 | undefined {
  if (!mapa) return undefined;
  const serieNorm = normalizarSerie(serie);
  return mapa.get(`${modelo}|${serieNorm}|${numero}`) || mapa.get(`*|${serieNorm}|${numero}`);
}

export type FaixaNumeracao = { modelo: string; serie: string; numeroMinimo: number; numeroMaximo: number };

// Só o intervalo mín-máx por modelo+série, direto das notas do SPED —
// usado pra pedir ao servidor só a fatia da tabela sincronizada do
// Protheus (NotaFiscalSituacaoProtheus) que cabe dentro do período deste
// arquivo, em vez de carregar os anos inteiros já sincronizados (pedido
// explícito do usuário: a busca na tabela também deve respeitar o
// período do arquivo SPED, não só a análise em si).
export function extrairFaixasNumeracao(notas: NotaSaida[]): FaixaNumeracao[] {
  const porGrupo = new Map<string, FaixaNumeracao>();
  for (const nota of notas) {
    const numero = parseInt(nota.numero, 10);
    if (!Number.isFinite(numero) || numero < 0) continue;
    const modelo = (nota.modelo || '').trim();
    const serie = (nota.serie || '').trim();
    const chave = `${modelo}|${normalizarSerie(serie)}`;
    const atual = porGrupo.get(chave);
    if (!atual) {
      porGrupo.set(chave, { modelo, serie, numeroMinimo: numero, numeroMaximo: numero });
    } else {
      atual.numeroMinimo = Math.min(atual.numeroMinimo, numero);
      atual.numeroMaximo = Math.max(atual.numeroMaximo, numero);
    }
  }
  return Array.from(porGrupo.values());
}

export function analisarNumeracaoSaida(
  notas: NotaSaida[],
  situacoesSf3?: Map<string, NotaSf3>
): GrupoNumeracao[] {
  const porGrupo = new Map<string, { modelo: string; serie: string; itens: Map<number, ItemNumeracao> }>();

  for (const nota of notas) {
    const numero = parseInt(nota.numero, 10);
    if (!Number.isFinite(numero) || numero < 0) continue; // número ilegível não entra na sequência

    const modelo = (nota.modelo || '').trim();
    const serie = (nota.serie || '').trim();
    // Agrupa pela série NORMALIZADA (sem zero à esquerda) pra não separar
    // em dois grupos a mesma série vinda com padding diferente dentro do
    // próprio SPED — a label exibida continua usando a primeira grafia
    // encontrada (ver abaixo).
    const chaveGrupo = `${modelo}|${normalizarSerie(serie)}`;
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
      fonte: null,
    });
  }

  const resultado: GrupoNumeracao[] = [];
  for (const { modelo, serie, itens } of porGrupo.values()) {
    const numeros = Array.from(itens.keys());
    const numeroMinimo = Math.min(...numeros);
    const numeroMaximo = Math.max(...numeros);
    const totalEsperado = numeroMaximo - numeroMinimo + 1;

    let qtdAutorizadas = 0, qtdCanceladas = 0, qtdInutilizadas = 0, qtdDenegadas = 0, qtdNaoLocalizadas = 0, qtdResolvidasPorSf3 = 0;
    const faltantes: ItemNumeracao[] = [];
    const intervaloGrandeDemais = totalEsperado > LIMITE_INTERVALO;

    const contar = (categoria: CategoriaNumeracao) => {
      if (categoria === 'Autorizada') qtdAutorizadas++;
      else if (categoria === 'Cancelada') qtdCanceladas++;
      else if (categoria === 'Inutilizada') qtdInutilizadas++;
      else if (categoria === 'Denegada') qtdDenegadas++;
    };

    if (!intervaloGrandeDemais) {
      for (let n = numeroMinimo; n <= numeroMaximo; n++) {
        const item = itens.get(n);
        if (item) {
          contar(item.categoria);
          continue;
        }

        // Não achou no SPED — tenta a segunda fonte (planilha Protheus)
        // antes de desistir e marcar como "Não localizada" de verdade.
        const sf3 = buscarSf3(situacoesSf3, modelo, serie, n);
        if (sf3 && sf3.categoria) {
          contar(sf3.categoria);
          qtdResolvidasPorSf3++;
          faltantes.push({
            numero: n,
            categoria: sf3.categoria,
            codSit: null,
            situacaoDetalhe: `${sf3.categoria} (via planilha Protheus, não escriturado no SPED)`,
            chave: sf3.chave,
            dataEmissao: null,
            valor: null,
            linhaOriginal: null,
            fonte: 'SF3',
          });
          continue;
        }

        qtdNaoLocalizadas++;
        faltantes.push({ numero: n, categoria: 'Não localizada', codSit: null, situacaoDetalhe: null, chave: null, dataEmissao: null, valor: null, linhaOriginal: null, fonte: null });
      }
    } else {
      // Ainda conta o que está presente (não precisa do loop do
      // intervalo inteiro pra isso), só não enumera os ausentes.
      for (const item of itens.values()) contar(item.categoria);
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
      qtdResolvidasPorSf3,
      faltantes,
      intervaloGrandeDemais,
    });
  }

  return resultado.sort((a, b) => a.modelo.localeCompare(b.modelo) || a.serie.localeCompare(b.serie));
}
