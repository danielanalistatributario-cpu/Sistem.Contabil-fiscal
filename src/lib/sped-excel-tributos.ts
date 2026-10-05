// Converte as linhas já extraídas do SPED Fiscal (buildRelatorioNFeRows)
// pro formato compartilhado usado pela planilha ICMS/PIS/COFINS
// (gerarExcelTributos, também usada pela Análise e Apuração Fiscal —
// ver [[analise-apuracao-fiscal-modulo]]).
//
// Duas particularidades do SPED tratadas aqui (não são bug):
// - TES não existe no layout do SPED (é campo específico do ERP) — sai
//   sempre "—" na planilha.
// - Os campos de PIS/COFINS em RelatorioNFeRow são `number`, não
//   `number | null`: quando o CST correspondente vem vazio no SPED,
//   eles ficam 0 só porque o parser não distingue "0 real" de "campo
//   nunca preenchido". Aqui só repasso os valores quando o CST
//   respectivo veio preenchido — senão viraria "0,00" em vez de "—",
//   o que seria inventar informação que o arquivo não trouxe.

import { extrairCodigoProduto } from './analise-fiscal-tes-registry';
import type { RelatorioNFeRow } from './sped-nfe-report';
import type { ItemTributo } from './analise-fiscal-excel-tributos';

export function mapearSpedParaItensTributo(rows: RelatorioNFeRow[]): ItemTributo[] {
  return rows.map((r) => {
    const temPis = !!r.cstPis.trim();
    const temCofins = !!r.cstCofins.trim();
    return {
      numeroNf: r.notaFiscal || null,
      codigoProduto: r.codigoProduto ? extrairCodigoProduto(r.codigoProduto) || r.codigoProduto : null,
      descricaoProduto: r.produto || null,
      ncm: r.ncm || null,
      operacao: r.tipoNF || null,
      // Colunas opcionais (marcadas pelo usuário na exportação) — valores
      // exatamente como lidos do SPED. Vazio vira "—" na planilha.
      extras: {
        'Série': r.serieNF,
        Modelo: r.modelo,
        'Emissão': r.emissao,
        'Data Entrada/Saída': r.data,
        'CNPJ/CPF': r.cnpjCpf,
        'Fornecedor/Cliente': r.fornecCliente,
        UF: r.ufDaNF,
        'Chave NF-e': r.chaveNF,
        Item: r.itemNF,
        CFOP: r.cfop,
        Origem: r.origem,
        'Tipo do Item': r.tipo,
        'CST ICMS': r.cstIcms,
        Quantidade: r.qtde,
        'Valor Unitário': r.unitario,
        Desconto: r.desconto,
        Frete: r.frete,
        Despesas: r.despesa,
        Seguro: r.seguro,
        'Alíquota ICMS': r.aliqIcms,
        'Base ICMS Isento': r.baseIsento,
        'Base ICMS Outros': r.baseOutros,
        'Base ICMS Não Tributada': r.baseNaoTrib,
        'CNPJ do Estabelecimento': r.filial,
      },
      tes: '',
      cstPis: r.cstPis || null,
      aliquotaPis: temPis ? r.aliqPis : null,
      cstCofins: r.cstCofins || null,
      aliquotaCofins: temCofins ? r.aliqCofins : null,
      total: r.total,
      baseIcms: r.baseIcms,
      valorIcms: r.valorIcms,
      basePis: temPis ? r.basePis : null,
      baseCofins: temCofins ? r.baseCofins : null,
      valorPis: temPis ? r.valorPis : null,
      valorCofins: temCofins ? r.valorCofins : null,
    };
  });
}
