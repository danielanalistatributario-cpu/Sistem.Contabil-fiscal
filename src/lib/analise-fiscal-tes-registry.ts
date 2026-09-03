// Registro parametrizável de regras por TES para a Análise e Apuração Fiscal.
//
// Cada código de TES entra com METADADOS (política de Chave NF, se aceita
// produto) — isso já vale pra todas as ~27 TES do texto original do usuário,
// então nenhuma delas aparece como "TES nova" indevidamente. Além disso, uma
// TES pode ter REGRAS PROFUNDAS específicas (produto, fornecedor, cálculo de
// imposto) — nesta primeira entrega, as regras profundas estão completas só
// para as TES gerenciais (001/002/004/009), 101, 102 e 138 (as mais
// detalhadas/importantes do pedido original); as demais ficam com `rules: []`
// (metadados só) até serem validadas com um arquivo real e completadas numa
// entrega seguinte — evita transcrever ~25 TES de regras sem nenhum teste
// contra dado real.

import type { LinhaEntradaImportada } from './analise-fiscal-reader';
import { determinarAliquotaInterestadual } from './difal-rules';

export type Severidade = 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO' | 'INFORMATIVO';

export type Divergencia = {
  severidade: Severidade;
  tipo: string;
  regraEsperada: string;
  informacaoEncontrada: string;
  motivo: string;
  sugestaoCorrecao?: string;
};

export type RuleContext = {
  linha: LinhaEntradaImportada;
  ufPropria: string;
  aliquotaInterna: number;
};

export type RuleDef = { id: string; check: (ctx: RuleContext) => Divergencia | null };

export type ChaveNfPolicy = 'obrigatoria' | 'proibida' | 'livre';

export type TesMetadata = {
  codigos: string[];
  grupo: string;
  chaveNf: ChaveNfPolicy;
  permiteProdutos: boolean;
};

type TesRuleGroup = TesMetadata & { rules: RuleDef[] };

// ---------------- helpers ----------------

export function normalizarUf(uf: string): string {
  return (uf || '').trim().toUpperCase();
}

export function somenteDigitos(v: string): string {
  return (v || '').replace(/\D/g, '');
}

export function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function fmtPct(fracao: number): string {
  return (fracao * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + '%';
}

function comoFracao(aliquota: number): number {
  // aceita tanto "19" quanto "0.19" como alíquota de 19%
  return aliquota > 1 ? aliquota / 100 : aliquota;
}

function ehCpf(cnpjCpf: string): boolean {
  return somenteDigitos(cnpjCpf).length === 11;
}

function terminaEmAL(descricao: string): boolean {
  return /\bAL\.?$/i.test((descricao || '').trim());
}

const NOME_EMPRESARIAL_REGEX = /\b(ME|LTDA|EIRELI|COMERCIO|COM[ée]RCIO|SERVI[çc]O|IMPORTA[çc][ãa]O|COMERCIALIZA[çc][ãa]O)\b/i;

// ---------------- Fort Fruit — CNPJs do grupo (TES 138) ----------------
export const CNPJS_GRUPO_FORTFRUIT: { nome: string; cnpj: string }[] = [
  { nome: 'Fortfruit Matriz', cnpj: '02.338.006/0001-07' },
  { nome: 'Filial Castanhal', cnpj: '02.338.006/0004-41' },
  { nome: 'Filial Passarela', cnpj: '02.338.006/0006-03' },
  { nome: 'Filial Piedade', cnpj: '02.338.006/0005-22' },
];
const DIGITOS_GRUPO_FORTFRUIT = new Set(CNPJS_GRUPO_FORTFRUIT.map((c) => somenteDigitos(c.cnpj)));

// ---------------- regras profundas: Gerenciais (001/002/004/009) ----------------
// Única validação é a política de Chave NF (proibida), que já roda via
// TesMetadata + regra genérica — nenhuma regra extra necessária aqui.
const RULES_GERENCIAIS: RuleDef[] = [];

// ---------------- regras profundas: TES 101 ----------------
const RULES_101: RuleDef[] = [
  {
    id: 'tes101_fornecedor_cpf',
    check: (ctx) => {
      const { linha } = ctx;
      if (!ehCpf(linha.cnpjCpf)) return null;
      return {
        severidade: 'MEDIO',
        tipo: 'FORNECEDOR_TES',
        regraEsperada: 'TES 101 é para revenda — fornecedor esperado é pessoa jurídica (CNPJ)',
        informacaoEncontrada: `Fornecedor "${linha.fornecedor}" com CPF ${linha.cnpjCpf}`,
        motivo: 'CPF normalmente indica produtor rural, que costuma usar TES de produtor (130/141), não a TES 101',
        sugestaoCorrecao: 'Verificar se a classificação TES 101 está correta para este fornecedor',
      };
    },
  },
  {
    id: 'tes101_fornecedor_nome_empresarial',
    check: (ctx) => {
      const { linha } = ctx;
      if (ehCpf(linha.cnpjCpf)) return null;
      if (!NOME_EMPRESARIAL_REGEX.test(linha.fornecedor || '')) return null;
      return {
        severidade: 'MEDIO',
        tipo: 'FORNECEDOR_TES',
        regraEsperada: 'TES 101 é para produtos de revenda isentos — fornecedores com perfil de comércio/importação estabelecido merecem revisão',
        informacaoEncontrada: `Fornecedor "${linha.fornecedor}"`,
        motivo: 'Nome do fornecedor contém indicativo de empresa comercial/importadora estabelecida (ME/LTDA/COMÉRCIO/SERVIÇO/IMPORTAÇÃO/COMERCIALIZAÇÃO)',
        sugestaoCorrecao: 'Verificar se o fornecedor deveria mesmo estar classificado em TES 101',
      };
    },
  },
];

// ---------------- regras profundas: TES 102 ----------------
const RULES_102: RuleDef[] = [
  {
    id: 'tes102_produto_al',
    check: (ctx) => {
      const { linha } = ctx;
      if (!terminaEmAL(linha.produtoDescricao)) return null;
      return {
        severidade: 'MEDIO',
        tipo: 'CLASSIFICACAO_TES',
        regraEsperada: 'Produtos importados via acordo ALALC (indicados por "AL" no final da descrição) costumam ser classificados em TES 101',
        informacaoEncontrada: `Produto "${linha.produtoDescricao}" classificado em TES 102`,
        motivo: 'Descrição do produto termina em "AL", indício de procedência ALALC',
        sugestaoCorrecao: 'Verificar se a classificação correta seria TES 101',
      };
    },
  },
  {
    id: 'tes102_aliquota_icms',
    check: (ctx) => {
      const { linha, ufPropria, aliquotaInterna } = ctx;
      if (linha.aliquotaIcms == null || !linha.uf) return null;
      const interna = normalizarUf(linha.uf) === normalizarUf(ufPropria);
      let esperada: number;
      let motivoBase: string;
      if (interna) {
        esperada = aliquotaInterna;
        motivoBase = `Operação interna (fornecedor em ${linha.uf}, mesma UF da empresa) — alíquota interna esperada`;
      } else {
        const origemCodigo = terminaEmAL(linha.produtoDescricao) ? '1' : somenteDigitos(linha.origem).slice(0, 1) || '0';
        const resultado = determinarAliquotaInterestadual(origemCodigo, linha.uf);
        if (!resultado) return null;
        esperada = resultado.aliquota;
        motivoBase = resultado.motivo;
      }
      const encontrada = comoFracao(linha.aliquotaIcms);
      if (Math.abs(encontrada - esperada) > 0.005) {
        return {
          severidade: 'ALTO',
          tipo: 'ALIQUOTA_ICMS',
          regraEsperada: `Alíquota de ICMS esperada: ${fmtPct(esperada)} (${motivoBase})`,
          informacaoEncontrada: `Alíquota informada: ${fmtPct(encontrada)}`,
          motivo: motivoBase,
          sugestaoCorrecao: 'Verificar a alíquota de ICMS aplicada nesta nota',
        };
      }
      return null;
    },
  },
];

// ---------------- regras profundas: TES 138 ----------------
const RULES_138: RuleDef[] = [
  {
    id: 'tes138_cnpj_grupo',
    check: (ctx) => {
      const { linha } = ctx;
      const digitos = somenteDigitos(linha.cnpjCpf);
      if (!digitos) return null;
      if (DIGITOS_GRUPO_FORTFRUIT.has(digitos)) return null;
      return {
        severidade: 'CRITICO',
        tipo: 'FORNECEDOR_TES',
        regraEsperada: 'TES 138 é exclusiva para transferências entre empresas do grupo Fort Fruit',
        informacaoEncontrada: `CNPJ ${linha.cnpjCpf} (fornecedor: ${linha.fornecedor}) não está na lista de CNPJs do grupo`,
        motivo: 'O CNPJ do fornecedor/remetente não corresponde a nenhuma filial cadastrada do grupo Fort Fruit',
        sugestaoCorrecao: 'Verificar se esta nota deveria mesmo usar TES 138, ou se é uma compra de terceiro classificada incorretamente',
      };
    },
  },
  {
    id: 'tes138_cfop_fixo',
    check: (ctx) => {
      const { linha, ufPropria } = ctx;
      if (!linha.cfop || !linha.uf) return null;
      const interna = normalizarUf(linha.uf) === normalizarUf(ufPropria);
      const esperado = interna ? '1152' : '2152';
      const cfopDigitos = (linha.cfop.match(/\d+/) || [''])[0];
      if (cfopDigitos !== esperado) {
        return {
          severidade: 'ALTO',
          tipo: 'CFOP_UF',
          regraEsperada: `TES 138, operação ${interna ? 'interna' : 'interestadual'} → CFOP esperado: ${esperado}`,
          informacaoEncontrada: `CFOP ${linha.cfop}`,
          motivo: `Transferência entre filiais do grupo tem CFOP fixo (1152 interna / 2152 interestadual), fornecedor em ${linha.uf} e empresa em ${ufPropria}`,
          sugestaoCorrecao: 'Corrigir o CFOP para o padrão de transferência entre filiais',
        };
      }
      return null;
    },
  },
  {
    id: 'tes138_isencao',
    check: (ctx) => {
      const { linha } = ctx;
      const valores: [string, number | null][] = [['ICMS', linha.valorIcms], ['PIS', linha.valorPis], ['COFINS', linha.valorCofins]];
      for (const [nome, valor] of valores) {
        if (valor != null && Math.abs(valor) > 0.01) {
          return {
            severidade: 'ALTO',
            tipo: 'CALCULO_' + nome,
            regraEsperada: `TES 138 — todos os produtos são isentos de ICMS, PIS e COFINS`,
            informacaoEncontrada: `Valor de ${nome}: ${fmtBRL(valor)}`,
            motivo: `Transferência entre filiais (TES 138) não deveria ter valor de ${nome} tributado`,
            sugestaoCorrecao: `Verificar por que há valor de ${nome} nesta nota de transferência`,
          };
        }
      }
      return null;
    },
  },
];

// ---------------- registro completo ----------------

const TES_RULE_GROUPS: TesRuleGroup[] = [
  { codigos: ['001', '002', '004', '009'], grupo: 'Gerenciais', chaveNf: 'proibida', permiteProdutos: true, rules: RULES_GERENCIAIS },
  { codigos: ['101'], grupo: 'Revenda isenta ICMS/PIS/COFINS/Funrural', chaveNf: 'obrigatoria', permiteProdutos: true, rules: RULES_101 },
  { codigos: ['102'], grupo: 'ICMS tributado, PIS/COFINS/Funrural isento', chaveNf: 'obrigatoria', permiteProdutos: true, rules: RULES_102 },
  { codigos: ['107'], grupo: 'Importado, crédito presumido 4% (sem destaque ICMS)', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['108', '109'], grupo: 'Tributado na entrada, isento na saída (crédito presumido)', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['110'], grupo: 'Prestação de serviços', chaveNf: 'proibida', permiteProdutos: false, rules: [] },
  { codigos: ['128'], grupo: 'PIS 1,65% / COFINS 7,60%', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['129'], grupo: 'ICMS + PIS 1,65% + COFINS 7,60%', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['130'], grupo: 'Produtores rurais (revenda)', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['138'], grupo: 'Transferência entre filiais Fort Fruit', chaveNf: 'obrigatoria', permiteProdutos: true, rules: RULES_138 },
  { codigos: ['141'], grupo: 'Produtor rural (SENAR 0,20% apenas)', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['145', '245'], grupo: 'Prestação de serviços', chaveNf: 'proibida', permiteProdutos: false, rules: [] },
  { codigos: ['151', '252'], grupo: 'Ativo Imobilizado', chaveNf: 'livre', permiteProdutos: true, rules: [] },
  { codigos: ['152'], grupo: 'Frete tributado', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['153'], grupo: 'Frete isento', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['155', '157', '194', '294'], grupo: 'Manutenção (veículos/predial/elétrica/máquinas)', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['165'], grupo: 'Combustíveis e lubrificantes', chaveNf: 'livre', permiteProdutos: true, rules: [] },
  { codigos: ['172', '173', '196'], grupo: 'Limpeza / escritório / informática', chaveNf: 'livre', permiteProdutos: true, rules: [] },
  { codigos: ['175'], grupo: 'ST, PIS/COFINS tributado', chaveNf: 'livre', permiteProdutos: true, rules: [] },
  { codigos: ['217', '317'], grupo: 'Devolução — ICMS tributado, PIS/COFINS isento', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['218', '318'], grupo: 'Devolução — tudo isento', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['219', '319'], grupo: 'Devolução — tudo tributado', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['223'], grupo: 'Bonificação (revenda, tudo isento)', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['320'], grupo: 'Devolução — tudo tributado', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
];

export const TES_METADATA: Record<string, TesMetadata> = Object.fromEntries(
  TES_RULE_GROUPS.flatMap((g) => g.codigos.map((c) => [c, g]))
);

export const TES_RULES: Record<string, RuleDef[]> = Object.fromEntries(
  TES_RULE_GROUPS.flatMap((g) => g.codigos.map((c) => [c, g.rules]))
);

export const TES_GRUPOS_COM_REGRA_PROFUNDA = ['001', '002', '004', '009', '101', '102', '138'];
