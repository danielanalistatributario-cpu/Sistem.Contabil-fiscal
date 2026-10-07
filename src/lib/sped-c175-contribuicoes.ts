// Linhas do registro C175 (EFD Contribuições) pra Planilha ICMS/PIS/COFINS.
// Achado real (07/10/2026, Distribuidora 08/2026): a planilha só lia os
// itens (C170) e perdia a receita das NFC-e (modelo 65) escrituradas de
// forma analítica — 767 linhas C175, 19 delas com CST 01 (base R$
// 2.189,46, PIS R$ 36,12, COFINS R$ 166,39) — por isso o PIS/COFINS do CST
// 01 da planilha não batia com o arquivo.
//
// C175 é filho do C100 (documento): quando o documento tem C170, o C175 é
// só o resumo analítico dos mesmos itens e NÃO entra (senão contaria em
// dobro — mesma regra do C190 em sped-nfe-report.ts). Só existe no EFD
// Contribuições; em EFD ICMS/IPI devolve lista vazia.
//
// Layout C175: CFOP|VL_OPR|VL_DESC|CST_PIS|VL_BC_PIS|ALIQ_PIS|QUANT_BC_PIS|
// ALIQ_PIS_QUANT|VL_PIS|CST_COFINS|VL_BC_COFINS|ALIQ_COFINS|QUANT_BC_COFINS|
// ALIQ_COFINS_QUANT|VL_COFINS|COD_CTA|INFO_COMPL. Não traz ICMS, produto,
// NCM nem TES — a planilha mostra "—", sem inventar valor.

import { detectarTipoSped } from './sped-parser';
import { UF_POR_PREFIXO_IBGE } from './sped-nfe-report';
import type { ItemTributo } from './analise-fiscal-excel-tributos';

function parseNum(v: string | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v.replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

function parseDataSped(v: string | undefined): Date | null {
  if (!v || v.length !== 8) return null;
  const d = new Date(Date.UTC(parseInt(v.slice(4, 8), 10), parseInt(v.slice(2, 4), 10) - 1, parseInt(v.slice(0, 2), 10)));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function mapearC175ParaItensTributo(spedText: string): ItemTributo[] {
  if (detectarTipoSped(spedText) !== 'contribuicoes') return [];

  const participantes: Record<string, { nome: string; doc: string; uf: string }> = {};
  let cnpjEstabelecimento = '';
  const itens: ItemTributo[] = [];

  let doc: { c: string[]; teveC170: boolean; c175: string[][] } | null = null;

  function fecharDocumento() {
    if (!doc) return;
    const { c, teveC170, c175 } = doc;
    doc = null;
    if (teveC170 || c175.length === 0) return;
    const part = participantes[c[3] || ''];
    const operacao = c[1] === '0' ? 'Entrada' : c[1] === '1' ? 'Saída' : null;
    for (const r of c175) {
      itens.push({
        numeroNf: c[7] || null,
        codigoProduto: null,
        descricaoProduto: 'Registro analítico do documento (C175)',
        ncm: null,
        operacao,
        extras: {
          'Série': c[6] || null,
          Modelo: c[4] || null,
          'Emissão': parseDataSped(c[9]),
          'Data Entrada/Saída': parseDataSped(c[10]),
          'CNPJ/CPF': part?.doc || null,
          'Fornecedor/Cliente': part?.nome || null,
          UF: part?.uf || null,
          'Chave NF-e': c[8] || null,
          CFOP: r[1] || null,
          Desconto: parseNum(r[3]),
          'CNPJ do Estabelecimento': cnpjEstabelecimento || null,
        },
        tes: '',
        cstPis: r[4] || null,
        aliquotaPis: r[4] ? parseNum(r[6]) : null,
        cstCofins: r[10] || null,
        aliquotaCofins: r[10] ? parseNum(r[12]) : null,
        total: parseNum(r[2]),
        baseIcms: null,
        valorIcms: null,
        basePis: r[4] ? parseNum(r[5]) : null,
        baseCofins: r[10] ? parseNum(r[11]) : null,
        valorPis: r[4] ? parseNum(r[9]) : null,
        valorCofins: r[10] ? parseNum(r[15]) : null,
      });
    }
  }

  for (const linhaRaw of spedText.split(/\r?\n/)) {
    const trimmed = linhaRaw.trim();
    if (!trimmed.startsWith('|')) continue;
    const c = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|');
    switch (c[0]) {
      case '0000':
        cnpjEstabelecimento = c[8] || '';
        break;
      case '0150':
        participantes[c[1] || ''] = {
          nome: c[2] || '',
          doc: c[4] || c[5] || '',
          uf: c[7] ? UF_POR_PREFIXO_IBGE[c[7].slice(0, 2)] || '' : '',
        };
        break;
      case 'C100':
        fecharDocumento();
        doc = { c, teveC170: false, c175: [] };
        break;
      case 'C170':
        if (doc) doc.teveC170 = true;
        break;
      case 'C175':
        doc?.c175.push(c);
        break;
      default:
        // Filhos do C100 são C110/C111/C120/C170/C175...; qualquer outro
        // registro (C190, D100, M100...) já encerra o documento.
        if (doc && !/^C1[0-9]{2}$/.test(c[0])) fecharDocumento();
    }
  }
  fecharDocumento();

  return itens;
}
