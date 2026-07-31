// Monta o relatório "NF-e de Entrada e Saída" a partir de um arquivo SPED
// Fiscal (EFD ICMS/IPI), replicando o layout de colunas do modelo fornecido
// pelo cliente. Cada linha do relatório corresponde a um item (C170) de um
// documento fiscal (C100).
//
// Campos que o cliente pediu para desconsiderar (não existem no SPED puro):
// TES, Livro Fiscal, BCC — ficam em branco.
// "Filial" foi substituído pelo CNPJ do estabelecimento (registro 0000),
// conforme decisão do cliente.
//
// ATENÇÃO — premissas assumidas onde o SPED não tem o dado 1:1 (documentadas
// também no README): 
// - Frete/Despesa/Seguro são valores do documento (C100), não do item. Aqui
//   são rateados proporcionalmente ao valor de cada item dentro da nota.
// - "Base (Isento)" / "Base (Outros)" / "Base (N. Trib)" são derivadas do
//   CST de ICMS do item, usando o agrupamento mais comum em relatórios
//   fiscais (isento: CST 40/41/50; não tributada: CST 30; outros: CST 90).
//   Ajustar a função `classificarBaseIcms` se o critério do cliente for outro.
// - "Unitário" é calculado (Valor do Item / Quantidade), pois o SPED não traz
//   um campo de valor unitário separado.
// - "UF da NF" é derivada do código de município (COD_MUN) do participante,
//   usando os dois primeiros dígitos do código do IBGE.

const UF_POR_PREFIXO_IBGE: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE', '29': 'BA',
  '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP',
  '41': 'PR', '42': 'SC', '43': 'RS',
  '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
};

const TIPO_ITEM_LABELS: Record<string, string> = {
  '00': 'Mercadoria para Revenda',
  '01': 'Matéria-Prima',
  '02': 'Embalagem',
  '03': 'Produto em Processo',
  '04': 'Produto Acabado',
  '05': 'Subproduto',
  '06': 'Produto Intermediário',
  '07': 'Material de Uso e Consumo',
  '08': 'Ativo Imobilizado',
  '09': 'Serviços',
  '10': 'Outros Insumos',
  '99': 'Outras',
};

const MODELO_LABELS: Record<string, string> = {
  '55': 'NF-e',
  '65': 'NFC-e',
  '01': 'NF Modelo 1',
  '1B': 'NF Modelo 1A',
};

function parseDataSped(v: string | undefined): Date | null {
  if (!v || v.length !== 8) return null;
  const dia = parseInt(v.slice(0, 2), 10);
  const mes = parseInt(v.slice(2, 4), 10);
  const ano = parseInt(v.slice(4, 8), 10);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseNum(v: string | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v.replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

// Classifica a base de ICMS do item em Isento / Não Tributada / Outros,
// conforme o CST de ICMS (2 últimos dígitos). Ver nota de premissas acima.
function classificarBaseIcms(cstIcms: string, valorItem: number) {
  const cst = cstIcms.slice(-2);
  const isento = ['40', '41', '50'].includes(cst);
  const naoTributada = cst === '30';
  const outros = cst === '90';
  return {
    baseIsento: isento ? valorItem : 0,
    baseOutros: outros ? valorItem : 0,
    baseNaoTrib: naoTributada ? valorItem : 0,
  };
}

export type RelatorioNFeRow = {
  filial: string; // CNPJ do estabelecimento (substitui o código de filial do ERP)
  notaFiscal: string;
  serieNF: string;
  modelo: string;
  especie: string;
  itemNF: string;
  tipoNF: string; // Entrada | Saída
  movto: string;
  emissao: Date | null;
  data: Date | null;
  cnpjCpf: string;
  fornecCliente: string;
  ufDaNF: string;
  produto: string;
  tipo: string;
  ncm: string;
  origem: string;
  cfop: string;
  cstIcms: string;
  cstPis: string;
  cstCofins: string;
  qtde: number;
  unitario: number;
  total: number;
  desconto: number;
  frete: number;
  despesa: number;
  seguro: number;
  baseIcms: number;
  aliqIcms: number;
  valorIcms: number;
  baseIsento: number;
  baseOutros: number;
  baseNaoTrib: number;
  baseCofins: number;
  aliqCofins: number;
  valorCofins: number;
  basePis: number;
  aliqPis: number;
  valorPis: number;
  chaveNF: string;
};

export function buildRelatorioNFeRows(spedText: string): RelatorioNFeRow[] {
  const linhas = spedText.split(/\r?\n/).filter((l) => l.trim().length > 0);

  let cnpjEstabelecimento = '';
  const participantes: Record<string, { nome: string; cnpj: string; cpf: string; uf: string }> = {};
  const itens: Record<string, { descr: string; ncm: string; tipoItem: string }> = {};

  const rows: RelatorioNFeRow[] = [];

  // estado do documento (C100) atualmente "aberto", enquanto iteramos os C170 filhos
  let docAtual: {
    indOper: string;
    codPart: string;
    codMod: string;
    ser: string;
    numDoc: string;
    chvNfe: string;
    dtDoc: Date | null;
    dtES: Date | null;
    vlMerc: number;
    vlFrt: number;
    vlSeg: number;
    vlOutDa: number;
  } | null = null;

  for (const linhaRaw of linhas) {
    const trimmed = linhaRaw.trim();
    const semBordas = trimmed.replace(/^\|/, '').replace(/\|$/, '');
    const c = semBordas.split('|'); // c[0] = registro

    switch (c[0]) {
      case '0000': {
        cnpjEstabelecimento = c[6] || '';
        break;
      }
      case '0150': {
        const codPart = c[1] || '';
        participantes[codPart] = {
          nome: c[2] || '',
          cnpj: c[4] || '',
          cpf: c[5] || '',
          uf: c[7] ? UF_POR_PREFIXO_IBGE[c[7].slice(0, 2)] || '' : '',
        };
        break;
      }
      case '0200': {
        const codItem = c[1] || '';
        itens[codItem] = {
          descr: c[2] || '',
          ncm: c[7] || '',
          tipoItem: c[6] || '',
        };
        break;
      }
      case 'C100': {
        docAtual = {
          indOper: c[1] || '',
          codPart: c[3] || '',
          codMod: c[4] || '',
          ser: c[6] || '',
          numDoc: c[7] || '',
          chvNfe: c[8] || '',
          dtDoc: parseDataSped(c[9]),
          dtES: parseDataSped(c[10]),
          vlMerc: parseNum(c[15]),
          vlFrt: parseNum(c[17]),
          vlSeg: parseNum(c[18]),
          vlOutDa: parseNum(c[19]),
        };
        break;
      }
      case 'C170': {
        if (!docAtual) break;
        const numItem = c[1] || '';
        const codItem = c[2] || '';
        const qtd = parseNum(c[4]);
        const vlItem = parseNum(c[6]);
        const vlDesc = parseNum(c[7]);
        const cstIcmsCompleto = c[9] || '';
        const cfop = c[10] || '';
        const vlBcIcms = parseNum(c[12]);
        const aliqIcms = parseNum(c[13]);
        const vlIcms = parseNum(c[14]);
        const cstPis = c[24] || '';
        const vlBcPis = parseNum(c[25]);
        const aliqPis = parseNum(c[26]);
        const vlPis = parseNum(c[29]);
        const cstCofins = c[30] || '';
        const vlBcCofins = parseNum(c[31]);
        const aliqCofins = parseNum(c[32]);
        const vlCofins = parseNum(c[35]);

        const participante = participantes[docAtual.codPart];
        const item = itens[codItem];
        const { baseIsento, baseOutros, baseNaoTrib } = classificarBaseIcms(cstIcmsCompleto, vlBcIcms || vlItem);

        // rateio proporcional de frete/despesa/seguro do documento pelo valor do item
        const proporcao = docAtual.vlMerc > 0 ? vlItem / docAtual.vlMerc : 0;

        rows.push({
          filial: cnpjEstabelecimento,
          notaFiscal: docAtual.numDoc,
          serieNF: docAtual.ser,
          modelo: docAtual.codMod,
          especie: MODELO_LABELS[docAtual.codMod] || docAtual.codMod,
          itemNF: numItem,
          tipoNF: docAtual.indOper === '0' ? 'Entrada' : 'Saída',
          movto: docAtual.indOper === '0' ? 'Entrada' : 'Saída',
          emissao: docAtual.dtDoc,
          data: docAtual.dtES,
          cnpjCpf: participante ? participante.cnpj || participante.cpf : '',
          fornecCliente: participante ? participante.nome : '',
          ufDaNF: participante ? participante.uf : '',
          produto: item ? item.descr : '',
          tipo: item ? TIPO_ITEM_LABELS[item.tipoItem] || item.tipoItem : '',
          ncm: item ? item.ncm : '',
          origem: cstIcmsCompleto.slice(0, -2) || cstIcmsCompleto.charAt(0) || '',
          cfop,
          cstIcms: cstIcmsCompleto.slice(-2),
          cstPis,
          cstCofins,
          qtde: qtd,
          unitario: qtd !== 0 ? vlItem / qtd : 0,
          total: vlItem,
          desconto: vlDesc,
          frete: docAtual.vlFrt * proporcao,
          despesa: docAtual.vlOutDa * proporcao,
          seguro: docAtual.vlSeg * proporcao,
          baseIcms: vlBcIcms,
          aliqIcms,
          valorIcms: vlIcms,
          baseIsento,
          baseOutros,
          baseNaoTrib,
          baseCofins: vlBcCofins,
          aliqCofins,
          valorCofins: vlCofins,
          basePis: vlBcPis,
          aliqPis,
          valorPis: vlPis,
          chaveNF: docAtual.chvNfe,
        });
        break;
      }
      default:
        break;
    }
  }

  return rows;
}
