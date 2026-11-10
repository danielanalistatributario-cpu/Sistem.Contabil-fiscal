import type { Alerta, ApuracaoE110, ArquivoEfd, CabecalhoEfd, DocEfd, LinhaAnalitica, Oper } from './tipos';
import { CATEGORIA_AJUSTE } from './rotulos';
import { UF_POR_PREFIXO_IBGE } from '../sped-nfe-report';

// Leitor do SPED Fiscal (EFD ICMS/IPI). Lê só o que os relatórios usam:
//   0000 (cabeçalho) · 0005 (fantasia) · 0150 (participantes)
//   C100/C190 (NF, NF-e, NFC-e...) · D100/D190 (CT-e e transportes)
//   E110/E111/E116 (apuração do ICMS — operações próprias)
// e CONTA o resto. Posições dos campos conferidas contra dado real
// (EFD COD_VER 010, 2016) e contra os PDFs do PVA.
//
// Termina em `|9999|`: depois dele vem a assinatura digital (binário) —
// por isso o texto deve ser lido como latin1.

const REGISTROS_DOC_IGNORADOS_OK = new Set([
  'C001', 'C100', 'C101', 'C105', 'C110', 'C111', 'C112', 'C113', 'C114', 'C115', 'C116', 'C120', 'C130', 'C140', 'C141', 'C160', 'C165',
  'C170', 'C171', 'C172', 'C173', 'C174', 'C175', 'C176', 'C177', 'C178', 'C179', 'C180', 'C181', 'C185', 'C186', 'C190', 'C191', 'C195', 'C197', 'C990',
  'D001', 'D100', 'D101', 'D110', 'D120', 'D130', 'D140', 'D150', 'D160', 'D161', 'D162', 'D170', 'D180', 'D190', 'D195', 'D197', 'D990',
]);

// Registros de documentos/analíticos que existem na EFD mas ainda NÃO entram
// nos relatórios (ECF/cupom, NF consumidor consolidada, energia, telecom...).
const RE_NAO_PROCESSADO = /^(C[3-8]\d\d|D[3-7]\d\d)$/;

const num = (v: string | undefined): number => {
  if (!v) return 0;
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

function dataIso(v: string | undefined): string | null {
  if (!v || v.length !== 8) return null;
  const dd = v.slice(0, 2), mm = v.slice(2, 4), aaaa = v.slice(4, 8);
  const d = parseInt(dd, 10), m = parseInt(mm, 10);
  if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12)) return null;
  return `${aaaa}-${mm}-${dd}`;
}

// Id de documento único em TODA a sessão (vários arquivos): ids repetidos entre
// meses fariam documentos diferentes parecerem o mesmo nas listas e totais.
let contadorGlobalDocs = 0;

// signingTime (OID 1.2.840.113549.1.9.5) dentro do PKCS#7 que fica depois do |9999|.
// Retorna ISO UTC ou null. `bytes` = o arquivo cru (o texto decodificado em windows-1252
// tem o mesmo tamanho em caracteres, então o mesmo deslocamento serve).
const OID_SIGNING_TIME = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x05];

export function extrairAssinatura(bytes: Uint8Array, inicio: number): string | null {
  const fimBusca = bytes.length - OID_SIGNING_TIME.length - 6;
  for (let i = Math.max(0, inicio); i < fimBusca; i++) {
    if (bytes[i] !== 0x06) continue;
    let ok = true;
    for (let k = 1; k < OID_SIGNING_TIME.length; k++) {
      if (bytes[i + k] !== OID_SIGNING_TIME[k]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    // depois do OID: SET (0x31 len) e então UTCTime (0x17 len) ou GeneralizedTime (0x18 len)
    for (let j = i + OID_SIGNING_TIME.length; j < i + OID_SIGNING_TIME.length + 6; j++) {
      const tag = bytes[j];
      if (tag !== 0x17 && tag !== 0x18) continue;
      const len = bytes[j + 1];
      let t = '';
      for (let k = 0; k < len; k++) t += String.fromCharCode(bytes[j + 2 + k]);
      const m = tag === 0x17 ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/.exec(t) : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/.exec(t);
      if (!m) return null;
      const ano = tag === 0x17 ? (parseInt(m[1], 10) >= 50 ? 1900 : 2000) + parseInt(m[1], 10) : parseInt(m[1], 10);
      return `${ano}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}Z`;
    }
    return null;
  }
  return null;
}

export function lerEfdIcms(texto: string, nomeArquivo: string, bytes?: Uint8Array): ArquivoEfd {
  const alertas: Alerta[] = [];
  const registros: Record<string, number> = {};
  const declarados: Record<string, number> = {};
  const participantes = new Map<string, { nome: string; doc: string; uf: string }>();
  const produtos = new Map<string, string>(); // 0200: COD_ITEM → DESCR_ITEM (strings compartilhadas entre os itens)
  const docs: DocEfd[] = [];
  const ajustes: ArquivoEfd['apuracao']['ajustes'] = [];
  const obrigacoes: ArquivoEfd['apuracao']['obrigacoes'] = [];
  let e110: ApuracaoE110 | null = null;
  let difalMovimento = false;
  let cab: CabecalhoEfd | null = null;
  let atual: DocEfd | null = null;
  let linhasLidas = 0;
  let total9999: number | null = null;

  let pos = 0;
  const tam = texto.length;
  while (pos < tam) {
    let fim = texto.indexOf('\n', pos);
    if (fim < 0) fim = tam;
    let linha = texto.slice(pos, fim);
    pos = fim + 1;
    if (linha.charCodeAt(linha.length - 1) === 13) linha = linha.slice(0, -1);
    if (linha.charCodeAt(0) !== 124) continue; // só linhas que começam com '|'
    linhasLidas++;
    const c = linha.split('|'); // c[1] = registro
    const reg = c[1];
    registros[reg] = (registros[reg] ?? 0) + 1;

    switch (reg) {
      case '0000':
        cab = {
          codVer: c[2] ?? '',
          codFin: c[3] ?? '',
          dtIni: dataIso(c[4]) ?? '',
          dtFim: dataIso(c[5]) ?? '',
          nome: (c[6] ?? '').trim(),
          cnpj: c[7] ?? '',
          uf: c[9] ?? '',
          ie: c[10] ?? '',
          codMun: c[11] ?? '',
          perfil: c[14] ?? '',
          fantasia: '',
        };
        break;
      case '0005':
        if (cab) cab.fantasia = (c[2] ?? '').trim();
        break;
      case '0150':
        participantes.set(c[2] ?? '', {
          nome: (c[3] ?? '').trim(),
          doc: c[5] || c[6] || '',
          uf: c[8] ? UF_POR_PREFIXO_IBGE[c[8].slice(0, 2)] || '' : '',
        });
        break;
      case '0200':
        produtos.set(c[2] ?? '', (c[3] ?? '').trim());
        break;
      case 'C170': {
        // NUM_ITEM|COD_ITEM|DESCR_COMPL|QTD|UNID|VL_ITEM|VL_DESC|IND_MOV|CST_ICMS|CFOP|COD_NAT|VL_BC_ICMS|ALIQ_ICMS|...
        if (!atual || atual.reg !== 'C100') break;
        const cod = c[3] ?? '';
        atual.itens.push({ cod, descr: (c[4] ?? '').trim(), cst: c[10] ?? '', cfop: c[11] ?? '', aliq: num(c[14]), qtd: num(c[5]), unid: (c[6] ?? '').trim(), vlItem: num(c[7]), vlBc: num(c[13]), vlIcms: num(c[15]) });
        break;
      }
      case 'C100': {
        // IND_OPER|IND_EMIT|COD_PART|COD_MOD|COD_SIT|SER|NUM_DOC|CHV_NFE|DT_DOC|DT_E_S|VL_DOC|IND_PGTO|VL_DESC|VL_ABAT_NT|VL_MERC|IND_FRT|VL_FRT|VL_SEG|VL_OUT_DA|VL_BC_ICMS|VL_ICMS|VL_BC_ICMS_ST|VL_ICMS_ST|VL_IPI
        atual = {
          id: ++contadorGlobalDocs,
          ym: '',
          reg: 'C100',
          oper: c[2] === '0' ? 'E' : 'S',
          sit: c[6] ?? '',
          codMod: c[5] ?? '',
          serie: c[7] ?? '',
          sub: '',
          numero: c[8] ?? '',
          chave: c[9] ?? '',
          dtDoc: dataIso(c[10]),
          dtES: dataIso(c[11]),
          codPart: c[4] ?? '',
          partNome: '',
          partDoc: '',
          partUf: '',
          vlDoc: num(c[12]),
          vlDesc: num(c[14]),
          vlMerc: num(c[16]),
          vlFrt: num(c[18]),
          vlSeg: num(c[19]),
          vlOutDa: num(c[20]),
          vlBcIcms: num(c[21]),
          vlIcms: num(c[22]),
          vlBcSt: num(c[23]),
          vlIcmsSt: num(c[24]),
          vlIpi: num(c[25]),
          linhas: [],
          itens: [],
        };
        docs.push(atual);
        break;
      }
      case 'D100': {
        // IND_OPER|IND_EMIT|COD_PART|COD_MOD|COD_SIT|SER|SUB|NUM_DOC|CHV_CTE|DT_DOC|DT_A_P|TP_CT-e|CHV_CTE_REF|VL_DOC|VL_DESC|IND_FRT|VL_SERV|VL_BC_ICMS|VL_ICMS|VL_NT|...
        atual = {
          id: ++contadorGlobalDocs,
          ym: '',
          reg: 'D100',
          oper: c[2] === '0' ? 'E' : 'S',
          sit: c[6] ?? '',
          codMod: c[5] ?? '',
          serie: c[7] ?? '',
          sub: c[8] ?? '',
          numero: c[9] ?? '',
          chave: c[10] ?? '',
          dtDoc: dataIso(c[11]),
          dtES: dataIso(c[12]),
          codPart: c[4] ?? '',
          partNome: '',
          partDoc: '',
          partUf: '',
          vlDoc: num(c[15]),
          vlDesc: num(c[16]),
          vlMerc: num(c[18]),
          vlFrt: 0,
          vlSeg: 0,
          vlOutDa: 0,
          vlBcIcms: num(c[19]),
          vlIcms: num(c[20]),
          vlBcSt: 0,
          vlIcmsSt: 0,
          vlIpi: 0,
          linhas: [],
          itens: [],
        };
        docs.push(atual);
        break;
      }
      case 'C190':
      case 'D190': {
        // C190: CST|CFOP|ALIQ|VL_OPR|VL_BC_ICMS|VL_ICMS|VL_BC_ICMS_ST|VL_ICMS_ST|VL_RED_BC|VL_IPI|COD_OBS
        // D190: CST|CFOP|ALIQ|VL_OPR|VL_BC_ICMS|VL_ICMS|VL_RED_BC|COD_OBS
        if (!atual || atual.reg !== (reg === 'C190' ? 'C100' : 'D100')) break;
        const l: LinhaAnalitica =
          reg === 'C190'
            ? { cst: c[2] ?? '', cfop: c[3] ?? '', aliq: num(c[4]), vlOpr: num(c[5]), vlBc: num(c[6]), vlIcms: num(c[7]), vlBcSt: num(c[8]), vlIcmsSt: num(c[9]), vlRedBc: num(c[10]), vlIpi: num(c[11]) }
            : { cst: c[2] ?? '', cfop: c[3] ?? '', aliq: num(c[4]), vlOpr: num(c[5]), vlBc: num(c[6]), vlIcms: num(c[7]), vlBcSt: 0, vlIcmsSt: 0, vlRedBc: num(c[8]), vlIpi: 0 };
        atual.linhas.push(l);
        break;
      }
      case 'E110': {
        const v = (i: number) => num(c[i]);
        e110 = {
          vlTotDebitos: v(2),
          vlAjDebitos: v(3),
          vlTotAjDebitos: v(4),
          vlEstornosCred: v(5),
          vlTotCreditos: v(6),
          vlAjCreditos: v(7),
          vlTotAjCreditos: v(8),
          vlEstornosDeb: v(9),
          vlSldCredorAnt: v(10),
          vlSldApurado: v(11),
          vlTotDed: v(12),
          vlIcmsRecolher: v(13),
          vlSldCredorTransportar: v(14),
          debEsp: v(15),
        };
        break;
      }
      case 'E310':
        // só sinaliza movimento (qualquer valor ≠ 0 depois do IND_MOV_DIFAL)
        for (let i = 3; i < c.length; i++) if (num(c[i]) !== 0) difalMovimento = true;
        break;
      case 'E111': {
        const cod = c[2] ?? '';
        ajustes.push({ cod, descr: (c[3] ?? '').trim(), valor: num(c[4]), categoria: CATEGORIA_AJUSTE[cod[3]] ?? 'Não classificado pelo código' });
        break;
      }
      case 'E116':
        obrigacoes.push({ cod: c[2] ?? '', valor: num(c[3]), vencimento: dataIso(c[4]), codReceita: c[5] ?? '', mesRef: c[10] ?? '', txt: (c[9] ?? '').trim() });
        break;
      case '9900':
        declarados[c[2] ?? ''] = num(c[3]);
        break;
      case '9999':
        total9999 = num(c[2]);
        pos = tam; // o que vem depois é a assinatura digital
        break;
      default:
        // fim do bloco: documento deixa de ser "o atual"
        if (/^[CD]990$/.test(reg)) atual = null;
    }
  }

  if (!cab) {
    alertas.push({ nivel: 'erro', codigo: 'SEM_0000', mensagem: 'O arquivo não tem o registro 0000 — não parece ser um SPED Fiscal (EFD ICMS/IPI).' });
    cab = { codVer: '', codFin: '', dtIni: '', dtFim: '', nome: '', cnpj: '', uf: '', ie: '', codMun: '', perfil: '', fantasia: '' };
  }
  const ym = cab.dtIni ? cab.dtIni.slice(0, 4) + cab.dtIni.slice(5, 7) : '';
  if (cab.dtIni && cab.dtFim && cab.dtIni.slice(0, 7) !== cab.dtFim.slice(0, 7)) {
    alertas.push({ nivel: 'aviso', codigo: 'PERIODO_NAO_MENSAL', mensagem: `O período do arquivo (${cab.dtIni} a ${cab.dtFim}) não é um mês fechado.` });
  }

  let semParticipante = 0;
  for (const d of docs) {
    d.ym = ym;
    // nome do produto: o do cadastro (0200); sem ele, a descrição do próprio item; sem as duas, o código
    for (const it of d.itens) it.descr = produtos.get(it.cod) || it.descr || it.cod;
    const p = participantes.get(d.codPart);
    if (p) {
      d.partNome = p.nome;
      d.partDoc = p.doc;
      d.partUf = p.uf;
    } else if (d.codPart) semParticipante++;
  }
  if (semParticipante > 0) {
    alertas.push({ nivel: 'aviso', codigo: 'PARTICIPANTE_NAO_ENCONTRADO', mensagem: `${semParticipante} documento(s) com código de participante que não consta no cadastro (registro 0150) — nome e CNPJ/CPF ficam em branco.` });
  }

  // conferências do próprio arquivo
  if (total9999 !== null && total9999 !== linhasLidas) {
    alertas.push({ nivel: 'aviso', codigo: 'TOTAL_9999', mensagem: `O registro 9999 declara ${total9999} linhas, mas o arquivo tem ${linhasLidas}.` });
  }
  const divergentes = Object.entries(declarados).filter(([r, q]) => r !== '9900' && (registros[r] ?? 0) !== q);
  if (divergentes.length > 0) {
    alertas.push({
      nivel: 'aviso',
      codigo: 'CONTAGEM_9900',
      mensagem: `Contagem de registros (9900) diferente da real em: ${divergentes.slice(0, 6).map(([r, q]) => `${r} (declarado ${q}, real ${registros[r] ?? 0})`).join('; ')}${divergentes.length > 6 ? '…' : ''}.`,
    });
  }
  const naoProcessados = Object.keys(registros).filter((r) => RE_NAO_PROCESSADO.test(r) && !REGISTROS_DOC_IGNORADOS_OK.has(r));
  if (naoProcessados.length > 0) {
    alertas.push({
      nivel: 'aviso',
      codigo: 'REGISTROS_NAO_PROCESSADOS',
      mensagem: `O arquivo tem registros de documentos/analíticos que esta versão ainda não lê (${naoProcessados.map((r) => `${r}: ${registros[r]}`).join(', ')}). Os relatórios NÃO incluem esses valores.`,
    });
  }
  if (registros['E112'] || registros['E113']) {
    alertas.push({
      nivel: 'aviso',
      codigo: 'AJUSTES_COM_DOCUMENTOS',
      mensagem: `O arquivo tem documentos vinculados aos ajustes da apuração (E112: ${registros['E112'] ?? 0}, E113: ${registros['E113'] ?? 0}). Esta versão ainda não lê esses registros — os ajustes aparecem só com código, descrição e valor.`,
    });
  }
  if (!e110) alertas.push({ nivel: 'aviso', codigo: 'SEM_E110', mensagem: 'O arquivo não tem apuração do ICMS (registro E110).' });
  if (docs.length === 0) alertas.push({ nivel: 'info', codigo: 'SEM_DOCS', mensagem: 'O arquivo não tem documentos nos registros C100/D100.' });

  return {
    nomeArquivo,
    tamanho: texto.length,
    assinadoEm: bytes ? extrairAssinatura(bytes, Math.max(0, texto.lastIndexOf('|9999|'))) : null,
    versaoNome: (() => {
      const m = /-(\d)-([0-9A-Fa-f]{40})-SPED-EFD/i.exec(nomeArquivo);
      return m ? { codFin: m[1], hash: m[2].toUpperCase() } : null;
    })(),
    cabecalho: cab,
    ym,
    docs,
    apuracao: { e110, ajustes, obrigacoes, difalMovimento },
    registros,
    declarados,
    linhasLidas,
    total9999,
    alertas,
  };
}

export type { Oper };
