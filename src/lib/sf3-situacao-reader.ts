// Leitor da planilha "SF3" do Protheus (Escrituração Fiscal / Notas
// Fiscais Eletrônicas) — segunda fonte opcional pra Análise de
// Numeração do Conversor SPED (ver sped-numeracao.ts). Usada pra
// explicar números "Não localizados" no SPED que na verdade têm um
// protocolo real na Sefaz (autorizado, cancelado, inutilizado ou
// denegado) só que o Protheus não gerou C100 pra eles — achado real:
// desde 01/2023 denegada/inutilizada não são mais obrigatórias no SPED
// (ver sped-parser.ts), então o Protheus às vezes simplesmente omite
// essas notas do C100, mesmo tendo o protocolo Sefaz completo na SF3.
//
// Layout real confirmado (arquivo "SF3.xlsx" exportado pelo usuário,
// 01/10/2026): aba com nome interno do Protheus (ex: "scokcny0"),
// linha 0 = título "SF3", linha 1 em branco, linha 2 = cabeçalho de
// verdade, linha 3+ = dados. Detecção por palavra-chave (não por
// posição fixa) pra tolerar exports diferentes.

import { normalizarSerie } from './sped-numeracao';

export type SituacaoSf3 = 'Autorizada' | 'Cancelada' | 'Inutilizada' | 'Denegada';

// Tabela oficial de cStat (Código de Status, retornado pela Sefaz) —
// confirmada por pesquisa, não por memória, por ser dado fiscal preciso.
// Só os códigos finais/definitivos entram aqui; códigos de
// processamento intermediário (103/104/105...) não representam uma
// situação final da nota, então ficam de fora (o item fica sem
// categoria reconhecida e não reclassifica nada).
export const CSTAT_CATEGORIA: Record<string, SituacaoSf3> = {
  '100': 'Autorizada',
  '101': 'Cancelada',
  '102': 'Inutilizada',
  '110': 'Denegada',
  '301': 'Denegada',
  '302': 'Denegada',
  '303': 'Denegada',
};

// Mesmos códigos, rótulo descritivo pra exibição (relatório "Notas com
// Retorno SEFA diferente de 100") — confirmado por pesquisa, não
// memória. Código não mapeado aqui mostra só "Código NNN" na tela, sem
// inventar descrição.
export const CSTAT_LABELS: Record<string, string> = {
  '100': 'Autorizado o uso da NF-e',
  '101': 'Cancelamento de NF-e homologado',
  '102': 'Inutilização de número homologada',
  '110': 'Uso Denegado',
  '301': 'Uso Denegado — irregularidade fiscal do emitente',
  '302': 'Uso Denegado — irregularidade fiscal do destinatário',
  '303': 'Uso Denegado — destinatário não habilitado a operar na UF',
};

export type NotaSf3 = {
  modelo: string | null;
  serie: string;
  numero: number;
  cStat: string;
  categoria: SituacaoSf3 | null;
  chave: string | null;
  observacao: string | null;
};

function normalizar(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

type CampoChave = 'numero' | 'serie' | 'cStat' | 'chave' | 'observacao';

const KEYWORDS: Record<CampoChave, string[]> = {
  numero: ['nota fiscal', 'numero nota', 'num nota', 'num. nota'],
  serie: ['serie n.f.', 'serie nf', 'serie'],
  cStat: ['retorno sefa', 'retorno sef', 'cstat', 'status sefaz', 'c-stat'],
  chave: ['chave nfe', 'chave de acesso', 'chave'],
  observacao: ['observacoes', 'observacao'],
};

function encontrarCabecalho(aoa: unknown[][]): number {
  const limite = Math.min(aoa.length, 15);
  for (let i = 0; i < limite; i++) {
    const linha = (aoa[i] || []).map(normalizar);
    const temNumero = linha.some((c) => KEYWORDS.numero.some((k) => c === k || c.includes(k)));
    const temSerie = linha.some((c) => KEYWORDS.serie.some((k) => c === k || c.includes(k)));
    const temCstat = linha.some((c) => KEYWORDS.cStat.some((k) => c === k || c.includes(k)));
    if (temNumero && temSerie && temCstat) return i;
  }
  return -1;
}

function mapearColunas(cabecalho: unknown[]): Partial<Record<CampoChave, number>> {
  const linha = cabecalho.map(normalizar);
  const mapa: Partial<Record<CampoChave, number>> = {};
  for (const campo of Object.keys(KEYWORDS) as CampoChave[]) {
    const idx = linha.findIndex((c) => KEYWORDS[campo].some((k) => c === k || c.includes(k)));
    if (idx >= 0) mapa[campo] = idx;
  }
  return mapa;
}

// O modelo não vem numa coluna própria no export real testado — é
// derivado da chave de acesso (NF-e), posições 21-22 (0-indexed 20-21)
// do padrão nacional de 44 dígitos. Sem chave válida, modelo fica null
// (o cruzamento em sped-numeracao.ts ainda funciona por modelo+série,
// mas aí a responsabilidade de não confundir séries de modelos
// diferentes com o mesmo número cai no SPED, não nesta planilha).
export function extrairModeloDaChave(chave: string): string | null {
  const digitos = (chave || '').replace(/\D/g, '');
  if (digitos.length !== 44) return null;
  return digitos.substring(20, 22);
}

// Mesma chave de 44 dígitos, posições 7-20 (0-indexed 6-19) — usado pelo
// script de sincronização pra descobrir de qual empresa/filial
// cadastrada é cada linha da SF3 (que mistura várias no mesmo sufixo),
// cruzando contra o CNPJ já cadastrado, sem precisar de nenhum campo
// novo de "filial Protheus".
export function extrairCnpjDaChave(chave: string): string | null {
  const digitos = (chave || '').replace(/\D/g, '');
  if (digitos.length !== 44) return null;
  return digitos.substring(6, 20);
}

// Monta o mapa de cruzamento usado por analisarNumeracaoSaida — uma
// entrada "exata" (modelo+série+número) quando a chave de acesso
// permitiu descobrir o modelo, e sempre uma entrada "coringa"
// (série+número, sem modelo) como fallback pros casos em que a nota
// não tem chave (ex: inutilização nunca teve chave emitida — ver
// COD_SIT_LABELS em sped-parser.ts) ou a chave veio inválida.
export function construirMapaSf3(notas: NotaSf3[]): Map<string, NotaSf3> {
  const mapa = new Map<string, NotaSf3>();
  for (const nota of notas) {
    const serieNorm = normalizarSerie(nota.serie);
    if (nota.modelo) mapa.set(`${nota.modelo}|${serieNorm}|${nota.numero}`, nota);
    mapa.set(`*|${serieNorm}|${nota.numero}`, nota);
  }
  return mapa;
}

export type ResultadoLeituraSf3 = {
  notas: NotaSf3[];
  erro: string | null;
};

export function lerSituacaoNotasSf3(aoa: unknown[][]): ResultadoLeituraSf3 {
  const idxCabecalho = encontrarCabecalho(aoa);
  if (idxCabecalho < 0) {
    return {
      notas: [],
      erro: 'Não foi possível identificar o cabeçalho da planilha — esperado colunas como "Nota Fiscal", "Serie N.F." e "Retorno SEFA".',
    };
  }

  const colunas = mapearColunas(aoa[idxCabecalho]);
  if (colunas.numero === undefined || colunas.serie === undefined || colunas.cStat === undefined) {
    return { notas: [], erro: 'Colunas obrigatórias não encontradas (Nota Fiscal, Série e Retorno SEFA/cStat).' };
  }

  const notas: NotaSf3[] = [];
  for (let i = idxCabecalho + 1; i < aoa.length; i++) {
    const linha = aoa[i] || [];
    const numeroBruto = String(linha[colunas.numero] ?? '').trim();
    const numero = parseInt(numeroBruto, 10);
    if (!numeroBruto || !Number.isFinite(numero)) continue;

    const serie = String(linha[colunas.serie] ?? '').trim();
    const cStat = String(linha[colunas.cStat] ?? '').trim();
    const chave = colunas.chave !== undefined ? String(linha[colunas.chave] ?? '').trim() || null : null;
    const observacao = colunas.observacao !== undefined ? String(linha[colunas.observacao] ?? '').trim() || null : null;

    notas.push({
      modelo: chave ? extrairModeloDaChave(chave) : null,
      serie,
      numero,
      cStat,
      categoria: CSTAT_CATEGORIA[cStat] || null,
      chave,
      observacao,
    });
  }

  return { notas, erro: null };
}
