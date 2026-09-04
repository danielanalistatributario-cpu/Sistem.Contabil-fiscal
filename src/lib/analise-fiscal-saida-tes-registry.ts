// Registro de TES de Saídas (vendas/transferências/baixas) para a Análise
// e Apuração Fiscal — mesma forma de analise-fiscal-tes-registry.ts
// (metadados + regras profundas por TES), reaproveitando os tipos e
// helpers de regra de lá (a lógica é a mesma, só os códigos de TES e o
// sentido da operação mudam). Calibrado contra um Relatório de Saídas
// real (REL_SAI_MTZ_082026.xlsx, 63.957 linhas — ver
// [[testar-com-arquivo-real]] na memória do projeto): 8 TES cobrem 99,3%
// das linhas e ganharam regra profunda; as demais (~14, <1% das linhas)
// ficam só com metadados até validar com mais dados, mesmo critério do
// Entradas.

import type { RuleDef, TesMetadata } from './analise-fiscal-tes-registry';
import {
  ruleValorZero,
  ruleValorTributadoFixo,
  ruleIcmsTabelaPadrao,
  normalizarUf,
  somenteDigitos,
} from './analise-fiscal-tes-registry';

type TesRuleGroupSaida = TesMetadata & { rules: RuleDef[] };

const RULES_TUDO_ISENTO: RuleDef[] = [
  ruleValorZero('Icms', 'ICMS'),
  ruleValorZero('Pis', 'PIS'),
  ruleValorZero('Cofins', 'COFINS'),
];

const RULES_ICMS_TRIBUTADO_PISCOFINS_ISENTO: RuleDef[] = [
  ruleIcmsTabelaPadrao(),
  ruleValorZero('Pis', 'PIS'),
  ruleValorZero('Cofins', 'COFINS'),
];

const RULES_ICMS_ISENTO_PISCOFINS_TRIBUTADO: RuleDef[] = [
  ruleValorZero('Icms', 'ICMS'),
  ruleValorTributadoFixo('Pis', 'PIS', 1.65),
  ruleValorTributadoFixo('Cofins', 'COFINS', 7.6),
];

// TES 903 (transferência entre filiais) — mesmo grupo de CNPJs do TES 138
// de Entradas (mesmas empresas do grupo, cadastradas em Configurar TES →
// CNPJs do grupo).
const RULES_903: RuleDef[] = [
  {
    id: 'tes903_cnpj_grupo',
    descricao: 'Confere se o CNPJ do cliente/destinatário está na lista de CNPJs do grupo cadastrada em Configurar TES → CNPJs do grupo. Só roda quando a empresa já cadastrou pelo menos um CNPJ nessa lista.',
    check: (ctx) => {
      const { linha, cnpjsGrupo } = ctx;
      if (!cnpjsGrupo || cnpjsGrupo.size === 0) return null;
      const digitos = somenteDigitos(linha.cnpjCpf);
      if (!digitos) return null;
      if (cnpjsGrupo.has(digitos)) return null;
      return {
        severidade: 'CRITICO',
        tipo: 'CLIENTE_TES',
        regraEsperada: 'TES 903 é exclusiva para transferências entre empresas do grupo cadastrado',
        informacaoEncontrada: `CNPJ ${linha.cnpjCpf} (cliente: ${linha.fornecedor}) não está na lista de CNPJs do grupo`,
        motivo: 'O CNPJ do cliente/destinatário não corresponde a nenhuma empresa cadastrada no grupo (Configurar TES → CNPJs do grupo)',
        sugestaoCorrecao: 'Verificar se esta nota deveria mesmo usar TES 903, ou se é uma venda a terceiro classificada incorretamente',
      };
    },
  },
  {
    id: 'tes903_cfop_fixo',
    descricao: 'Confere se o CFOP é 5152 (transferência interna) ou 6152 (transferência interestadual), conforme a UF do destinatário em relação à UF da empresa.',
    check: (ctx) => {
      const { linha, ufPropria } = ctx;
      if (!linha.cfop || !linha.uf) return null;
      const interna = normalizarUf(linha.uf) === normalizarUf(ufPropria);
      const esperado = interna ? '5152' : '6152';
      const cfopDigitos = (linha.cfop.match(/\d+/) || [''])[0];
      if (cfopDigitos !== esperado) {
        return {
          severidade: 'ALTO',
          tipo: 'CFOP_UF',
          regraEsperada: `TES 903, operação ${interna ? 'interna' : 'interestadual'} → CFOP esperado: ${esperado}`,
          informacaoEncontrada: `CFOP ${linha.cfop}`,
          motivo: `Transferência entre filiais do grupo tem CFOP fixo (5152 interna / 6152 interestadual), destinatário em ${linha.uf} e empresa em ${ufPropria}`,
          sugestaoCorrecao: 'Corrigir o CFOP para o padrão de transferência entre filiais',
        };
      }
      return null;
    },
  },
  ...RULES_TUDO_ISENTO,
];

// TES 919/907 (baixa de deterioração/estoque) — CFOP fixo de ajuste
// interno (5927), não é uma venda real; cliente costuma ser a própria
// empresa (evidência real: 100% dos casos)
const RULES_BAIXA_ESTOQUE: RuleDef[] = [...RULES_TUDO_ISENTO];

const TES_RULE_GROUPS_SAIDA: TesRuleGroupSaida[] = [
  // TES 900/989: venda de mercadoria, tudo isento (evidência real:
  // 46587/46587 e 426/426 — ICMS, PIS e COFINS sempre zerados)
  { codigos: ['900'], grupo: 'Venda de mercadoria', chaveNf: 'obrigatoria', permiteProdutos: true, rules: RULES_TUDO_ISENTO },
  { codigos: ['989'], grupo: 'Venda de mercadoria', chaveNf: 'obrigatoria', permiteProdutos: true, rules: RULES_TUDO_ISENTO },
  // TES 902: ICMS tributado pela tabela normal, PIS/COFINS isento
  // (evidência real: 9443/9443 com ICMS>0, PIS/COFINS sempre zerados)
  { codigos: ['902'], grupo: 'Venda com ICMS', chaveNf: 'obrigatoria', permiteProdutos: true, rules: RULES_ICMS_TRIBUTADO_PISCOFINS_ISENTO },
  // TES 903: transferência entre filiais — CFOP fixo não segue a
  // convenção normal de CFOP×UF (evidência real: sempre 5152, mas a
  // amostra só tem casos internos PA→PA; por analogia direta com o CFOP
  // fixo de compra da TES 138, a regra própria já cobre 5152/6152 sem
  // precisar da checagem genérica)
  { codigos: ['903'], grupo: 'Transferência entre filiais', chaveNf: 'obrigatoria', permiteProdutos: true, validarCfopUf: false, rules: RULES_903 },
  // TES 919/907: baixa de deterioração/estoque — CFOP de ajuste interno
  // (5927), não segue a convenção de CFOP×UF (evidência real: sempre
  // 5927, cliente é a própria empresa)
  { codigos: ['919'], grupo: 'Baixa deterioração', chaveNf: 'obrigatoria', permiteProdutos: true, validarCfopUf: false, rules: RULES_BAIXA_ESTOQUE },
  { codigos: ['907'], grupo: 'Baixa de estoque', chaveNf: 'obrigatoria', permiteProdutos: true, validarCfopUf: false, rules: RULES_BAIXA_ESTOQUE },
  // TES 939: venda sem ICMS, com PIS/COFINS tributado a 1,65%/7,60%
  // (evidência real: 767/767 com ICMS sempre zerado, PIS/COFINS sempre
  // tributado nessas alíquotas exatas)
  { codigos: ['939'], grupo: 'Venda s/ICMS c/PIS,COFINS', chaveNf: 'obrigatoria', permiteProdutos: true, rules: RULES_ICMS_ISENTO_PISCOFINS_TRIBUTADO },
  // TES 955: venda Suframa (Zona Franca) sem ICMS — CFOP fixo 6110,
  // sempre interestadual (evidência real: 362/362), tudo isento
  { codigos: ['955'], grupo: 'Venda Suframa s/ICMS', chaveNf: 'obrigatoria', permiteProdutos: true, rules: RULES_TUDO_ISENTO },

  // ---- metadados só (amostra pequena no arquivo real testado: <1% das
  // linhas cada, insuficiente pra calibrar regra profunda com confiança)
  { codigos: ['940'], grupo: 'Vendas c/ ICMS PIS COFINS', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['950'], grupo: 'Baixa deterioração', chaveNf: 'obrigatoria', permiteProdutos: true, validarCfopUf: false, rules: [] },
  { codigos: ['935'], grupo: 'Venda ST c/ PIS e COFINS', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['954'], grupo: 'Venda Suframa c/ ICMS', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['956'], grupo: 'Venda Suframa c/ PIS e COFINS', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['964'], grupo: 'Transferência de mercadoria', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['905'], grupo: 'Bonificação', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['920'], grupo: 'Bonificação c/ ICMS', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['904', '906'], grupo: 'Devolução de compras', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['991'], grupo: 'Devolução', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['911'], grupo: 'Complemento de ICMS', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['958'], grupo: 'Venda Suframa c/ ICMS 4%', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['957'], grupo: 'Suframa c/ ICMS desonerado', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
  { codigos: ['984'], grupo: 'Venda ST s/ PIS e COFINS', chaveNf: 'obrigatoria', permiteProdutos: true, rules: [] },
];

export const TES_METADATA_SAIDA_DEFAULT: TesMetadata[] = TES_RULE_GROUPS_SAIDA;

export const TES_RULES_SAIDA: Record<string, RuleDef[]> = Object.fromEntries(
  TES_RULE_GROUPS_SAIDA.flatMap((g) => g.codigos.map((c) => [c, g.rules]))
);
