// Orquestração da Análise e Apuração Fiscal — Saídas. Mesma forma de
// analise-fiscal-compute.ts (apurarEntradas), só troca o registro de
// regras profundas (TES_RULES_SAIDA em vez de TES_RULES) — as regras
// GENÉRICAS são as mesmas (reaproveitadas sem alteração, ver
// analise-fiscal-generic-rules.ts). Lógica pura, sem dependência de
// servidor — roda tanto no navegador (arquivo de Saídas real chega a
// dezenas de milhares de linhas, então o cálculo acontece no cliente e só
// o resultado já pronto é enviado ao servidor em lotes) quanto no
// servidor, se algum dia for preciso.

import type { LinhaEntradaImportada } from './analise-fiscal-reader';
import type { Divergencia, Severidade, TesMetadata } from './analise-fiscal-tes-registry';
import { TES_RULES_SAIDA } from './analise-fiscal-saida-tes-registry';
import { GENERIC_RULES } from './analise-fiscal-generic-rules';

export type ItemApuradoSaida = {
  linha: LinhaEntradaImportada;
  tesConhecida: boolean;
  divergencias: Divergencia[];
};

export type ResumoApuracaoSaida = {
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

export type ResultadoApuracaoSaida = { itens: ItemApuradoSaida[]; resumo: ResumoApuracaoSaida };

export function apurarSaidas(
  linhas: LinhaEntradaImportada[],
  company: { ufDestino: string; aliquotaInterna: number },
  config: { tesMetadataPorCodigo: Record<string, TesMetadata>; cnpjsGrupo: Set<string> }
): ResultadoApuracaoSaida {
  const ctxBase = {
    ufPropria: company.ufDestino || '',
    aliquotaInterna: company.aliquotaInterna || 0.19,
    cnpjsGrupo: config.cnpjsGrupo,
    tesMetadataPorCodigo: config.tesMetadataPorCodigo,
  };

  const itens: ItemApuradoSaida[] = linhas.map((linha) => {
    const meta = config.tesMetadataPorCodigo[linha.tes];
    const tesConhecida = !!meta;
    const divergencias: Divergencia[] = [];
    const ctx = { linha, ...ctxBase };

    for (const rule of GENERIC_RULES) {
      const d = rule.check(ctx);
      if (d) divergencias.push(d);
    }
    if (tesConhecida) {
      for (const rule of TES_RULES_SAIDA[linha.tes] || []) {
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
    const meta = config.tesMetadataPorCodigo[linha.tes];
    if (linha.numeroNf) notas.add(linha.numeroNf);
    if (linha.produtoCodigo || linha.produtoDescricao) produtos.add(linha.produtoCodigo || linha.produtoDescricao);
    if (linha.tes) tesSet.add(linha.tes);
    if (linha.cfop) cfops.add(linha.cfop);
    if (!item.tesConhecida && linha.tes) tesNovas.add(linha.tes);

    const chaveDeNota = linha.numeroNf || `linha-${linha.linha}`;
    if (linha.chaveNf.trim()) {
      notasComChaveVista.add(chaveDeNota);
    } else if (meta?.chaveNf === 'obrigatoria') {
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

  for (const chave of notasSemChaveVista) {
    if (!notasComChaveVista.has(chave)) qtdNotasSemChave++;
  }

  const totalDivergencias = itens.reduce((acc, i) => acc + i.divergencias.length, 0);

  const resumo: ResumoApuracaoSaida = {
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
