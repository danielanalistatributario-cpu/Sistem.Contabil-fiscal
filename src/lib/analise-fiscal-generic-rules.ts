// Regras genéricas da Análise e Apuração Fiscal — rodam para TODA linha,
// independente da TES ter regra profunda cadastrada ou não (dependem só de
// TesMetadata + campos do próprio lançamento, nunca de lógica específica de
// uma TES). Isso cobre as ~23 TES "metadados só" com checagens úteis desde já.

import type { RuleDef, RuleContext, Divergencia } from './analise-fiscal-tes-registry';
import { normalizarUf, somenteDigitos, fmtBRL, fmtPct } from './analise-fiscal-tes-registry';

const ruleChaveNfPolicy: RuleDef = {
  id: 'generico_chave_nf_politica',
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

const ruleValorContabil: RuleDef = {
  id: 'generico_valor_contabil',
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
  ruleValorContabil,
  ruleCalculoImposto('Icms', 'ICMS'),
  ruleCalculoImposto('Pis', 'PIS'),
  ruleCalculoImposto('Cofins', 'COFINS'),
];

export type { RuleContext };
