// Regras genéricas da Análise e Apuração Fiscal — rodam para TODA linha,
// independente da TES ter regra profunda cadastrada ou não (dependem só de
// TesMetadata + campos do próprio lançamento, nunca de lógica específica de
// uma TES). Isso cobre as ~23 TES "metadados só" com checagens úteis desde já.

import type { RuleDef, RuleContext, Divergencia } from './analise-fiscal-tes-registry';
import { normalizarUf, somenteDigitos, fmtBRL, fmtPct, extrairCodigoProduto } from './analise-fiscal-tes-registry';

const ruleChaveNfPolicy: RuleDef = {
  id: 'generico_chave_nf_politica',
  descricao: 'Confere se a Chave NF está preenchida ou em branco conforme a política de cada TES: obrigatória (deve ter chave), proibida (não deve ter — TES gerencial/serviço) ou livre (sem checagem).',
  check: (ctx) => {
    const { linha } = ctx;
    const meta = ctx.tesMetadataPorCodigo[linha.tes];
    if (!meta) return null;
    const preenchida = linha.chaveNf.trim() !== '';
    if (meta.chaveNf === 'proibida' && preenchida) {
      return {
        severidade: 'CRITICO',
        tipo: 'CHAVE_NF',
        regraEsperada: `TES ${linha.tes} (${meta.grupo}) é gerencial/serviço — Chave NF não deveria estar preenchida`,
        informacaoEncontrada: `Chave NF: ${linha.chaveNf}`,
        motivo: `TES ${linha.tes} não deveria ter Chave NF vinculada`,
        sugestaoCorrecao: 'Verificar por que essa TES gerencial/serviço está com chave de NF-e preenchida',
      };
    }
    if (meta.chaveNf === 'obrigatoria' && !preenchida) {
      return {
        severidade: 'ALTO',
        tipo: 'CHAVE_NF',
        regraEsperada: `TES ${linha.tes} (${meta.grupo}) exige Chave NF preenchida`,
        informacaoEncontrada: 'Chave NF em branco',
        motivo: `TES ${linha.tes} deveria ter a chave de acesso da NF-e vinculada`,
        sugestaoCorrecao: 'Verificar se a nota foi importada corretamente com a chave de acesso',
      };
    }
    return null;
  },
};

const ruleChaveNfFormato: RuleDef = {
  id: 'generico_chave_nf_formato',
  descricao: 'Confere se a Chave NF, quando preenchida, tem exatamente 44 dígitos (tamanho padrão da chave de acesso da NF-e).',
  check: (ctx) => {
    const { linha } = ctx;
    if (!linha.chaveNf) return null;
    const digitos = somenteDigitos(linha.chaveNf);
    if (digitos.length > 0 && digitos.length !== 44) {
      return {
        severidade: 'BAIXO',
        tipo: 'CHAVE_NF_FORMATO',
        regraEsperada: 'Chave de acesso da NF-e deve ter 44 dígitos',
        informacaoEncontrada: `Chave com ${digitos.length} dígito(s): ${linha.chaveNf}`,
        motivo: 'A chave de acesso não tem o tamanho padrão de 44 dígitos',
        sugestaoCorrecao: 'Conferir se a chave foi importada/copiada corretamente',
      };
    }
    return null;
  },
};

// No Protheus, a coluna "Produto" vem preenchida em TODA linha (inclusive
// serviço, ex: "000.003-SV -SERVICO TOMADO - CONSULTORIA") — presença de
// descrição não é sinal confiável de mercadoria. O sinal real é a coluna
// "Tipo" (ex: "PA-PRODUTO ACABADO", "SV-SERVICO", "MC-MATERIAL DE
// CONSUMO"): quando disponível, qualquer prefixo diferente de "SV" indica
// mercadoria/ativo, não serviço. Sem a coluna Tipo (layout diferente), cai
// de volta pra checagem por descrição, mais fraca porém melhor que nada.
const ruleProdutoNaoPermitido: RuleDef = {
  id: 'generico_produto_nao_permitido',
  descricao: 'Em TES marcadas como "não permite produtos" (só serviço), confere se o item é realmente um serviço pela coluna Tipo (prefixo SV) — mercadoria/ativo lançado nessas TES é sinalizado. Sem a coluna Tipo, cai para uma checagem mais fraca pela simples presença de descrição de produto.',
  check: (ctx) => {
    const { linha } = ctx;
    const meta = ctx.tesMetadataPorCodigo[linha.tes];
    if (!meta || meta.permiteProdutos) return null;

    if (linha.tipo) {
      const prefixo = (linha.tipo.split('-')[0] || '').trim().toUpperCase();
      if (prefixo === 'SV') return null;
      return {
        severidade: 'ALTO',
        tipo: 'PRODUTO_TES',
        regraEsperada: `TES ${linha.tes} (${meta.grupo}) é exclusiva para prestação de serviço — não deveria ter mercadoria/ativo`,
        informacaoEncontrada: `Tipo: ${linha.tipo}${linha.produtoDescricao ? ' — Produto: ' + linha.produtoDescricao : ''}`,
        motivo: `TES ${linha.tes} não permite lançamento de mercadoria/ativo (Tipo diferente de serviço)`,
        sugestaoCorrecao: 'Verificar se o lançamento foi feito na TES correta',
      };
    }

    if (linha.produtoDescricao || linha.produtoCodigo) {
      return {
        severidade: 'MEDIO',
        tipo: 'PRODUTO_TES',
        regraEsperada: `TES ${linha.tes} (${meta.grupo}) é exclusiva para prestação de serviço — não deveria ter produto`,
        informacaoEncontrada: `Produto: ${linha.produtoDescricao || linha.produtoCodigo}`,
        motivo: `TES ${linha.tes} não permite lançamento de produtos (coluna "Tipo" não disponível para confirmar — severidade reduzida)`,
        sugestaoCorrecao: 'Verificar se o lançamento foi feito na TES correta',
      };
    }
    return null;
  },
};

const ruleCfopUf: RuleDef = {
  id: 'generico_cfop_uf',
  descricao: 'Confere se o primeiro dígito do CFOP (1 ou 5 = interna, 2 ou 6 = interestadual) bate com a UF do fornecedor em relação à UF da empresa. Não roda em TES com Chave NF proibida (gerenciais) nem em TES marcadas para não validar CFOP×UF (ex: fretes).',
  check: (ctx) => {
    const { linha, ufPropria } = ctx;
    if (!linha.cfop || !linha.uf) return null;
    // TES com Chave NF proibida (gerenciais/serviços internos) não estão
    // vinculadas a uma NF-e real — CFOP nesses lançamentos costuma ser só
    // um código interno de referência, sem relação com a UF do fornecedor,
    // então o cruzamento CFOP×UF não se aplica (confirmado com dado real:
    // 100% das divergências desta regra vinham das TES gerenciais)
    const meta = ctx.tesMetadataPorCodigo[linha.tes];
    if (meta && meta.chaveNf === 'proibida') return null;
    // algumas TES (ex: frete) têm CFOP fixo que reflete a natureza da
    // operação, não a UF do fornecedor — checagem desligada por TES
    // (padrão: ligada quando o campo está ausente/undefined)
    if (meta && meta.validarCfopUf === false) return null;
    const digito = (linha.cfop.match(/\d/) || [''])[0];
    if (!['1', '2', '5', '6'].includes(digito)) return null;
    const interna = digito === '1' || digito === '5';
    const deveriaSerInterna = normalizarUf(linha.uf) === normalizarUf(ufPropria);
    if (interna !== deveriaSerInterna) {
      const esperado = deveriaSerInterna ? 'interna (CFOP iniciado em 1 ou 5)' : 'interestadual (CFOP iniciado em 2 ou 6)';
      return {
        severidade: 'ALTO',
        tipo: 'CFOP_UF',
        regraEsperada: `Fornecedor em ${linha.uf}, empresa em ${ufPropria} → operação ${deveriaSerInterna ? 'interna' : 'interestadual'} → CFOP esperado: ${esperado}`,
        informacaoEncontrada: `CFOP ${linha.cfop}`,
        motivo: `CFOP indica operação ${interna ? 'interna' : 'interestadual'}, mas o fornecedor está em ${linha.uf} e a empresa em ${ufPropria}`,
        sugestaoCorrecao: 'Verificar e corrigir o CFOP',
      };
    }
    return null;
  },
};

// Cruza a classificação tributária do produto (ISENTO/TRIBUTADO,
// cadastrada pela empresa) com a natureza da TES lançada
// (ISENTA/TRIBUTADA/TRANSFERENCIA/LIVRE, também cadastrada). Só roda
// quando os dois lados estão classificados — produto sem cadastro ou TES
// LIVRE/TRANSFERENCIA (produto sai isento independente da classificação
// dele na transferência) não geram divergência.
const ruleProdutoClassificacaoTes: RuleDef = {
  id: 'generico_produto_classificacao_tes',
  descricao: 'Confere se a classificação tributária do produto (ISENTO/TRIBUTADO, cadastrada em Configurar TES) bate com a natureza da TES lançada (ISENTA/TRIBUTADA). Não roda em TES de transferência (produto sai isento independente da classificação) nem em produto/TES ainda não classificados.',
  check: (ctx) => {
    const { linha } = ctx;
    const meta = ctx.tesMetadataPorCodigo[linha.tes];
    if (!meta || !meta.naturezaOperacao) return null;
    if (meta.naturezaOperacao === 'LIVRE' || meta.naturezaOperacao === 'TRANSFERENCIA') return null;

    const codigo = extrairCodigoProduto(linha.produtoDescricao);
    if (!codigo) return null;
    const classificacao = ctx.produtosClassificacao.get(codigo);
    if (!classificacao) return null;

    if (meta.naturezaOperacao === 'ISENTA' && classificacao === 'TRIBUTADO') {
      return {
        severidade: 'ALTO',
        tipo: 'PRODUTO_CLASSIFICACAO_TES',
        regraEsperada: `TES ${linha.tes} (${meta.grupo}) é isenta — produtos tributados não deveriam ser lançados aqui`,
        informacaoEncontrada: `Produto "${linha.produtoDescricao}" está cadastrado como TRIBUTADO`,
        motivo: `Produto classificado como tributado lançado numa TES isenta (${linha.tes})`,
        sugestaoCorrecao: 'Verificar se a TES correta seria uma TES tributada para este produto',
      };
    }
    if (meta.naturezaOperacao === 'TRIBUTADA' && classificacao === 'ISENTO') {
      return {
        severidade: 'ALTO',
        tipo: 'PRODUTO_CLASSIFICACAO_TES',
        regraEsperada: `TES ${linha.tes} (${meta.grupo}) é tributada — produtos isentos não deveriam ser lançados aqui`,
        informacaoEncontrada: `Produto "${linha.produtoDescricao}" está cadastrado como ISENTO`,
        motivo: `Produto classificado como isento lançado numa TES tributada (${linha.tes})`,
        sugestaoCorrecao: 'Verificar se a TES correta seria uma TES isenta para este produto',
      };
    }
    return null;
  },
};

// CFOP 1152/2152 (transferência entre estabelecimentos, mesmo padrão já
// calibrado na TES 138 — ver analise-fiscal-tes-registry.ts) numa TES que
// não está marcada como TRANSFERENCIA é sinal de TES incorreta, mesmo sem
// nenhuma regra específica cadastrada para essa TES.
const ruleCfopTransferencia: RuleDef = {
  id: 'generico_cfop_transferencia',
  descricao: 'Confere se o CFOP de transferência (1152/2152) está sendo usado numa TES marcada como TRANSFERENCIA. CFOP de transferência em qualquer outra TES é sinalizado.',
  check: (ctx) => {
    const { linha } = ctx;
    if (!linha.cfop) return null;
    const cfopDigitos = (linha.cfop.match(/\d+/) || [''])[0];
    if (cfopDigitos !== '1152' && cfopDigitos !== '2152') return null;
    const meta = ctx.tesMetadataPorCodigo[linha.tes];
    if (meta && meta.naturezaOperacao === 'TRANSFERENCIA') return null;
    return {
      severidade: 'ALTO',
      tipo: 'CFOP_TRANSFERENCIA_TES',
      regraEsperada: 'CFOP de transferência (1152/2152) só deveria aparecer numa TES de transferência entre filiais',
      informacaoEncontrada: `CFOP ${linha.cfop} na TES ${linha.tes}${meta ? ' (' + meta.grupo + ')' : ''}`,
      motivo: `TES ${linha.tes} não está marcada como transferência, mas o CFOP indica transferência`,
      sugestaoCorrecao: 'Verificar se esta nota deveria mesmo usar TES de transferência (ex: 138)',
    };
  },
};

const ruleValorContabil: RuleDef = {
  id: 'generico_valor_contabil',
  descricao: 'Recalcula o Valor Contábil como Total − Desconto + Despesa + Frete + Seguro e compara com o valor informado na nota.',
  check: (ctx) => {
    const { linha } = ctx;
    if (linha.total == null || linha.valorContabil == null) return null;
    const desconto = linha.desconto ?? 0;
    const frete = linha.frete ?? 0;
    const despesa = linha.despesa ?? 0;
    const seguro = linha.seguro ?? 0;
    const calculado = linha.total - desconto + despesa + frete + seguro;
    const diff = Math.abs(calculado - linha.valorContabil);
    const tolerancia = Math.max(0.02, Math.abs(calculado) * 0.001);
    if (diff > tolerancia) {
      return {
        severidade: 'MEDIO',
        tipo: 'VALOR_CONTABIL',
        regraEsperada: `Valor Contábil = Total − Desconto + Despesa + Frete + Seguro = ${fmtBRL(calculado)}`,
        informacaoEncontrada: `Valor Contábil informado: ${fmtBRL(linha.valorContabil)}`,
        motivo: `Diferença de ${fmtBRL(diff)} entre o valor recalculado e o informado`,
        sugestaoCorrecao: 'Conferir os componentes do valor contábil (total, desconto, frete, despesa, seguro)',
      };
    }
    return null;
  },
};

function ruleCalculoImposto(campo: 'Icms' | 'Pis' | 'Cofins', label: string): RuleDef {
  return {
    id: `generico_calculo_${campo.toLowerCase()}`,
    descricao: `Confere se Valor de ${label} = Base de Cálculo × Alíquota informada. Não roda quando a Base de Cálculo é zero (indica que o imposto foi calculado sobre outra base não capturada no relatório, como ICMS-ST).`,
    check: (ctx) => {
      const linha = ctx.linha as unknown as Record<string, number | null>;
      const base = linha[`base${campo}`];
      const aliq = linha[`aliquota${campo}`];
      const valor = linha[`valor${campo}`];
      if (base == null || aliq == null || valor == null) return null;
      // base = 0 com valor preenchido normalmente indica que o imposto foi
      // calculado sobre outra base não capturada neste relatório (ex:
      // ICMS-ST) — não dá pra validar base×alíquota=valor nesse caso, e
      // sinalizar como "cálculo errado" seria sempre falso positivo
      // (confirmado com dado real: 93 de 94 casos de ICMS eram esse padrão)
      if (base === 0) return null;
      const aliqFrac = aliq > 1 ? aliq / 100 : aliq;
      const calc = base * aliqFrac;
      const diff = Math.abs(calc - valor);
      const tolerancia = Math.max(0.03, calc * 0.02);
      if (diff > tolerancia) {
        const d: Divergencia = {
          severidade: 'ALTO',
          tipo: `CALCULO_${campo.toUpperCase()}`,
          regraEsperada: `Valor de ${label} = Base × Alíquota = ${fmtBRL(calc)}`,
          informacaoEncontrada: `Valor de ${label} informado: ${fmtBRL(valor)}`,
          motivo: `Base (${fmtBRL(base)}) × Alíquota (${fmtPct(aliqFrac)}) resulta em ${fmtBRL(calc)}, diferente do informado`,
          sugestaoCorrecao: `Conferir base, alíquota e valor de ${label} lançados nesta nota`,
        };
        return d;
      }
      return null;
    },
  };
}

export const GENERIC_RULES: RuleDef[] = [
  ruleChaveNfPolicy,
  ruleChaveNfFormato,
  ruleProdutoNaoPermitido,
  ruleCfopUf,
  ruleCfopTransferencia,
  ruleProdutoClassificacaoTes,
  ruleValorContabil,
  ruleCalculoImposto('Icms', 'ICMS'),
  ruleCalculoImposto('Pis', 'PIS'),
  ruleCalculoImposto('Cofins', 'COFINS'),
];

export type { RuleContext };
