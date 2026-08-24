// Parsing de XML de NF-e e eventos, e motor de regras de validação dos
// grupos IBS/CBS (Reforma Tributária, NT 2025.002). Portado fielmente do
// Auditor RTC original — roda inteiramente no navegador (usa DOMParser),
// nenhum XML é enviado a servidor.

export function firstTag(el: Element | null, tag: string): Element | null {
  if (!el) return null;
  const list = el.getElementsByTagName(tag);
  return list.length ? list[0] : null;
}
export function textOf(el: Element | null, tag: string): string {
  const node = firstTag(el, tag);
  return node && node.textContent != null ? node.textContent.trim() : '';
}
export function numOf(el: Element | null, tag: string): number | null {
  const t = textOf(el, tag);
  if (t === '') return null;
  const n = parseFloat(t.replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

export type RuleContext = {
  ibscbsRoot: Element | null;
  groupRoot: Element | null;
  groupType: string;
  cst: string;
  cClassTrib: string;
  vBC: string;
  gIBSUF: Element | null;
  gIBSMun: Element | null;
  gCBS: Element | null;
  pIBSUF: string;
  vIBSUF: string;
  pIBSMun: string;
  vIBSMun: string;
  vIBS: string;
  pCBS: string;
  vCBS: string;
  vProd: number | null;
};

export type RuleResult = { severity: 'erro' | 'alerta'; message: string } | null;
export type RuleDef = { id: string; cat: string; label: string; check: (c: RuleContext) => RuleResult };

function fmtNum(n: number, decimals = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export const RULE_DEFINITIONS: RuleDef[] = [
  { id: 'grp_ibscbs', cat: 'Estrutura', label: 'Tag <IBSCBS> presente no item',
    check: (c) => !c.ibscbsRoot ? { severity: 'erro', message: 'Grupo <IBSCBS> ausente no item' } : null },
  { id: 'grp_valorem_mono', cat: 'Estrutura', label: 'Subgrupo <gIBSCBS>/<gIBSCBSMono> presente',
    check: (c) => (c.ibscbsRoot && !c.groupRoot) ? { severity: 'erro', message: 'Nenhum subgrupo <gIBSCBS> ou <gIBSCBSMono> encontrado dentro de <IBSCBS>' } : null },
  { id: 'tag_cst', cat: 'Tag obrigatória', label: 'CST informado',
    check: (c) => c.ibscbsRoot && !c.cst ? { severity: 'erro', message: 'Tag <CST> ausente' } : null },
  { id: 'tag_cclasstrib', cat: 'Tag obrigatória', label: 'cClassTrib informado',
    check: (c) => c.ibscbsRoot && !c.cClassTrib ? { severity: 'erro', message: 'Tag <cClassTrib> ausente' } : null },
  { id: 'tag_vbc', cat: 'Tag obrigatória', label: 'vBC (Base de Cálculo) informado',
    check: (c) => c.groupRoot && c.vBC === '' ? { severity: 'erro', message: 'Tag <vBC> ausente' } : null },
  { id: 'grp_ibsuf', cat: 'Tag obrigatória', label: 'Grupo gIBSUF (percentual/valor)',
    check: (c) => {
      if (!c.groupRoot) return null;
      if (!c.gIBSUF) return { severity: 'erro', message: 'Grupo <gIBSUF> ausente' };
      if (c.pIBSUF === '' || c.vIBSUF === '') return { severity: 'erro', message: 'pIBSUF/vIBSUF ausente em gIBSUF' };
      return null;
    } },
  { id: 'grp_ibsmun', cat: 'Tag obrigatória', label: 'Grupo gIBSMun (percentual/valor)',
    check: (c) => {
      if (!c.groupRoot) return null;
      if (!c.gIBSMun) return { severity: 'erro', message: 'Grupo <gIBSMun> ausente' };
      if (c.pIBSMun === '' || c.vIBSMun === '') return { severity: 'erro', message: 'pIBSMun/vIBSMun ausente em gIBSMun' };
      return null;
    } },
  { id: 'tag_vibs', cat: 'Tag obrigatória', label: 'vIBS (total do item) informado',
    check: (c) => c.groupRoot && c.vIBS === '' ? { severity: 'erro', message: 'Tag <vIBS> ausente' } : null },
  { id: 'grp_cbs', cat: 'Tag obrigatória', label: 'Grupo gCBS (alíquota/valor)',
    check: (c) => {
      if (!c.groupRoot) return null;
      if (!c.gCBS) return { severity: 'erro', message: 'Grupo <gCBS> ausente' };
      if (c.pCBS === '' || c.vCBS === '') return { severity: 'erro', message: 'pCBS/vCBS ausente em gCBS' };
      return null;
    } },
  { id: 'calc_vibs', cat: 'Cálculo', label: 'vIBS = vIBSUF + vIBSMun',
    check: (c) => {
      if (!c.groupRoot || c.vIBS === '') return null;
      const calc = parseFloat(c.vIBSUF || '0') + parseFloat(c.vIBSMun || '0');
      const diff = Math.abs(calc - parseFloat(c.vIBS));
      return diff > 0.02 ? { severity: 'alerta', message: `vIBS (${fmtNum(parseFloat(c.vIBS))}) difere da soma vIBSUF+vIBSMun (${fmtNum(calc)})` } : null;
    } },
  { id: 'calc_vcbs', cat: 'Cálculo', label: 'vCBS ≈ vBC × pCBS',
    check: (c) => {
      if (!c.groupRoot || c.vCBS === '' || c.vBC === '') return null;
      const base = parseFloat(c.vBC);
      const p = parseFloat(c.pCBS || '0');
      const calc = +(base * p / 100).toFixed(2);
      const diff = Math.abs(calc - parseFloat(c.vCBS));
      const tol = Math.max(0.03, calc * 0.02);
      return diff > tol ? { severity: 'alerta', message: `vCBS (${fmtNum(parseFloat(c.vCBS))}) difere do cálculo vBC×pCBS (${fmtNum(calc)})` } : null;
    } },
  { id: 'cst_bc_zero', cat: 'Cálculo', label: 'CST 000 com Base de Cálculo preenchida',
    check: (c) => {
      if (c.cst !== '000' || c.vBC === '') return null;
      return (parseFloat(c.vBC) === 0 && (c.vProd || 0) > 0)
        ? { severity: 'alerta', message: 'CST 000 (tributação integral) com vBC = 0,00' } : null;
    } },
];

export function statusFromCStat(cStat: string, xMotivo: string): { status: string; detail: string } {
  if (!cStat) return { status: 'Sem protocolo', detail: 'Nenhum protocolo de autorização (protNFe) encontrado no XML.' };
  if (cStat === '100') return { status: 'Autorizada', detail: '' };
  if (['101', '151', '155'].includes(cStat)) return { status: 'Cancelada', detail: `Cancelamento homologado no próprio protocolo da NF-e (cStat ${cStat}).` };
  if (['110', '301', '302', '303'].includes(cStat)) return { status: 'Denegada', detail: `Uso denegado — cStat ${cStat}${xMotivo ? ': ' + xMotivo : ''}.` };
  return { status: 'Outro', detail: `cStat ${cStat}${xMotivo ? ' — ' + xMotivo : ''}` };
}

const CANCEL_EVENT_CSTAT = ['101', '135', '136', '155'];
const EVENTO_LABELS: Record<string, string> = {
  '110110': 'Carta de Correção',
  '110111': 'Cancelamento',
  '110140': 'EPEC',
  '210200': 'Manifestação do Destinatário',
  '210210': 'Confirmação da Operação',
  '210220': 'Ciência da Operação',
  '210240': 'Desconhecimento da Operação',
  '210250': 'Operação não Realizada',
};

export type EventoParsed = {
  fileName: string;
  chave: string;
  tpEvento: string;
  xEvento: string;
  nSeqEvento: string;
  dhEvento: string;
  cStat: string;
  xMotivo: string;
  nProt: string;
  isCancelamentoHomologado: boolean;
};

export function parseEventoXml(fileName: string, xmlText: string): EventoParsed | null {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) return null;
  } catch {
    return null;
  }
  const eventoEl = doc.getElementsByTagName('evento')[0] || null;
  const retEventoEl = doc.getElementsByTagName('retEvento')[0] || null;
  if (!eventoEl && !retEventoEl) return null;

  const infEventoReq = firstTag(eventoEl, 'infEvento');
  const infEventoResp = firstTag(retEventoEl, 'infEvento');

  const chave = textOf(infEventoReq, 'chNFe') || textOf(infEventoResp, 'chNFe');
  const tpEvento = textOf(infEventoReq, 'tpEvento') || textOf(infEventoResp, 'tpEvento');
  const nSeqEvento = textOf(infEventoReq, 'nSeqEvento') || textOf(infEventoResp, 'nSeqEvento');
  const dhEvento = textOf(infEventoResp, 'dhRegEvento') || textOf(infEventoReq, 'dhEvento');
  const cStat = textOf(infEventoResp, 'cStat');
  const xMotivo = textOf(infEventoResp, 'xMotivo');
  const nProt = textOf(infEventoResp, 'nProt');
  const detEvento = firstTag(infEventoReq, 'detEvento');
  const xJust = textOf(detEvento, 'xJust');

  if (!chave) return null;

  const isCancelamento = tpEvento === '110111';
  const isSucesso = CANCEL_EVENT_CSTAT.includes(cStat);

  return {
    fileName, chave, tpEvento, xEvento: EVENTO_LABELS[tpEvento] || `Evento ${tpEvento}`,
    nSeqEvento, dhEvento, cStat, xMotivo: xMotivo || xJust, nProt,
    isCancelamentoHomologado: isCancelamento && isSucesso,
  };
}

function extractTes(det: Element, infCpl: string): string {
  const infAdProd = textOf(det, 'infAdProd');
  const combined = infAdProd + ' ' + infCpl;
  const m = combined.match(/TES\s*[:\-]?\s*(\d{2,6})/i);
  return m ? m[1] : '';
}

export type ItemIssue = { ruleId: string; severity: 'erro' | 'alerta'; message: string };

export type ParsedItem = {
  fileName: string;
  chave: string; nNF: string; serie: string; dhEmi: string; cnpjEmit: string; xNomeEmit: string;
  dadosAdicionais: string;
  nItem: string; cProd: string; xProd: string; ncm: string; cfop: string; tes: string;
  cClassTrib: string; cst: string; groupType: string;
  qCom: number | null; vUnCom: number | null; vProd: number | null;
  vDesc: number; vFrete: number; vSeg: number; vOutro: number;
  vBC: number | null;
  pIBSUF: number | null; vIBSUF: number | null; pIBSMun: number | null; vIBSMun: number | null;
  pIBSTotal: number | null; vIBS: number | null; pCBS: number | null; vCBS: number | null;
  hasIBS: boolean; hasCBS: boolean;
  cstPis: string; pPis: number | null; vPis: number | null;
  cstCofins: string; pCofins: number | null; vCofins: number | null;
  issues: ItemIssue[];
};

export type ParsedNFeResult = {
  error?: string;
  chave?: string; nNF?: string; serie?: string; dhEmi?: string; cnpjEmit?: string; xNomeEmit?: string;
  dadosAdicionais?: string;
  itemCount?: number; items?: ParsedItem[];
  statusBase?: string; statusDetailBase?: string; nProt?: string; dhProt?: string;
};

export function parseNFeXml(fileName: string, xmlText: string): ParsedNFeResult {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('XML malformado');
  } catch {
    return { error: 'XML malformado ou ilegível' };
  }
  const nfeEl = doc.getElementsByTagName('NFe')[0] || null;
  if (!nfeEl) return { error: 'Arquivo não contém uma NF-e (<NFe>) reconhecível' };
  const infNFe = firstTag(nfeEl, 'infNFe');
  if (!infNFe) return { error: 'Tag <infNFe> não encontrada' };

  let chave = (infNFe.getAttribute('Id') || '').replace(/^NFe/i, '');
  const protNFe = doc.getElementsByTagName('protNFe')[0] || null;
  const infProt = firstTag(protNFe, 'infProt');
  const protCStat = textOf(infProt, 'cStat');
  const protXMotivo = textOf(infProt, 'xMotivo');
  const protNProt = textOf(infProt, 'nProt');
  const protDh = textOf(infProt, 'dhRecbto');
  if (!chave) chave = textOf(infProt, 'chNFe');
  const statusInfo = statusFromCStat(protCStat, protXMotivo);

  const ide = firstTag(infNFe, 'ide');
  const nNF = textOf(ide, 'nNF');
  const serie = textOf(ide, 'serie');
  const dhEmi = textOf(ide, 'dhEmi') || textOf(ide, 'dEmi');

  const emit = firstTag(infNFe, 'emit');
  const cnpjEmit = textOf(emit, 'CNPJ');
  const xNomeEmit = textOf(emit, 'xNome');

  // Dados Adicionais da NF-e: combina Informações Complementares de interesse
  // do Contribuinte (infCpl) e Informações Adicionais de Interesse do Fisco
  // (infAdFisco, usada por bancos de dados fiscais como isenções/regimes
  // especiais) — nem toda nota preenche as duas, então junta o que existir.
  const infAdicEl = firstTag(infNFe, 'infAdic');
  const infCplText = textOf(infAdicEl, 'infCpl');
  const infAdFiscoText = textOf(infAdicEl, 'infAdFisco');
  const dadosAdicionais = [infCplText, infAdFiscoText].filter(Boolean).join(' | ');

  const dets = Array.from(infNFe.getElementsByTagName('det'));
  const items: ParsedItem[] = [];

  dets.forEach((det) => {
    const nItem = det.getAttribute('nItem') || '';
    const prod = firstTag(det, 'prod');
    const imposto = firstTag(det, 'imposto');
    const ibscbsRoot = firstTag(imposto, 'IBSCBS');

    const gIBSCBS = firstTag(ibscbsRoot, 'gIBSCBS');
    const gMono = firstTag(ibscbsRoot, 'gIBSCBSMono');
    const groupRoot = gIBSCBS || gMono;
    const groupType = gIBSCBS ? 'Ad valorem' : (gMono ? 'Monofásico' : '');

    const cst = textOf(ibscbsRoot, 'CST');
    const cClassTrib = textOf(ibscbsRoot, 'cClassTrib');
    const vBC = groupRoot ? textOf(groupRoot, 'vBC') : '';
    const gIBSUF = firstTag(groupRoot, 'gIBSUF');
    const gIBSMun = firstTag(groupRoot, 'gIBSMun');
    const gCBS = firstTag(groupRoot, 'gCBS');
    const pIBSUF = textOf(gIBSUF, 'pIBSUF');
    const vIBSUF = textOf(gIBSUF, 'vIBSUF');
    const pIBSMun = textOf(gIBSMun, 'pIBSMun');
    const vIBSMun = textOf(gIBSMun, 'vIBSMun');
    const vIBS = groupRoot ? textOf(groupRoot, 'vIBS') : '';
    const pCBS = textOf(gCBS, 'pCBS');
    const vCBS = textOf(gCBS, 'vCBS');

    const vProdNum = numOf(prod, 'vProd');

    const pisEl = firstTag(imposto, 'PIS');
    const cofinsEl = firstTag(imposto, 'COFINS');
    const cstPis = textOf(pisEl, 'CST');
    const pPis = numOf(pisEl, 'pPIS');
    const vPis = numOf(pisEl, 'vPIS');
    const cstCofins = textOf(cofinsEl, 'CST');
    const pCofins = numOf(cofinsEl, 'pCOFINS');
    const vCofins = numOf(cofinsEl, 'vCOFINS');

    const ctx: RuleContext = {
      ibscbsRoot, groupRoot, groupType, cst, cClassTrib, vBC,
      gIBSUF, gIBSMun, gCBS, pIBSUF, vIBSUF, pIBSMun, vIBSMun, vIBS, pCBS, vCBS,
      vProd: vProdNum,
    };

    const issues: ItemIssue[] = [];
    RULE_DEFINITIONS.forEach((rule) => {
      const res = rule.check(ctx);
      if (res) issues.push({ ruleId: rule.id, ...res });
    });

    const hasIBS = vIBS !== '' && !Number.isNaN(parseFloat(vIBS));
    const hasCBS = vCBS !== '' && !Number.isNaN(parseFloat(vCBS));

    items.push({
      fileName, chave, nNF, serie, dhEmi, cnpjEmit, xNomeEmit,
      dadosAdicionais,
      nItem,
      cProd: textOf(prod, 'cProd'),
      xProd: textOf(prod, 'xProd'),
      ncm: textOf(prod, 'NCM'),
      cfop: textOf(prod, 'CFOP'),
      tes: extractTes(det, dadosAdicionais),
      cClassTrib, cst, groupType,
      qCom: numOf(prod, 'qCom'),
      vUnCom: numOf(prod, 'vUnCom'),
      vProd: vProdNum,
      vDesc: numOf(prod, 'vDesc') || 0,
      vFrete: numOf(prod, 'vFrete') || 0,
      vSeg: numOf(prod, 'vSeg') || 0,
      vOutro: numOf(prod, 'vOutro') || 0,
      vBC: vBC !== '' ? parseFloat(vBC) : null,
      pIBSUF: pIBSUF !== '' ? parseFloat(pIBSUF) : null,
      vIBSUF: vIBSUF !== '' ? parseFloat(vIBSUF) : null,
      pIBSMun: pIBSMun !== '' ? parseFloat(pIBSMun) : null,
      vIBSMun: vIBSMun !== '' ? parseFloat(vIBSMun) : null,
      pIBSTotal: (pIBSUF !== '' || pIBSMun !== '') ? (parseFloat(pIBSUF || '0') + parseFloat(pIBSMun || '0')) : null,
      vIBS: vIBS !== '' ? parseFloat(vIBS) : null,
      pCBS: pCBS !== '' ? parseFloat(pCBS) : null,
      vCBS: vCBS !== '' ? parseFloat(vCBS) : null,
      hasIBS, hasCBS,
      cstPis, pPis, vPis, cstCofins, pCofins, vCofins,
      issues,
    });
  });

  return {
    chave, nNF, serie, dhEmi, cnpjEmit, xNomeEmit,
    dadosAdicionais,
    itemCount: dets.length,
    items,
    statusBase: statusInfo.status,
    statusDetailBase: statusInfo.detail,
    nProt: protNProt,
    dhProt: protDh,
  };
}
