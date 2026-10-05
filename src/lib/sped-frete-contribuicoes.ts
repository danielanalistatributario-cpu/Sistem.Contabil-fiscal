// Linhas de frete (CT-e, registros D100 + D101/D105) do EFD Contribuições
// pra Planilha ICMS/PIS/COFINS. Achado real (05/10/2026, retificadora da
// Distribuidora/Macapá 03/2025): a planilha só lia C100/C170 e deixava de
// fora todo o crédito de PIS/COFINS dos fretes — CST 53, base de R$
// 271.308,17 em 157 CT-e, contra apenas R$ 17.344,89 vindos dos itens
// (C170). Somando os dois, bate com a base do M105 (apuração) por
// natureza de crédito.
//
// Layout (EFD Contribuições): D100 = documento de transporte; cada D100
// tem filhos D101 (PIS) e D105 (COFINS), pareados na ordem em que aparecem
// (mesmo VL_ITEM/CST/natureza). Só existe no EFD Contribuições — no EFD
// ICMS/IPI o D100 não tem esses filhos, então devolve lista vazia.
//
// Sem inventar informação: cada coluna sai exatamente como no arquivo. O
// CT-e não tem código de produto, NCM, CFOP nem TES no D100/D101/D105 — a
// planilha mostra "—". ICMS do D100 é do documento inteiro, então vai só
// na primeira linha de cada CT-e (senão seria somado em dobro).

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

type Credito = { cst: string; baseCalculo: number; aliquota: number; valor: number; valorItem: number };

function lerCredito(c: string[]): Credito {
  // D101 / D105: IND_NAT_FRT|VL_ITEM|CST|NAT_BC_CRED|VL_BC|ALIQ|VL|COD_CTA
  return { valorItem: parseNum(c[2]), cst: c[3] || '', baseCalculo: parseNum(c[5]), aliquota: parseNum(c[6]), valor: parseNum(c[7]) };
}

export function mapearFreteContribuicoesParaItensTributo(spedText: string): ItemTributo[] {
  if (detectarTipoSped(spedText) !== 'contribuicoes') return [];

  const participantes: Record<string, { nome: string; doc: string; uf: string }> = {};
  let cnpjEstabelecimento = '';
  const itens: ItemTributo[] = [];

  let doc: { c: string[]; pis: Credito[]; cofins: Credito[] } | null = null;

  function fecharDocumento() {
    if (!doc) return;
    const { c, pis, cofins } = doc;
    doc = null;
    const quantidade = Math.max(pis.length, cofins.length);
    if (quantidade === 0) return; // CT-e sem crédito de PIS/COFINS escriturado — nada a mostrar
    const part = participantes[c[3] || ''];
    const operacao = c[1] === '0' ? 'Entrada' : c[1] === '1' ? 'Saída' : null;
    for (let i = 0; i < quantidade; i++) {
      const p = pis[i];
      const f = cofins[i];
      itens.push({
        numeroNf: c[8] || null,
        codigoProduto: null,
        descricaoProduto: 'Serviço de transporte (CT-e)',
        ncm: null,
        operacao,
        extras: {
          'Série': c[6] || null,
          Modelo: c[4] || null,
          'Emissão': parseDataSped(c[10]),
          'Data Entrada/Saída': parseDataSped(c[11]),
          'CNPJ/CPF': part?.doc || null,
          'Fornecedor/Cliente': part?.nome || null,
          UF: part?.uf || null,
          'Chave NF-e': c[9] || null,
          'CNPJ do Estabelecimento': cnpjEstabelecimento || null,
        },
        tes: '',
        cstPis: p ? p.cst : null,
        aliquotaPis: p ? p.aliquota : null,
        cstCofins: f ? f.cst : null,
        aliquotaCofins: f ? f.aliquota : null,
        total: (p ?? f)!.valorItem,
        baseIcms: i === 0 ? parseNum(c[18]) : null,
        valorIcms: i === 0 ? parseNum(c[19]) : null,
        basePis: p ? p.baseCalculo : null,
        baseCofins: f ? f.baseCalculo : null,
        valorPis: p ? p.valor : null,
        valorCofins: f ? f.valor : null,
      });
    }
  }

  for (const linhaRaw of spedText.split(/\r?\n/)) {
    const trimmed = linhaRaw.trim();
    if (!trimmed) continue;
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
      case 'D100':
        fecharDocumento();
        doc = { c, pis: [], cofins: [] };
        break;
      case 'D101':
        doc?.pis.push(lerCredito(c));
        break;
      case 'D105':
        doc?.cofins.push(lerCredito(c));
        break;
      default:
        // Qualquer outro registro que não seja filho do D100 encerra o
        // documento aberto (D110/D120... não afetam os créditos acima).
        if (doc && !/^D1[0-9]{2}$/.test(c[0])) fecharDocumento();
    }
  }
  fecharDocumento();

  return itens;
}
