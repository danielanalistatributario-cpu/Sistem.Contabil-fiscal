// Regras de cálculo do DIFAL (Diferencial de Alíquota), método "por dentro"
// (Convênio ICMS 236/2021). Validadas comparando linha a linha com a planilha
// de apuração real fornecida pelo cliente (Fort Fruit) — os valores bateram
// exatamente.
//
// Fórmula:
//   Valor Origem = Valor Total x Alíquota Interestadual
//   Base ICMS    = (Valor Total - Valor Origem) / (1 - Alíquota Interna do destino)
//   ICMS Destino = Base ICMS x Alíquota Interna do destino
//   DIFAL        = ICMS Destino - Valor Origem

// CFOPs que geram DIFAL: apenas compras INTERESTADUAIS que não são para
// revenda — 2551 (ativo imobilizado) e 2556 (uso ou consumo). CFOPs iniciados
// em "1" são operações dentro do mesmo estado e NUNCA geram DIFAL — foram
// removidos daqui após identificar que estavam sendo incluídos por engano.
export const CFOP_DIFAL_PREFIXOS = ['2551', '2556'];

// Alíquota interestadual por UF de origem (quando a mercadoria é nacional).
// Estados do Sul/Sudeste (exceto ES) que vendem para outras regiões usam 7%;
// as demais UFs usam 12%.
const UF_ALIQUOTA_7 = new Set(['MG', 'PR', 'RS', 'RJ', 'SC', 'SP']);

// Alíquota fixa para operações com mercadoria importada (Resolução do Senado
// 13/2012), aplicada quando a "Origem" do produto (CST, 1º dígito) indica
// procedência estrangeira.
const ALIQUOTA_IMPORTADO = 0.04;
const CODIGOS_ORIGEM_IMPORTADO = ['1', '2', '6', '7'];

export function cfopGeraDifal(cfop: string): boolean {
  const codigo = (cfop.match(/\d+/) || [''])[0];
  return CFOP_DIFAL_PREFIXOS.includes(codigo);
}

export function extrairCodigoOrigem(origem: string): string {
  const m = origem.match(/\d/);
  return m ? m[0] : '';
}

export type ResultadoAliquotaInterestadual = { aliquota: number; motivo: string };

export function determinarAliquotaInterestadual(
  origemCodigo: string,
  ufOrigem: string
): ResultadoAliquotaInterestadual | null {
  if (CODIGOS_ORIGEM_IMPORTADO.includes(origemCodigo)) {
    return { aliquota: ALIQUOTA_IMPORTADO, motivo: 'Mercadoria importada (Origem ' + origemCodigo + ') — 4%' };
  }
  const uf = ufOrigem.trim().toUpperCase();
  if (!uf) return null;
  if (UF_ALIQUOTA_7.has(uf)) return { aliquota: 0.07, motivo: `${uf} — 7% (Sul/Sudeste, exceto ES)` };
  return { aliquota: 0.12, motivo: `${uf} — 12%` };
}

export type DifalCalculo = {
  aliqInterestadual: number;
  valorOrigem: number;
  baseIcms: number;
  icmsDestino: number;
  valorDifal: number;
};

export function calcularDifal(valorTotal: number, aliqInterestadual: number, aliqInterna: number): DifalCalculo {
  const valorOrigem = valorTotal * aliqInterestadual;
  const denominador = 1 - aliqInterna;
  const baseIcms = denominador !== 0 ? (valorTotal - valorOrigem) / denominador : 0;
  const icmsDestino = baseIcms * aliqInterna;
  const valorDifal = icmsDestino - valorOrigem;
  return { aliqInterestadual, valorOrigem, baseIcms, icmsDestino, valorDifal };
}

export type ItemEntrada = {
  docFiscal: string;
  fornecedor: string;
  cnpj: string;
  ufOrigem: string;
  produto: string;
  ncm: string;
  cfop: string;
  origem: string;
  dataEmissao: Date | null;
  quantidade: number;
  valorUnitario: number;
  frete: number;
  despesaIpi: number;
  desconto: number;
  valorTotal: number; // já ajustado: (Qtde x VLR Un) - Desconto + Frete + Despesa/IPI
};

export type DifalItemResultado = ItemEntrada & {
  origemCodigo: string;
  aliqInterestadual: number | null;
  valorOrigem: number | null;
  baseIcms: number | null;
  icmsDestino: number | null;
  valorDifal: number | null;
  inconsistencia: string | null;
};

export function processarDifal(itens: ItemEntrada[], aliquotaInterna: number): DifalItemResultado[] {
  return itens
    .filter((item) => cfopGeraDifal(item.cfop))
    .map((item) => {
      const origemCodigo = extrairCodigoOrigem(item.origem);

      if (!item.valorTotal || item.valorTotal <= 0) {
        return {
          ...item,
          origemCodigo,
          aliqInterestadual: null,
          valorOrigem: null,
          baseIcms: null,
          icmsDestino: null,
          valorDifal: null,
          inconsistencia: 'Valor total do item ausente ou zerado',
        };
      }

      const resultadoAliquota = determinarAliquotaInterestadual(origemCodigo, item.ufOrigem);
      if (!resultadoAliquota) {
        return {
          ...item,
          origemCodigo,
          aliqInterestadual: null,
          valorOrigem: null,
          baseIcms: null,
          icmsDestino: null,
          valorDifal: null,
          inconsistencia: 'UF de origem do fornecedor não identificada',
        };
      }

      const calculo = calcularDifal(item.valorTotal, resultadoAliquota.aliquota, aliquotaInterna);
      return {
        ...item,
        origemCodigo,
        aliqInterestadual: calculo.aliqInterestadual,
        valorOrigem: calculo.valorOrigem,
        baseIcms: calculo.baseIcms,
        icmsDestino: calculo.icmsDestino,
        valorDifal: calculo.valorDifal,
        inconsistencia: null,
      };
    });
}
