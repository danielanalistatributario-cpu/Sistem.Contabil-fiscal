// Correlaciona eventos (cancelamento) com as NF-e, aplica as regras ativas e
// calcula a situação final de cada item/nota — portado fielmente do
// Auditor RTC original.

import { RULE_DEFINITIONS, type EventoParsed, type ParsedItem } from './auditor-rtc-parser';

export type NfeBase = {
  fileName: string;
  chave: string; nNF: string; serie: string; dhEmi: string; cnpjEmit: string; xNomeEmit: string;
  itemCount: number;
  statusBase: string; statusDetailBase: string;
  nProt?: string; dhProt?: string;
  synthetic?: boolean;
};

export type NfeComputed = NfeBase & {
  status: string;
  statusDetail: string;
  situacao: string;
  itensErro: number;
  itensAlerta: number;
  itensSemIBS: number;
  itensSemCBS: number;
  observacoes: string;
};

export type ItemComputed = ParsedItem & {
  activeIssues: ParsedItem['issues'];
  tagSituacao: string;
  missingLabel: string;
  alertLabel: string;
  docStatus: string;
  situacao: string;
};

function fmtDate(iso: string): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function recompute(
  nfesBase: NfeBase[],
  itemsRaw: ParsedItem[],
  events: EventoParsed[],
  activeRuleIds: string[]
): { nfes: NfeComputed[]; items: ItemComputed[] } {
  const activeRules = new Set(activeRuleIds);

  // 1) validação de tags por item
  const items: ItemComputed[] = itemsRaw.map((item) => {
    const activeIssues = item.issues.filter((i) => activeRules.has(i.ruleId));
    const erros = activeIssues.filter((i) => i.severity === 'erro');
    const alertas = activeIssues.filter((i) => i.severity === 'alerta');
    const tagSituacao = erros.length ? 'Inconsistente' : alertas.length ? 'Válido com alertas' : 'Válido';
    return {
      ...item,
      activeIssues,
      tagSituacao,
      missingLabel: erros.map((e) => e.message).join(' · '),
      alertLabel: alertas.map((e) => e.message).join(' · '),
      docStatus: '',
      situacao: '',
    };
  });

  // 2) eventos de cancelamento homologados, por chave
  const cancelEventByChave: Record<string, EventoParsed> = {};
  events.forEach((ev) => {
    if (!ev.isCancelamentoHomologado) return;
    const prev = cancelEventByChave[ev.chave];
    if (!prev || (parseInt(ev.nSeqEvento) || 0) >= (parseInt(prev.nSeqEvento) || 0)) {
      cancelEventByChave[ev.chave] = ev;
    }
  });

  // registros sintéticos para eventos de cancelamento sem a NF-e original no lote
  const nfesList: NfeBase[] = [...nfesBase];
  Object.keys(cancelEventByChave).forEach((chave) => {
    if (chave && !nfesList.some((n) => n.chave === chave)) {
      const ev = cancelEventByChave[chave];
      nfesList.push({
        fileName: `(evento) ${ev.fileName}`, chave, nNF: '', serie: '', dhEmi: '', cnpjEmit: '', xNomeEmit: '',
        itemCount: 0, statusBase: 'Cancelada', statusDetailBase: '', synthetic: true,
      });
    }
  });

  // 3) status final da nota
  const itemsByFile: Record<string, ItemComputed[]> = {};
  items.forEach((it) => {
    (itemsByFile[it.fileName] = itemsByFile[it.fileName] || []).push(it);
  });

  const nfes: NfeComputed[] = nfesList.map((nfe) => {
    const cancelEv = nfe.chave ? cancelEventByChave[nfe.chave] : null;
    const status = cancelEv ? 'Cancelada' : nfe.statusBase || 'Sem protocolo';
    const statusDetail = cancelEv
      ? `Cancelamento registrado via evento (protocolo ${cancelEv.nProt || '—'}, ${fmtDate(cancelEv.dhEvento)})${cancelEv.xMotivo ? ': ' + cancelEv.xMotivo : ''}.`
      : nfe.statusDetailBase || '';

    const its = itemsByFile[nfe.fileName] || [];
    its.forEach((it) => {
      it.docStatus = status;
      it.situacao = status === 'Cancelada' || status === 'Denegada' ? status : it.tagSituacao;
    });

    const erros = its.filter((i) => i.tagSituacao === 'Inconsistente').length;
    const alertas = its.filter((i) => i.tagSituacao === 'Válido com alertas').length;
    const semIBS = its.filter((i) => !i.hasIBS).length;
    const semCBS = its.filter((i) => !i.hasCBS).length;
    const tagSituacao = erros ? 'Inconsistente' : alertas ? 'Válido com alertas' : 'Válido';
    const situacao = status === 'Cancelada' || status === 'Denegada' ? status : tagSituacao;

    const obsParts: string[] = [];
    if (statusDetail) obsParts.push(statusDetail);
    const uniqueMsgs = Array.from(new Set(its.flatMap((i) => i.activeIssues.map((x) => x.message)))).slice(0, 5);
    obsParts.push(...uniqueMsgs);

    return {
      ...nfe,
      status,
      statusDetail,
      situacao,
      itensErro: erros,
      itensAlerta: alertas,
      itensSemIBS: semIBS,
      itensSemCBS: semCBS,
      observacoes: obsParts.join(' · '),
    };
  });

  return { nfes, items };
}

export const DEFAULT_ACTIVE_RULES = RULE_DEFINITIONS.map((r) => r.id);
