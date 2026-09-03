// Registro parametrizável de regras por TES para a Análise e Apuração Fiscal.
//
// Cada código de TES entra com METADADOS (política de Chave NF, se aceita
// produto) — isso já vale pra todas as ~27 TES do texto original do usuário,
// então nenhuma delas aparece como "TES nova" indevidamente. Além disso, uma
// TES pode ter REGRAS PROFUNDAS específicas (produto, fornecedor, cálculo de
// imposto) — a maioria delas foi calibrada contra um Relatório de Entradas
// real (7034 linhas, ver [[testar-com-arquivo-real]] na memória do
// projeto), não a partir do texto original sozinho, porque o comportamento
// tributário real de cada TES só ficou confiável depois de comparado com
// dado de verdade (ver `TES_GRUPOS_COM_REGRA_PROFUNDA` abaixo pra saber
// quais). As TES que não apareceram no arquivo testado (141, 175, 320,
// 219/319 com amostra insuficiente) ficam com `rules: []` (metadados só)
// até serem validadas com mais dados — evita transcrever regra sem nenhum
// teste contra dado real.

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

// ---------------- regras genéricas reaproveitáveis entre TES ----------------
// (calibradas contra um Relatório de Entradas real — ver
// [[testar-com-arquivo-real]] na memória do projeto)

function ruleValorZero(campo: 'Icms' | 'Pis' | 'Cofins', label: string): RuleDef {
  return {
    id: `valor_isento_${campo.toLowerCase()}`,
    check: (ctx) => {
      const linha = ctx.linha as unknown as Record<string, number | null | string>;
      const valor = linha[`valor${campo}`] as number | null;
      if (valor == null || Math.abs(valor) < 0.01) return null;
      return {
        severidade: 'ALTO',
        tipo: `CALCULO_${campo.toUpperCase()}`,
        regraEsperada: `TES ${linha.tes} — ${label} deve ser isento (sem valor destacado)`,
        informacaoEncontrada: `Valor de ${label}: ${fmtBRL(valor)}`,
        motivo: `TES ${linha.tes} não deveria ter ${label} tributado nesta operação`,
        sugestaoCorrecao: `Verificar por que há valor de ${label} destacado nesta nota`,
      };
    },
  };
}

function ruleValorTributadoFixo(campo: 'Pis' | 'Cofins', label: string, aliqEsperadaPct: number): RuleDef {
  return {
    id: `valor_tributado_fixo_${campo.toLowerCase()}`,
    check: (ctx) => {
      const linha = ctx.linha as unknown as Record<string, number | null | string>;
      const valor = linha[`valor${campo}`] as number | null;
      const aliq = linha[`aliquota${campo}`] as number | null;
      const total = (linha.total as number | null) ?? 0;
      if (valor == null) return null;
      if (Math.abs(valor) < 0.01 && total > 0) {
        return {
          severidade: 'ALTO',
          tipo: `CALCULO_${campo.toUpperCase()}`,
          regraEsperada: `TES ${linha.tes} — ${label} deve ser tributado a ${aliqEsperadaPct}%`,
          informacaoEncontrada: `Valor de ${label}: ${fmtBRL(0)}`,
          motivo: `TES ${linha.tes} normalmente tem ${label} tributado, mas o valor veio zerado`,
          sugestaoCorrecao: `Verificar o cálculo de ${label} nesta nota`,
        };
      }
      if (aliq != null) {
        const aliqFrac = comoFracao(aliq);
        const esperadaFrac = aliqEsperadaPct / 100;
        if (Math.abs(aliqFrac - esperadaFrac) > 0.005) {
          return {
            severidade: 'ALTO',
            tipo: `ALIQUOTA_${campo.toUpperCase()}`,
            regraEsperada: `TES ${linha.tes} — alíquota de ${label} esperada: ${aliqEsperadaPct}%`,
            informacaoEncontrada: `Alíquota informada: ${fmtPct(aliqFrac)}`,
            motivo: `TES ${linha.tes} deveria usar ${aliqEsperadaPct}% de ${label}`,
            sugestaoCorrecao: `Conferir a alíquota de ${label} aplicada`,
          };
        }
      }
      return null;
    },
  };
}

// mesma lógica da checagem de alíquota de ICMS da TES 102 (tabela
// 19%/12%/7%/4% conforme UF de origem), reaproveitada por outras TES que
// seguem a tabela normal de ICMS (129, 157)
function ruleIcmsTabelaPadrao(): RuleDef {
  return {
    id: 'icms_tabela_padrao',
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
  };
}

// devolução de operação interna: ICMS sempre pela alíquota interna da
// empresa, independente da UF do destinatário/remetente (evidência real:
// TES 217/317 sempre 19% no arquivo testado)
function ruleIcmsAliquotaInternaFixa(): RuleDef {
  return {
    id: 'icms_aliquota_interna_fixa',
    check: (ctx) => {
      const { linha, aliquotaInterna } = ctx;
      if (linha.aliquotaIcms == null) return null;
      const encontrada = comoFracao(linha.aliquotaIcms);
      if (Math.abs(encontrada - aliquotaInterna) > 0.005) {
        return {
          severidade: 'ALTO',
          tipo: 'ALIQUOTA_ICMS',
          regraEsperada: `TES ${linha.tes} (devolução) — alíquota de ICMS esperada: ${fmtPct(aliquotaInterna)} (alíquota interna)`,
          informacaoEncontrada: `Alíquota informada: ${fmtPct(encontrada)}`,
          motivo: 'Devolução de operação interna deve usar a alíquota interna de ICMS',
          sugestaoCorrecao: 'Verificar a alíquota de ICMS aplicada nesta devolução',
        };
      }
      return null;
    },
  };
}

// checagem por prefixo da coluna "Tipo" (ex: "AI-ATIVO IMOBILIZADO" ->
// prefixo "AI") — severidade MEDIO porque a amostra real usada pra
// calibrar essa TES era pequena e já mostrava alguma mistura de tipos
function ruleTipoEsperado(prefixoEsperado: string, labelEsperado: string): RuleDef {
  return {
    id: `tipo_esperado_${prefixoEsperado.toLowerCase()}`,
    check: (ctx) => {
      const { linha } = ctx;
      if (!linha.tipo) return null;
      const prefixo = (linha.tipo.split('-')[0] || '').trim().toUpperCase();
      if (prefixo === prefixoEsperado) return null;
      return {
        severidade: 'MEDIO',
        tipo: 'CLASSIFICACAO_TES',
        regraEsperada: `TES ${linha.tes} — item esperado do tipo "${labelEsperado}"`,
        informacaoEncontrada: `Tipo: ${linha.tipo}${linha.produtoDescricao ? ' — Produto: ' + linha.produtoDescricao : ''}`,
        motivo: `TES ${linha.tes} normalmente é usada só com itens do tipo "${labelEsperado}"`,
        sugestaoCorrecao: 'Verificar se o item foi lançado na TES correta',
      };
    },
  };
}

const RULES_TUDO_ISENTO: RuleDef[] = [
  ruleValorZero('Icms', 'ICMS'),
  ruleValorZero('Pis', 'PIS'),
  ruleValorZero('Cofins', 'COFINS'),
];

const RULES_ICMS_ISENTO_PISCOFINS_PADRAO: RuleDef[] = [
  ruleValorZero('Icms', 'ICMS'),
  ruleValorTributadoFixo('Pis', 'PIS', 1.65),
  ruleValorTributadoFixo('Cofins', 'COFINS', 7.6),
];

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
  ruleIcmsTabelaPadrao(),
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
  // 107/108/109: crédito presumido — ICMS não vem destacado no relatório
  // (evidência real: 100% dos casos com valorICMS = 0)
  { codigos: ['107'], grupo: 'Importado, crédito presumido 4% (sem destaque ICMS)', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [ruleValorZero('Icms', 'ICMS')] },
  { codigos: ['108', '109'], grupo: 'Tributado na entrada, isento na saída (crédito presumido)', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [ruleValorZero('Icms', 'ICMS')] },
  { codigos: ['110'], grupo: 'Prestação de serviços', chaveNf: 'proibida', permiteProdutos: false, rules: [] },
  // TES 128: ICMS isento, PIS 1,65% e COFINS 7,60% sempre tributados
  // (evidência real: 9/9 casos com essas alíquotas exatas)
  { codigos: ['128'], grupo: 'PIS 1,65% / COFINS 7,60%', chaveNf: 'obrigatoria', permiteProdutos: true, rules: RULES_ICMS_ISENTO_PISCOFINS_PADRAO },
  // TES 129: ICMS tributado pela tabela normal + PIS 1,65% + COFINS 7,60%
  // (evidência real: 48/48 casos com ICMS>0 e PIS/COFINS nessas alíquotas)
  { codigos: ['129'], grupo: 'ICMS + PIS 1,65% + COFINS 7,60%', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [ruleIcmsTabelaPadrao(), ruleValorTributadoFixo('Pis', 'PIS', 1.65), ruleValorTributadoFixo('Cofins', 'COFINS', 7.6)] },
  // TES 130: ICMS isento (evidência real: 489/489). Fornecedor pode ser
  // CPF ou CNPJ (56 de 489 eram CNPJ no arquivo real) — sem checagem de
  // fornecedor, ao contrário da TES 101
  { codigos: ['130'], grupo: 'Produtores rurais (revenda)', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [ruleValorZero('Icms', 'ICMS')] },
  { codigos: ['138'], grupo: 'Transferência entre filiais Fort Fruit', chaveNf: 'obrigatoria', permiteProdutos: true, rules: RULES_138 },
  // TES 141: não apareceu no arquivo real testado — sem base pra calibrar
  // uma regra de alíquota (SENAR/GILRAT); fica metadados só até termos um
  // arquivo com lançamentos dessa TES
  { codigos: ['141'], grupo: 'Produtor rural (SENAR 0,20% apenas)', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['145', '245'], grupo: 'Prestação de serviços', chaveNf: 'proibida', permiteProdutos: false, rules: [] },
  // Ativo Imobilizado: chave NF confirmada obrigatória com dado real
  // (9/9); Tipo esperado "AI-ATIVO IMOBILIZADO" (amostra pequena, por
  // isso severidade MEDIO em vez de ALTO)
  { codigos: ['151', '252'], grupo: 'Ativo Imobilizado', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [ruleTipoEsperado('AI', 'ATIVO IMOBILIZADO')] },
  // TES 152 (frete tributado): ICMS/PIS/COFINS sempre tributados
  // (evidência real: 0/12 zerados), PIS 1,65%/COFINS 7,60%
  { codigos: ['152'], grupo: 'Frete tributado', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [ruleValorTributadoFixo('Pis', 'PIS', 1.65), ruleValorTributadoFixo('Cofins', 'COFINS', 7.6)] },
  // TES 153 (frete isento): ICMS isento, mas PIS/COFINS continuam
  // tributados (evidência real: ICMS 0/146, PIS/COFINS nunca zerados)
  { codigos: ['153'], grupo: 'Frete isento', chaveNf: 'obrigatoria', permiteProdutos: true, rules: RULES_ICMS_ISENTO_PISCOFINS_PADRAO },
  // 155/194/294 x 157 tratados separadamente: mesmo grupo de metadados no
  // texto original, mas o comportamento real de ICMS diverge (evidência
  // real: 155/194/294 sempre isentos de ICMS; 157 sempre tributado pela
  // tabela normal) — PIS/COFINS tributados 1,65%/7,60% em ambos
  { codigos: ['155', '194', '294'], grupo: 'Manutenção (predial/elétrica/máquinas)', chaveNf: 'obrigatoria', permiteProdutos: true, rules: RULES_ICMS_ISENTO_PISCOFINS_PADRAO },
  { codigos: ['157'], grupo: 'Manutenção (veículos)', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [ruleIcmsTabelaPadrao(), ruleValorTributadoFixo('Pis', 'PIS', 1.65), ruleValorTributadoFixo('Cofins', 'COFINS', 7.6)] },
  // TES 165: ICMS isento no relatório (evidência real: 44/44) —
  // PIS/COFINS aparecem mistos (tributado e isento) no arquivo real, sem
  // padrão único, por isso sem checagem de PIS/COFINS aqui
  { codigos: ['165'], grupo: 'Combustíveis e lubrificantes', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [ruleValorZero('Icms', 'ICMS')] },
  // Chave NF confirmada obrigatória com dado real (106/106 e 6/6); tudo
  // isento de ICMS/PIS/COFINS (evidência real: 100% zerados)
  { codigos: ['172', '173', '196'], grupo: 'Limpeza / escritório / informática', chaveNf: 'obrigatoria', permiteProdutos: true, rules: RULES_TUDO_ISENTO },
  // TES 175: não apareceu no arquivo real testado — fica metadados só
  { codigos: ['175'], grupo: 'ST, PIS/COFINS tributado', chaveNf: 'livre', permiteProdutos: true, rules: [] },
  // Devolução de operação interna: ICMS pela alíquota interna fixa
  // (evidência real: sempre 19%), PIS/COFINS isentos (evidência real:
  // 100% zerados)
  { codigos: ['217', '317'], grupo: 'Devolução — ICMS tributado, PIS/COFINS isento', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [ruleIcmsAliquotaInternaFixa(), ruleValorZero('Pis', 'PIS'), ruleValorZero('Cofins', 'COFINS')] },
  { codigos: ['218', '318'], grupo: 'Devolução — tudo isento', chaveNf: 'obrigatoria', permiteProdutos: true, rules: RULES_TUDO_ISENTO },
  // TES 219/319: amostra real muito pequena (1 e 6 linhas) pra confiar
  // numa regra — o pouco que apareceu contraria o nome do grupo ("tudo
  // tributado": ICMS veio isento, só PIS/COFINS tributados), então fica
  // metadados só até validar com mais dados
  { codigos: ['219', '319'], grupo: 'Devolução — a confirmar com mais dados', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['223'], grupo: 'Bonificação (revenda, tudo isento)', chaveNf: 'obrigatoria', permiteProdutos: true, rules: RULES_TUDO_ISENTO },
  { codigos: ['320'], grupo: 'Devolução — tudo tributado', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
];

export const TES_METADATA: Record<string, TesMetadata> = Object.fromEntries(
  TES_RULE_GROUPS.flatMap((g) => g.codigos.map((c) => [c, g]))
);

export const TES_RULES: Record<string, RuleDef[]> = Object.fromEntries(
  TES_RULE_GROUPS.flatMap((g) => g.codigos.map((c) => [c, g.rules]))
);

export const TES_GRUPOS_COM_REGRA_PROFUNDA = [
  '001', '002', '004', '009', '101', '102', '107', '108', '109', '128', '129', '130', '138',
  '151', '252', '152', '153', '155', '194', '294', '157', '165', '172', '173', '196',
  '217', '317', '218', '318', '223',
];
