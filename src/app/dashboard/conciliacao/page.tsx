'use client';

import { useState, useEffect, useRef, Suspense, Fragment } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { History, Landmark } from 'lucide-react';
import { ImportHero } from '@/components/ImportHero';
import * as XLSX from 'xlsx';
import { lerBalancete, lerRazao, lerExtratoBancario } from '@/lib/conciliacao-reader';

type LancamentoDB = {
  id: string;
  data: string | null;
  historico: string | null;
  debito: number;
  credito: number;
  tipoAlerta: string;
};

type ContaDB = {
  id: string;
  conta: string;
  descricao: string | null;
  saldoInicial: number;
  debitoBalancete: number;
  creditoBalancete: number;
  saldoFinalBalancete: number;
  debitoRazao: number;
  creditoRazao: number;
  saldoCalculado: number;
  diferencaSaldo: number;
  diferencaDebito: number;
  diferencaCredito: number;
  status: 'CONCILIADA' | 'PENDENTE';
  semMovimentacao: boolean;
  mesesSemMovimentacao: number;
  extratoSaldoFinal: number | null;
  extratoDiferenca: number | null;
  observacoes: string | null;
  lancamentos: LancamentoDB[];
};

type ApuracaoDB = {
  id: string;
  periodo: string;
  modoAnalise: 'BALANCETE' | 'CONTA_ESPECIFICA';
  contasAnalisadas: string | null;
  totalContas: number;
  contasConciliadas: number;
  contasDivergentes: number;
  valorTotalDiferenca: number;
  processedAt: string;
  contas: ContaDB[];
};

function fmtBRL(n: number | null | undefined) {
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtDate(v: string | null) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

const ALERTA_LABEL: Record<string, string> = {
  DUPLICADO: 'Duplicado',
  SEM_HISTORICO: 'Sem histórico',
  FORA_DO_PADRAO: 'Fora do padrão',
  OUTRA_CONTA: 'Possível outra conta',
  SEM_EXTRATO: 'Sem correspondência no extrato',
};

export default function ConciliacaoPage() {
  return (
    <Suspense fallback={null}>
      <ConciliacaoPageInner />
    </Suspense>
  );
}

function ConciliacaoPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const apuracaoIdParam = searchParams.get('apuracaoId');

  const [balanceteFile, setBalanceteFile] = useState<File | null>(null);
  const [importarRazao, setImportarRazao] = useState(true);
  const [razaoFile, setRazaoFile] = useState<File | null>(null);
  const [importarExtrato, setImportarExtrato] = useState(false);
  const [extratoFile, setExtratoFile] = useState<File | null>(null);
  const [periodo, setPeriodo] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [apuracao, setApuracao] = useState<ApuracaoDB | null>(null);
  const [view, setView] = useState<'dashboard' | 'contas' | 'relatorio'>('dashboard');
  const [contaAberta, setContaAberta] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<'TODAS' | 'CONCILIADA' | 'PENDENTE'>('TODAS');
  const balanceteRef = useRef<HTMLInputElement>(null);
  const razaoRef = useRef<HTMLInputElement>(null);
  const extratoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!apuracaoIdParam) return;
    (async () => {
      const res = await fetch(`/api/conciliacao/apuracoes/${apuracaoIdParam}`);
      if (res.ok) {
        const data = await res.json();
        setApuracao(data.apuracao);
      }
    })();
  }, [apuracaoIdParam]);

  async function readAoa(file: File): Promise<unknown[][]> {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }) as unknown[][];
  }

  async function handleProcessar() {
    if (!balanceteFile) return;
    if (importarRazao && !razaoFile) {
      setErro('Marque "Importar Razão" exige selecionar o arquivo do Razão, ou desmarque a opção para uma análise só do Balancete.');
      return;
    }
    setErro(null);
    setLoading(true);

    try {
      const aoaBalancete = await readAoa(balanceteFile);
      const leituraBalancete = lerBalancete(aoaBalancete);
      if (leituraBalancete.erro) {
        setErro(leituraBalancete.erro);
        setLoading(false);
        return;
      }

      let razaoRows: ReturnType<typeof lerRazao>['rows'] = [];
      if (importarRazao && razaoFile) {
        const aoaRazao = await readAoa(razaoFile);
        const leituraRazao = lerRazao(aoaRazao);
        if (leituraRazao.erro) {
          setErro(leituraRazao.erro);
          setLoading(false);
          return;
        }
        razaoRows = leituraRazao.rows;
      }

      let extratoRows: ReturnType<typeof lerExtratoBancario>['rows'] | null = null;
      if (importarExtrato && extratoFile) {
        const aoaExtrato = await readAoa(extratoFile);
        const leituraExtrato = lerExtratoBancario(aoaExtrato);
        if (leituraExtrato.erro) {
          setErro(leituraExtrato.erro);
          setLoading(false);
          return;
        }
        extratoRows = leituraExtrato.rows;
      }

      const res = await fetch('/api/conciliacao/apurar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodo,
          balancete: leituraBalancete.rows,
          razao: razaoRows.map((r) => ({ ...r, data: r.data ? r.data.toISOString() : null })),
          extrato: extratoRows ? extratoRows.map((e) => ({ ...e, data: e.data ? e.data.toISOString() : null })) : null,
        }),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok) {
        setErro(data.error || 'Falha ao processar.');
        return;
      }
      setApuracao(data.apuracao);
      setView('dashboard');
    } catch (err) {
      setLoading(false);
      setErro('Não foi possível ler os arquivos. Verifique se são .xlsx válidos.');
      console.error(err);
    }
  }

  function handleNovaConciliacao() {
    setApuracao(null);
    setBalanceteFile(null);
    setRazaoFile(null);
    setExtratoFile(null);
    setImportarRazao(true);
    setImportarExtrato(false);
    setPeriodo('');
    setErro(null);
    if (balanceteRef.current) balanceteRef.current.value = '';
    if (razaoRef.current) razaoRef.current.value = '';
    if (extratoRef.current) extratoRef.current.value = '';
    router.replace('/dashboard/conciliacao');
  }

  function exportarExcel() {
    if (!apuracao) return;
    const rows = apuracao.contas.map((c) => ({
      Conta: c.conta,
      Descrição: c.descricao,
      'Saldo Contábil (Balancete)': c.saldoFinalBalancete,
      'Saldo Encontrado (Razão)': c.saldoCalculado,
      Diferença: c.diferencaSaldo,
      Status: c.status === 'CONCILIADA' ? 'Conciliada' : 'Pendente',
      Observações: c.observacoes || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Conciliação');
    const resumo = [
      { Indicador: 'Período', Valor: apuracao.periodo },
      { Indicador: 'Modo de análise', Valor: apuracao.modoAnalise === 'BALANCETE' ? 'Balancete completo' : `Conta(s) específica(s): ${apuracao.contasAnalisadas}` },
      { Indicador: 'Total de contas', Valor: apuracao.totalContas },
      { Indicador: 'Contas conciliadas', Valor: apuracao.contasConciliadas },
      { Indicador: 'Contas divergentes', Valor: apuracao.contasDivergentes },
      { Indicador: 'Valor total das diferenças', Valor: apuracao.valorTotalDiferenca },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Resumo');
    XLSX.writeFile(wb, `Conciliacao_${apuracao.periodo.replace('/', '-')}.xlsx`);
  }

  const percentConciliacao = apuracao && apuracao.totalContas > 0 ? (apuracao.contasConciliadas / apuracao.totalContas) * 100 : 0;

  const contasFiltradas = apuracao
    ? apuracao.contas.filter((c) => filtroStatus === 'TODAS' || c.status === filtroStatus)
    : [];

  return (
    <div className="space-y-6">
      {!apuracao ? (
        <>
          <ImportHero
            eyebrow="Balancete × Razão · Sem IA, só regras claras"
            titleParts={['Conciliação', { text: 'Contábil', accent: true }, 'inteligente']}
            description="Importe o Balancete e o Razão — o sistema recalcula os saldos, aponta divergências, lançamentos duplicados, sem histórico ou fora do padrão, prontos para revisão."
            badges={['Analisa só o que você importar', 'Duplicados, sem histórico e fora do padrão']}
          />
          <Link
            href="/dashboard/conciliacao/bancaria"
            className="flex items-center justify-between gap-4 card-surface p-4 hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 border-l-4 border-l-pink"
          >
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg bg-pink/10 flex items-center justify-center shrink-0">
                <Landmark size={16} className="text-pink" />
              </span>
              <div>
                <p className="text-sm font-medium text-gray-800">Vai conciliar a conta Banco?</p>
                <p className="text-xs text-gray-500">Use a Conciliação Bancária — compara Razão × Extrato dia a dia, com pareamento inteligente de lançamentos.</p>
              </div>
            </div>
            <span className="text-sm text-pink font-medium whitespace-nowrap">Abrir →</span>
          </Link>
        </>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-semibold text-brand">Conciliação Contábil</h1>
            <p className="text-gray-500 text-sm mt-1">
              Compara o Balancete com o Razão, identifica divergências, lançamentos duplicados, sem histórico e fora do
              padrão — sem uso de IA, só regras claras e conferíveis.
            </p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <Link href="/dashboard/conciliacao/historico" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
              <History size={15} />
              Histórico
            </Link>
            <button onClick={handleNovaConciliacao} className="text-sm text-brand underline whitespace-nowrap">
              + Nova conciliação
            </button>
          </div>
        </div>
      )}

      {!apuracao && (
        <div className="flex justify-end">
          <Link href="/dashboard/conciliacao/historico" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
            <History size={15} />
            Ver histórico de conciliações
          </Link>
        </div>
      )}

      {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>}

      {!apuracao && (
        <div className="card-surface p-5 space-y-5">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Balancete Contábil (obrigatório)</label>
            <input ref={balanceteRef} type="file" accept=".xlsx,.xls" onChange={(e) => setBalanceteFile(e.target.files?.[0] || null)} className="text-sm" />
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-xs font-medium text-gray-600">Quais arquivos você quer importar nesta conciliação?</p>

            <div className="flex items-start gap-3">
              <label className="flex items-center gap-2 text-sm w-52">
                <input type="checkbox" checked={importarRazao} onChange={(e) => setImportarRazao(e.target.checked)} className="w-4 h-4" />
                Razão Contábil
              </label>
              {importarRazao && (
                <div>
                  <input ref={razaoRef} type="file" accept=".xlsx,.xls" onChange={(e) => setRazaoFile(e.target.files?.[0] || null)} className="text-sm" />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Pode conter uma única conta (ex: só o Bradesco) ou várias — a análise detalhada é feita só nas contas presentes no arquivo. Se desmarcar esta opção, o sistema faz uma análise geral usando só o Balancete.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-start gap-3">
              <label className="flex items-center gap-2 text-sm w-52">
                <input type="checkbox" checked={importarExtrato} onChange={(e) => setImportarExtrato(e.target.checked)} className="w-4 h-4" />
                Extrato Bancário
              </label>
              {importarExtrato && (
                <div>
                  <input ref={extratoRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setExtratoFile(e.target.files?.[0] || null)} className="text-sm" />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Formato Excel/CSV (Data, Histórico, Valor ou Débito/Crédito). Comparado com a(s) conta(s) do Razão importado.
                  </p>
                </div>
              )}
            </div>

            {[
              { label: 'Contas a Pagar', match: '× Fornecedores' },
              { label: 'Contas a Receber', match: '× Clientes' },
              { label: 'Folha de Pagamento', match: '× Contas de Salários' },
              { label: 'Visão Gerencial (Protheus)', match: '× Balancete' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 opacity-50">
                <label className="flex items-center gap-2 text-sm w-52">
                  <input type="checkbox" disabled className="w-4 h-4" />
                  {item.label}
                </label>
                <span className="text-[11px] text-gray-400">{item.match} — em breve, me envie um exemplo do arquivo para eu implementar</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <input
              type="text"
              placeholder="Período, ex: 06/2026"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-40"
            />
            <button
              onClick={handleProcessar}
              disabled={!balanceteFile || loading}
              className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Processando...' : 'Processar conciliação'}
            </button>
          </div>
        </div>
      )}

      {apuracao && (
        <>
          <div className="flex gap-2 border-b border-gray-200">
            {(['dashboard', 'contas', 'relatorio'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                  view === v ? 'border-brand text-brand' : 'border-transparent text-gray-500'
                }`}
              >
                {v === 'dashboard' ? 'Dashboard' : v === 'contas' ? 'Contas' : 'Relatório'}
              </button>
            ))}
          </div>

          {view === 'dashboard' && (
            <div className="space-y-6">
              <p className="text-xs text-gray-400">
                Período {apuracao.periodo} ·{' '}
                {apuracao.modoAnalise === 'BALANCETE' ? 'análise geral do Balancete' : `análise da(s) conta(s): ${apuracao.contasAnalisadas}`} ·
                processado em {new Date(apuracao.processedAt).toLocaleString('pt-BR')}
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="card-surface p-4">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Total de contas</p>
                  <p className="text-2xl font-bold text-gray-800 mt-1">{apuracao.totalContas}</p>
                </div>
                <div className="card-surface p-4">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Conciliadas</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">{apuracao.contasConciliadas}</p>
                </div>
                <div className={`card-surface p-4 ${apuracao.contasDivergentes > 0 ? 'border border-ruby/40' : ''}`}>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Divergentes</p>
                  <p className={`text-2xl font-bold mt-1 ${apuracao.contasDivergentes > 0 ? 'text-ruby' : 'text-gray-800'}`}>
                    {apuracao.contasDivergentes}
                  </p>
                </div>
                <div className="card-surface p-4">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Diferença total</p>
                  <p className="text-2xl font-bold text-accent mt-1">{fmtBRL(apuracao.valorTotalDiferenca)}</p>
                </div>
                <div className="card-surface p-4 relative overflow-hidden">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">% Conciliação</p>
                  <p className="text-2xl font-bold text-gray-800 mt-1">{percentConciliacao.toFixed(0)}%</p>
                  <div className="absolute bottom-0 left-0 h-[3px] bg-gray-100 w-full">
                    <div className="h-full bg-green-500" style={{ width: `${percentConciliacao}%` }} />
                  </div>
                </div>
              </div>

              <div className="card-surface p-5">
                <h2 className="font-semibold text-brand mb-3">Contas com maior divergência</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-gray-100">
                        <th className="py-1.5 pr-3">Conta</th>
                        <th className="py-1.5 pr-3">Descrição</th>
                        <th className="py-1.5 pr-3">Diferença</th>
                        <th className="py-1.5 pr-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apuracao.contas.slice(0, 8).map((c) => (
                        <tr key={c.id} className="border-b border-gray-50">
                          <td className="py-1.5 pr-3 font-medium">{c.conta}</td>
                          <td className="py-1.5 pr-3">{c.descricao}</td>
                          <td className={`py-1.5 pr-3 font-mono ${Math.abs(c.diferencaSaldo) > 0.01 ? 'text-ruby font-semibold' : 'text-gray-400'}`}>
                            {fmtBRL(c.diferencaSaldo)}
                          </td>
                          <td className="py-1.5 pr-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.status === 'CONCILIADA' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {c.status === 'CONCILIADA' ? 'Conciliada' : 'Pendente'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {view === 'contas' && (
            <div className="card-surface p-5">
              <div className="flex gap-2 mb-4">
                {(['TODAS', 'PENDENTE', 'CONCILIADA'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFiltroStatus(f)}
                    className={`text-sm px-3 py-1.5 rounded-lg border ${
                      filtroStatus === f ? 'bg-brand text-white border-brand' : 'border-gray-300 text-gray-600'
                    }`}
                  >
                    {f === 'TODAS' ? 'Todas' : f === 'CONCILIADA' ? 'Conciliadas' : 'Pendentes'}
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[900px]">
                  <thead>
                    <tr className="bg-brand text-white text-left">
                      <th className="px-3 py-2">Conta</th>
                      <th className="px-3 py-2">Descrição</th>
                      <th className="px-3 py-2">Saldo Balancete</th>
                      <th className="px-3 py-2">Saldo Calculado</th>
                      <th className="px-3 py-2">Diferença</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {contasFiltradas.map((c) => (
                      <Fragment key={c.id}>
                        <tr className="border-b border-gray-50">
                          <td className="px-3 py-1.5 font-medium">{c.conta}</td>
                          <td className="px-3 py-1.5 max-w-[220px] truncate">{c.descricao}</td>
                          <td className="px-3 py-1.5 font-mono text-right">{fmtBRL(c.saldoFinalBalancete)}</td>
                          <td className="px-3 py-1.5 font-mono text-right">{fmtBRL(c.saldoCalculado)}</td>
                          <td className={`px-3 py-1.5 font-mono text-right ${Math.abs(c.diferencaSaldo) > 0.01 ? 'text-ruby font-semibold' : 'text-gray-400'}`}>
                            {fmtBRL(c.diferencaSaldo)}
                          </td>
                          <td className="px-3 py-1.5">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.status === 'CONCILIADA' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {c.status === 'CONCILIADA' ? 'Conciliada' : 'Pendente'}
                            </span>
                          </td>
                          <td className="px-3 py-1.5">
                            {(c.observacoes || c.lancamentos.length > 0) && (
                              <button onClick={() => setContaAberta(contaAberta === c.id ? null : c.id)} className="text-xs text-brand underline">
                                {contaAberta === c.id ? 'Ocultar' : 'Detalhes'}
                              </button>
                            )}
                          </td>
                        </tr>
                        {contaAberta === c.id && (
                          <tr className="bg-gray-50">
                            <td colSpan={7} className="px-3 py-3 text-xs text-gray-600">
                              {c.observacoes && (
                                <p className="mb-2">
                                  <strong>Observações:</strong> {c.observacoes}
                                </p>
                              )}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                                <div>
                                  <p className="text-gray-400">Débito Balancete / Razão</p>
                                  <p className="font-medium">{fmtBRL(c.debitoBalancete)} / {fmtBRL(c.debitoRazao)}</p>
                                </div>
                                <div>
                                  <p className="text-gray-400">Crédito Balancete / Razão</p>
                                  <p className="font-medium">{fmtBRL(c.creditoBalancete)} / {fmtBRL(c.creditoRazao)}</p>
                                </div>
                                <div>
                                  <p className="text-gray-400">Saldo Inicial</p>
                                  <p className="font-medium">{fmtBRL(c.saldoInicial)}</p>
                                </div>
                                <div>
                                  <p className="text-gray-400">Sem movimentação</p>
                                  <p className="font-medium">{c.semMovimentacao ? `Sim (${c.mesesSemMovimentacao}x seguidas)` : 'Não'}</p>
                                </div>
                                {c.extratoSaldoFinal !== null && (
                                  <>
                                    <div>
                                      <p className="text-gray-400">Saldo Extrato Bancário</p>
                                      <p className="font-medium">{fmtBRL(c.extratoSaldoFinal)}</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-400">Diferença vs. Extrato</p>
                                      <p className="font-medium">{fmtBRL(c.extratoDiferenca)}</p>
                                    </div>
                                  </>
                                )}
                              </div>
                              {c.lancamentos.length > 0 && (
                                <>
                                  <p className="font-medium text-gray-700 mb-1">Lançamentos com alerta:</p>
                                  <table className="w-full text-[11px] border border-gray-100 rounded">
                                    <thead>
                                      <tr className="text-left text-gray-400 border-b border-gray-100">
                                        <th className="py-1 px-2">Data</th>
                                        <th className="py-1 px-2">Histórico</th>
                                        <th className="py-1 px-2">Débito</th>
                                        <th className="py-1 px-2">Crédito</th>
                                        <th className="py-1 px-2">Alerta</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {c.lancamentos.map((l) => (
                                        <tr key={l.id} className="border-b border-gray-50">
                                          <td className="py-1 px-2">{fmtDate(l.data)}</td>
                                          <td className="py-1 px-2">{l.historico || <em className="text-gray-400">(vazio)</em>}</td>
                                          <td className="py-1 px-2 font-mono">{l.debito ? fmtBRL(l.debito) : ''}</td>
                                          <td className="py-1 px-2 font-mono">{l.credito ? fmtBRL(l.credito) : ''}</td>
                                          <td className="py-1 px-2">
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                              {ALERTA_LABEL[l.tipoAlerta] || l.tipoAlerta}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
                {contasFiltradas.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Nenhuma conta encontrada para este filtro.</p>}
              </div>
            </div>
          )}

          {view === 'relatorio' && (
            <div className="card-surface p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-brand">Relatório de Conciliação</h2>
                <button onClick={exportarExcel} className="bg-accent text-white rounded-lg px-3 py-1.5 text-sm font-medium">
                  Exportar Excel
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-brand text-white text-left">
                      <th className="px-3 py-2">Conta</th>
                      <th className="px-3 py-2">Descrição</th>
                      <th className="px-3 py-2">Saldo Contábil</th>
                      <th className="px-3 py-2">Saldo Encontrado</th>
                      <th className="px-3 py-2">Diferença</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Observações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apuracao.contas.map((c) => (
                      <tr key={c.id} className="border-b border-gray-50">
                        <td className="px-3 py-1.5 font-medium">{c.conta}</td>
                        <td className="px-3 py-1.5">{c.descricao}</td>
                        <td className="px-3 py-1.5 font-mono text-right">{fmtBRL(c.saldoFinalBalancete)}</td>
                        <td className="px-3 py-1.5 font-mono text-right">{fmtBRL(c.saldoCalculado)}</td>
                        <td className="px-3 py-1.5 font-mono text-right">{fmtBRL(c.diferencaSaldo)}</td>
                        <td className="px-3 py-1.5">{c.status === 'CONCILIADA' ? 'Conciliada' : 'Pendente'}</td>
                        <td className="px-3 py-1.5 max-w-[260px]">{c.observacoes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
