// Orquestração da Análise e Apuração Fiscal: para cada linha importada,
// roda as regras genéricas + (se a TES tiver) as regras profundas
// específicas, e agrega tudo em KPIs pro cabeçalho da apuração.

import type { LinhaEntradaImportada } from './analise-fiscal-reader';
import type { Divergencia, Severidade } from './analise-fiscal-tes-registry';
import { TES_METADATA, TES_RULES } from './analise-fiscal-tes-registry';
import { GENERIC_RULES } from './analise-fiscal-generic-rules';

export type ItemApurado = {
  linha: LinhaEntradaImportada;
  tesConhecida: boolean;
  divergencias: Divergencia[];
};

export type ResumoApuracao = {
  totalLinhas: number;
  totalNotas: number;
  totalProdutos: number;
  totalTes: number;
  totalCfops: number;
  qtdTesNovas: number;
  qtdCfopsNovos: number;
  qtdNotasSemChave: number;
  qtdDivergenciaCfopUf: number;
  qtdDivergenciaIcms: number;
  qtdDivergenciaPisCofins: number;
  qtdProdutosIncompativeis: number;
  totalDivergencias: number;
  qtdCritico: number;
  qtdAlto: number;
  qtdMedio: number;
  qtdBaixo: number;
  qtdInformativo: number;
  tesNovasEncontradas: string[];
};

export type ResultadoApuracao = { itens: ItemApurado[]; resumo: ResumoApuracao };

export function apurarEntradas(
  linhas: LinhaEntradaImportada[],
  company: { ufDestino: string; aliquotaInterna: number }
): ResultadoApuracao {
  const ctxBase = { ufPropria: company.ufDestino || '', aliquotaInterna: company.aliquotaInterna || 0.19 };

  const itens: ItemApurado[] = linhas.map((linha) => {
    const meta = TES_METADATA[linha.tes];
    const tesConhecida = !!meta;
    const divergencias: Divergencia[] = [];
    const ctx = { linha, ...ctxBase };

    for (const rule of GENERIC_RULES) {
      const d = rule.check(ctx);
      if (d) divergencias.push(d);
    }
    if (tesConhecida) {
      for (const rule of TES_RULES[linha.tes] || []) {
        const d = rule.check(ctx);
        if (d) divergencias.push(d);
      }
    }

    return { linha, tesConhecida, divergencias };
  });

  const notas = new Set<string>();
  const produtos = new Set<string>();
  const tesSet = new Set<string>();
  const cfops = new Set<string>();
  const tesNovas = new Set<string>();
  let qtdNotasSemChave = 0;
  const notasComChaveVista = new Set<string>();
  const notasSemChaveVista = new Set<string>();

  let qtdCritico = 0, qtdAlto = 0, qtdMedio = 0, qtdBaixo = 0, qtdInformativo = 0;
  let qtdCfopUf = 0, qtdIcms = 0, qtdPisCofins = 0, qtdProdutoIncompativel = 0;

  for (const item of itens) {
    const { linha } = item;
    const meta = TES_METADATA[linha.tes];
    if (linha.numeroNf) notas.add(linha.numeroNf);
    if (linha.produtoCodigo || linha.produtoDescricao) produtos.add(linha.produtoCodigo || linha.produtoDescricao);
    if (linha.tes) tesSet.add(linha.tes);
    if (linha.cfop) cfops.add(linha.cfop);
    if (!item.tesConhecida && linha.tes) tesNovas.add(linha.tes);

    const chaveDeNota = linha.numeroNf || `linha-${linha.linha}`;
    if (linha.chaveNf.trim()) {
      notasComChaveVista.add(chaveDeNota);
    } else if (meta?.chaveNf === 'obrigatoria') {
      // só conta como "nota sem chave" quando a TES realmente exige chave —
      // TES gerenciais (chave proibida) legitimamente não têm chave e não
      // deveriam inflar esse indicador (confirmado com dado real: sem este
      // filtro, 100% das "notas sem chave" eram gerenciais, mascarando o
      // sinal de problema de verdade)
      notasSemChaveVista.add(chaveDeNota);
    }

    for (const d of item.divergencias) {
      switch (d.severidade) {
        case 'CRITICO': qtdCritico++; break;
        case 'ALTO': qtdAlto++; break;
        case 'MEDIO': qtdMedio++; break;
        case 'BAIXO': qtdBaixo++; break;
        case 'INFORMATIVO': qtdInformativo++; break;
      }
      if (d.tipo === 'CFOP_UF') qtdCfopUf++;
      if (d.tipo.startsWith('CALCULO_ICMS') || d.tipo === 'ALIQUOTA_ICMS') qtdIcms++;
      if (d.tipo.startsWith('CALCULO_PIS') || d.tipo.startsWith('CALCULO_COFINS')) qtdPisCofins++;
      if (d.tipo === 'PRODUTO_TES') qtdProdutoIncompativel++;
    }
  }

  // uma "nota sem chave" só conta se NENHUMA linha daquela nota tiver chave
  // preenchida (evita falso positivo quando a chave só está em outra linha
  // da mesma nota por erro de preenchimento do relatório de origem)
  for (const chave of notasSemChaveVista) {
    if (!notasComChaveVista.has(chave)) qtdNotasSemChave++;
  }

  const totalDivergencias = itens.reduce((acc, i) => acc + i.divergencias.length, 0);

  const resumo: ResumoApuracao = {
    totalLinhas: itens.length,
    totalNotas: notas.size,
    totalProdutos: produtos.size,
    totalTes: tesSet.size,
    totalCfops: cfops.size,
    qtdTesNovas: tesNovas.size,
    qtdCfopsNovos: 0,
    qtdNotasSemChave,
    qtdDivergenciaCfopUf: qtdCfopUf,
    qtdDivergenciaIcms: qtdIcms,
    qtdDivergenciaPisCofins: qtdPisCofins,
    qtdProdutosIncompativeis: qtdProdutoIncompativel,
    totalDivergencias,
    qtdCritico,
    qtdAlto,
    qtdMedio,
    qtdBaixo,
    qtdInformativo,
    tesNovasEncontradas: Array.from(tesNovas).sort(),
  };

  return { itens, resumo };
}

export type { Severidade };
