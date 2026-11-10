// Relatórios do SPED Fiscal (EFD ICMS/IPI) — tipos.
//
// Princípio: nada é estimado. Todo valor vem direto de um registro do
// arquivo (C100/C190, D100/D190, E110/E111/E116) e carrega a origem; o que o
// arquivo não traz fica vazio, e o que não bate vira alerta.

export type Oper = 'E' | 'S'; // Entrada | Saída

export type LinhaAnalitica = {
  cst: string;
  cfop: string;
  aliq: number;
  vlOpr: number;
  vlBc: number;
  vlIcms: number;
  vlBcSt: number;
  vlIcmsSt: number;
  vlRedBc: number;
  vlIpi: number;
};

// Item da nota (C170): só o que identifica o produto e o liga à linha analítica
// (C190) do mesmo CST + CFOP + alíquota.
export type ItemEfd = { cod: string; descr: string; cst: string; cfop: string; aliq: number; qtd: number; unid: string; vlItem: number; vlBc: number; vlIcms: number };

export type DocEfd = {
  id: number;
  ym: string; // AAAAMM do ARQUIVO (período da escrituração) em que o documento está
  reg: 'C100' | 'D100';
  oper: Oper;
  sit: string; // COD_SIT
  codMod: string;
  serie: string;
  sub: string;
  numero: string;
  chave: string;
  dtDoc: string | null; // AAAA-MM-DD
  dtES: string | null;
  codPart: string;
  partNome: string;
  partDoc: string; // CNPJ ou CPF
  partUf: string;
  // valores do documento (uma vez por nota; nunca rateados nas linhas)
  vlDoc: number;
  vlDesc: number;
  vlMerc: number; // C100: produtos · D100: valor do serviço
  vlFrt: number;
  vlSeg: number;
  vlOutDa: number;
  vlBcIcms: number;
  vlIcms: number;
  vlBcSt: number;
  vlIcmsSt: number;
  vlIpi: number;
  linhas: LinhaAnalitica[];
  itens: ItemEfd[]; // C170 (vazio em CT-e e em notas sem detalhamento por item)
  // preenchido na consolidação: o documento já apareceu em outro arquivo
  duplicadoDe?: string;
};

export type AjusteApuracao = { cod: string; descr: string; valor: number; categoria: string };
export type ObrigacaoRecolher = { cod: string; valor: number; vencimento: string | null; codReceita: string; mesRef: string; txt: string };

// E110 — os 14 campos, na ordem do leiaute
export type ApuracaoE110 = {
  vlTotDebitos: number;
  vlAjDebitos: number;
  vlTotAjDebitos: number;
  vlEstornosCred: number;
  vlTotCreditos: number;
  vlAjCreditos: number;
  vlTotAjCreditos: number;
  vlEstornosDeb: number;
  vlSldCredorAnt: number;
  vlSldApurado: number;
  vlTotDed: number;
  vlIcmsRecolher: number;
  vlSldCredorTransportar: number;
  debEsp: number;
};

export type ApuracaoMes = {
  e110: ApuracaoE110 | null;
  ajustes: AjusteApuracao[];
  obrigacoes: ObrigacaoRecolher[];
  // há algum valor diferente de zero na apuração do DIFAL (E310) — só sinalizado;
  // o leiaute do E310 muda de versão e seus campos não são interpretados aqui
  difalMovimento?: boolean;
};

// Métricas do combustível comprado no mês (itens C170 com CFOP 1653/2653),
// usadas no demonstrativo do crédito outorgado de 20%.
export type CreditoMes = {
  docsComCombustivel: number;
  litros: number; // só itens com unidade L/LT
  vlItem: number;
  vlBc: number;
  vlIcms: number; // ICMS destacado nos itens de combustível
  itensOutraUnidade: number; // itens de combustível em outra unidade (não entram nos litros)
};

export type Alerta = { nivel: 'erro' | 'aviso' | 'info'; codigo: string; mensagem: string };

export type CabecalhoEfd = {
  codVer: string;
  codFin: string; // 0 original · 1 substituto
  dtIni: string; // AAAA-MM-DD
  dtFim: string;
  nome: string;
  cnpj: string;
  uf: string;
  ie: string;
  codMun: string;
  perfil: string;
  fantasia: string;
};

export type ArquivoEfd = {
  nomeArquivo: string;
  tamanho: number;
  cabecalho: CabecalhoEfd;
  ym: string; // AAAAMM
  docs: DocEfd[];
  apuracao: ApuracaoMes;
  registros: Record<string, number>; // contagem real por registro
  declarados: Record<string, number>; // 9900
  linhasLidas: number;
  total9999: number | null;
  alertas: Alerta[];
  // data/hora da assinatura digital do arquivo (signingTime do PKCS#7 que vem depois
  // do |9999|), em ISO UTC — é o que diz qual versão (original/retificadora) é a mais recente
  assinadoEm: string | null;
  // versão no nome do arquivo: finalidade (0 original / 1 retificadora) e início do hash
  versaoNome: { codFin: string; hash: string } | null;
};

// ---------------------------------------------------------------------
// Resumo mensal (é o que pode ser guardado no banco: poucos KB)
// ---------------------------------------------------------------------

export type LinhaResumo = {
  sit: string;
  cst: string;
  cfop: string;
  aliq: number;
  docs: number; // documentos distintos com essa combinação
  vlOpr: number;
  vlBc: number;
  vlIcms: number;
  vlBcSt: number;
  vlIcmsSt: number;
  vlRedBc: number;
  vlIpi: number;
};

export type TotaisResumo = {
  docs: number; // documentos (inclui cancelados)
  docsValidos: number;
  vlDoc: number;
  vlOpr: number;
  vlBc: number;
  vlIcms: number;
  vlBcSt: number;
  vlIcmsSt: number;
  vlIpi: number;
};

export type TopParticipante = { nome: string; doc: string; docs: number; valor: number };

export type Conferencia = {
  icmsSaidasAnalitico: number;
  icmsEntradasAnalitico: number;
  e110Debitos: number | null;
  e110Creditos: number | null;
  difDebitos: number | null; // analítico − E110
  difCreditos: number | null;
  saldoCalculado: number | null; // saldo devedor (>0) ou credor (<0) recalculado a partir dos campos do E110
  saldoDeclarado: number | null;
  docsComDiferencaValor: { oper: Oper; numero: string; vlDoc: number; vlOpr: number }[];
  docsSemAnalitico: number;
  duplicadosIgnorados: number;
};

export type ResumoMensal = {
  versao: 1;
  ym: string;
  empresa: { nome: string; cnpj: string; ie: string; uf: string; perfil: string };
  codVer: string;
  codFin: string;
  nomeArquivo: string;
  entradas: { linhas: LinhaResumo[]; totais: TotaisResumo; top: TopParticipante[] };
  saidas: { linhas: LinhaResumo[]; totais: TotaisResumo; top: TopParticipante[] };
  apuracao: ApuracaoMes;
  conferencia: Conferencia;
  alertas: Alerta[];
  credito?: CreditoMes; // ausente em resumos salvos antes do demonstrativo de crédito
};
