'use client';

import { useState, useEffect, useRef, Suspense, Fragment } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { History, Landmark } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ImportHero } from '@/components/ImportHero';
import { lerRazaoBancario, lerExtratoBancarioComSaldo } from '@/lib/conciliacao-reader';

type ItemDB = {
  id: string;
  origem: 'RAZAO' | 'EXTRATO';
  data: string | null;
  historico: string | null;
  valor: number;
  status: 'CONCILIADO' | 'CONCILIADO_GRUPO' | 'DIF_COMPETENCIA' | 'APLICACAO_AUTOMATICA' | 'PENDENTE';
  grupoRef: string | null;
  duplicadoSuspeito: boolean;
  observacao: string | null;
};

type DiaDB = {
  id: string;
  data: string;
  entradaRazao: number;
  saidaRazao: number;
  entradaExtrato: number;
  saidaExtrato: number;
  diferencaEntrada: number;
  diferencaSaida: number;
};

type ApuracaoDB = {
  id: string;
  periodo: string;
  contaRazao: string | null;
  saldoInicial: number;
  saldoFinalRazao: number;
  saldoFinalExtrato: number;
  diferencaSaldoFinal: number;
  totalRazao: number;
  totalExtrato: number;
  totalConciliados: number;
  totalPendentes: number;
  valorPendenteRazao: number;
  valorPendenteExtrato: number;
  totalEntradaRazao: number;
  totalSaidaRazao: number;
  totalEntradaExtrato: number;
  totalSaidaExtrato: number;
  aplicacaoAutomaticaIncluida: boolean;
  processedAt: string;
  dias: DiaDB[];
  itens: ItemDB[];
};

function fmtBRL(n: number | null | undefined) {
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtDate(v: string | null) {
  if (!v) return '';
  const d = new Date(v);
  // timeZone: 'UTC' — as datas são gravadas como meia-noite UTC; sem fixar o
  // fuso, o navegador converte pro horário local (Brasil = UTC-3) e a data
  // exibida fica um dia atrasada.
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

const STATUS_LABEL: Record<string, string> = {
  CONCILIADO: 'Conciliado',
  CONCILIADO_GRUPO: 'Conciliado (grupo)',
  DIF_COMPETENCIA: 'Diferença de competência',
  APLICACAO_AUTOMATICA: 'Aplicação automática',
  PENDENTE: 'Pendente',
};
const STATUS_COLOR: Record<string, string> = {
  CONCILIADO: 'bg-green-100 text-green-700',
  CONCILIADO_GRUPO: 'bg-teal/10 text-teal',
  DIF_COMPETENCIA: 'bg-amber-100 text-amber-700',
  APLICACAO_AUTOMATICA: 'bg-blue-100 text-blue-700',
  PENDENTE: 'bg-red-100 text-red-700',
};

export default function ConciliacaoBancariaPage() {
  return (
    <Suspense fallback={null}>
      <ConciliacaoBancariaInner />
    </Suspense>
  );
}

function ConciliacaoBancariaInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const apuracaoIdParam = searchParams.get('apuracaoId');

  const [razaoFile, setRazaoFile] = useState<File | null>(null);
  const [extratoFile, setExtratoFile] = useState<File | null>(null);
  const [periodo, setPeriodo] = useState('');
  const [contaRazao, setContaRazao] = useState('');
  const [saldoInicial, setSaldoInicial] = useState('');
  const [incluirAplicacaoAutomatica, setIncluirAplicacaoAutomatica] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [apuracao, setApuracao] = useState<ApuracaoDB | null>(null);
  const [view, setView] = useState<'diagnostico' | 'pendentesExtrato' | 'pendentesRazao' | 'todos'>('diagnostico');
  const razaoRef = useRef<HTMLInputElement>(null);
  const extratoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!apuracaoIdParam) return;
    (async () => {
      const res = await fetch(`/api/conciliacao/bancaria/apuracoes/${apuracaoIdParam}`);
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
    if (!razaoFile || !extratoFile) return;
    setErro(null);
    setLoading(true);
    try {
      const aoaRazao = await readAoa(razaoFile);
      const leituraRazao = lerRazaoBancario(aoaRazao);
      if (leituraRazao.erro) {
        setErro(leituraRazao.erro);
        setLoading(false);
        return;
      }
      const aoaExtrato = await readAoa(extratoFile);
      const leituraExtrato = lerExtratoBancarioComSaldo(aoaExtrato);
      if (leituraExtrato.erro) {
        setErro(leituraExtrato.erro);
        setLoading(false);
        return;
      }

      const res = await fetch('/api/conciliacao/bancaria/apurar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodo,
          contaRazao: contaRazao || null,
          saldoInicial: saldoInicial ? parseFloat(saldoInicial.replace(',', '.')) : null,
          incluirAplicacaoAutomatica,
          razao: leituraRazao.rows.map((r) => ({ ...r, data: r.data ? r.data.toISOString() : null })),
          extrato: leituraExtrato.rows.map((e) => ({ ...e, data: e.data ? e.data.toISOString() : null })),
        }),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok) {
        setErro(data.error || 'Falha ao processar.');
        return;
      }
      setApuracao(data.apuracao);
      setView('diagnostico');
    } catch (err) {
      setLoading(false);
      setErro('Não foi possível ler os arquivos. Verifique se são .xlsx válidos.');
      console.error(err);
    }
  }

  function handleNova() {
    setApuracao(null);
    setRazaoFile(null);
    setExtratoFile(null);
    setPeriodo('');
    setContaRazao('');
    setSaldoInicial('');
    setIncluirAplicacaoAutomatica(false);
    setErro(null);
    if (razaoRef.current) razaoRef.current.value = '';
    if (extratoRef.current) extratoRef.current.value = '';
    router.replace('/dashboard/conciliacao/bancaria');
  }

  function exportarExcel() {
    if (!apuracao) return;
    const wb = XLSX.utils.book_new();

    const diasRows = apuracao.dias.map((d) => ({
      Data: fmtDate(d.data),
      'Entrada Razão': d.entradaRazao,
      'Entrada Extrato': d.entradaExtrato,
      'Dif. Entrada': d.diferencaEntrada,
      'Saída Razão': d.saidaRazao,
      'Saída Extrato': d.saidaExtrato,
      'Dif. Saída': d.diferencaSaida,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(diasRows), 'Movimentação diária');

    const itensRows = apuracao.itens.map((i) => ({
      Origem: i.origem === 'RAZAO' ? 'Razão' : 'Extrato',
      Data: fmtDate(i.data),
      Histórico: i.historico,
      Valor: i.valor,
      Status: STATUS_LABEL[i.status],
      Grupo: i.grupoRef || '',
      'Possível duplicado': i.duplicadoSuspeito ? 'Sim' : '',
      Observação: i.observacao || '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itensRows), 'Lançamentos');

    const resumo = [
      { Indicador: 'Período', Valor: apuracao.periodo },
      { Indicador: 'Saldo inicial', Valor: apuracao.saldoInicial },
      { Indicador: 'Saldo final (Razão)', Valor: apuracao.saldoFinalRazao },
      { Indicador: 'Saldo final (Extrato)', Valor: apuracao.saldoFinalExtrato },
      { Indicador: 'Diferença de saldo final', Valor: apuracao.diferencaSaldoFinal },
      { Indicador: 'Total conciliados', Valor: apuracao.totalConciliados },
      { Indicador: 'Total pendentes', Valor: apuracao.totalPendentes },
      { Indicador: 'Total entradas (Razão)', Valor: apuracao.totalEntradaRazao },
      { Indicador: 'Total saídas (Razão)', Valor: apuracao.totalSaidaRazao },
      { Indicador: 'Total entradas (Extrato)', Valor: apuracao.totalEntradaExtrato },
      { Indicador: 'Total saídas (Extrato)', Valor: apuracao.totalSaidaExtrato },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Resumo');

    XLSX.writeFile(wb, `Conciliacao_Bancaria_${apuracao.periodo.replace('/', '-')}.xlsx`);
  }

  const pendentesExtrato = apuracao ? apuracao.itens.filter((i) => i.origem === 'EXTRATO' && i.status === 'PENDENTE') : [];
  const pendentesRazao = apuracao ? apuracao.itens.filter((i) => i.origem === 'RAZAO' && i.status === 'PENDENTE') : [];

  return (
    <div className="space-y-6">
      {!apuracao ? (
        <ImportHero
          eyebrow="Razão × Extrato · Movimentação diária"
          titleParts={['Conciliação', { text: 'Bancária', accent: true }, 'inteligente']}
          description="Envie o Razão da conta Banco e o Extrato Bancário do mesmo período. O sistema confere o total de entrada e saída de cada dia, pareia lançamentos (inclusive agrupamentos de vários lançamentos que somam um só do outro lado) e sugere a natureza do que ainda não foi contabilizado."
          badges={['Total de entrada/saída por dia', 'Agrupamentos N:1 e 1:N', 'Sugestão por palavra-chave']}
        />
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-semibold text-brand">Conciliação Bancária</h1>
            <p className="text-gray-500 text-sm mt-1">Razão × Extrato Bancário — {apuracao.periodo}</p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <Link href="/dashboard/conciliacao/bancaria/historico" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
              <History size={15} />
              Histórico
            </Link>
            <button onClick={handleNova} className="text-sm text-brand underline whitespace-nowrap">
              + Nova conciliação
            </button>
          </div>
        </div>
      )}

      {!apuracao && (
        <div className="flex justify-end">
          <Link href="/dashboard/conciliacao/bancaria/historico" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
            <History size={15} />
            Ver histórico
          </Link>
        </div>
      )}

      {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>}

      {!apuracao && (
        <div className="card-surface p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Razão da conta Banco</label>
              <input ref={razaoRef} type="file" accept=".xlsx,.xls" onChange={(e) => setRazaoFile(e.target.files?.[0] || null)} className="text-sm" />
              <p className="text-[11px] text-gray-400 mt-1">Colunas: Data, Histórico, Débito, Crédito, e Saldo (opcional, recomendado).</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Extrato Bancário</label>
              <input ref={extratoRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setExtratoFile(e.target.files?.[0] || null)} className="text-sm" />
              <p className="text-[11px] text-gray-400 mt-1">Colunas: Data, Histórico, Valor (ou Débito/Crédito), e Saldo (opcional, recomendado).</p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Período</label>
              <input type="text" placeholder="06/2026" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-32" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Conta (rótulo, opcional)</label>
              <input type="text" placeholder="Ex: 111.02.005 - Santander" value={contaRazao} onChange={(e) => setContaRazao(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-52" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Saldo inicial (opcional)</label>
              <input type="text" placeholder="deixe em branco para usar o do Razão" value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-56" />
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-600 pb-1.5">
              <input
                type="checkbox"
                checked={incluirAplicacaoAutomatica}
                onChange={(e) => setIncluirAplicacaoAutomatica(e.target.checked)}
                className="rounded border-gray-300"
              />
              Incluir aplicação automática (resgates/aplicações que não aparecem no extrato)
            </label>
            <button
              onClick={handleProcessar}
              disabled={!razaoFile || !extratoFile || loading}
              className="bg-brand text-white rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-40 shadow-card hover:shadow-card-hover transition-all ml-auto"
            >
              {loading ? 'Processando...' : 'Processar conciliação'}
            </button>
          </div>
        </div>
      )}

      {apuracao && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className={`card-surface p-5 ${Math.abs(apuracao.diferencaSaldoFinal) > 0.01 ? 'border border-ruby/40' : ''}`}>
              <div className="flex items-center gap-2 mb-1">
                <Landmark size={16} className="text-brand" />
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Diagnóstico de saldo final</p>
              </div>
              <p className={`text-2xl font-mono font-semibold mt-1 ${Math.abs(apuracao.diferencaSaldoFinal) > 0.01 ? 'text-ruby' : 'text-green-600'}`}>
                {fmtBRL(apuracao.diferencaSaldoFinal)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Razão {fmtBRL(apuracao.saldoFinalRazao)} · Extrato {fmtBRL(apuracao.saldoFinalExtrato)}
              </p>
            </div>
            <div className="card-surface p-5">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">Lançamentos conciliados</p>
              <p className="text-2xl font-mono font-semibold text-green-600 mt-1">{apuracao.totalConciliados}</p>
              <p className="text-xs text-gray-400 mt-1">de {apuracao.totalRazao + apuracao.totalExtrato} lançamento(s) no total</p>
            </div>
            <div className={`card-surface p-5 ${apuracao.totalPendentes > 0 ? 'border border-ruby/40' : ''}`}>
              <p className="text-[11px] uppercase tracking-wide text-gray-400">Pendentes</p>
              <p className={`text-2xl font-mono font-semibold mt-1 ${apuracao.totalPendentes > 0 ? 'text-ruby' : 'text-gray-800'}`}>{apuracao.totalPendentes}</p>
              <p className="text-xs text-gray-400 mt-1">
                Razão {fmtBRL(apuracao.valorPendenteRazao)} · Extrato {fmtBRL(apuracao.valorPendenteExtrato)}
              </p>
            </div>
            <div className="card-surface p-5">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">Total do período</p>
              <p className="text-xs text-gray-600 mt-1.5 space-y-0.5">
                <span className="block">
                  Razão: <span className="font-mono text-green-600">+{fmtBRL(apuracao.totalEntradaRazao)}</span>{' '}
                  <span className="font-mono text-ruby">{fmtBRL(apuracao.totalSaidaRazao)}</span>
                </span>
                <span className="block">
                  Extrato: <span className="font-mono text-green-600">+{fmtBRL(apuracao.totalEntradaExtrato)}</span>{' '}
                  <span className="font-mono text-ruby">{fmtBRL(apuracao.totalSaidaExtrato)}</span>
                </span>
              </p>
            </div>
          </div>

          <div className="flex gap-2 border-b border-gray-200">
            {(['diagnostico', 'pendentesExtrato', 'pendentesRazao', 'todos'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${view === v ? 'border-brand text-brand' : 'border-transparent text-gray-500'}`}
              >
                {v === 'diagnostico' ? 'Movimentação diária' : v === 'pendentesExtrato' ? `Não contabilizado (${pendentesExtrato.length})` : v === 'pendentesRazao' ? `Não localizado no banco (${pendentesRazao.length})` : 'Todos os lançamentos'}
              </button>
            ))}
          </div>

          {view === 'diagnostico' && (
            <div className="card-surface p-5">
              <h2 className="font-display font-semibold text-brand mb-1">Movimentação diária</h2>
              <p className="text-xs text-gray-500 mb-4">
                Total de entrada e saída de cada dia, Razão × Extrato — não usa saldo acumulado, para não propagar a
                divergência de um dia pendente para os dias seguintes.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-100">
                      <th className="py-1.5 pr-3">Data</th>
                      <th className="py-1.5 pr-3">Entrada Razão</th>
                      <th className="py-1.5 pr-3">Entrada Extrato</th>
                      <th className="py-1.5 pr-3">Dif. Entrada</th>
                      <th className="py-1.5 pr-3">Saída Razão</th>
                      <th className="py-1.5 pr-3">Saída Extrato</th>
                      <th className="py-1.5 pr-3">Dif. Saída</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apuracao.dias.map((d) => {
                      const temDivergencia = Math.abs(d.diferencaEntrada) > 0.01 || Math.abs(d.diferencaSaida) > 0.01;
                      return (
                        <tr key={d.id} className={`border-b border-gray-50 ${temDivergencia ? 'bg-ruby/5' : ''}`}>
                          <td className="py-1.5 pr-3 font-medium">{fmtDate(d.data)}</td>
                          <td className="py-1.5 pr-3 font-mono">{fmtBRL(d.entradaRazao)}</td>
                          <td className="py-1.5 pr-3 font-mono">{fmtBRL(d.entradaExtrato)}</td>
                          <td className={`py-1.5 pr-3 font-mono ${Math.abs(d.diferencaEntrada) > 0.01 ? 'text-ruby font-semibold' : 'text-gray-400'}`}>
                            {fmtBRL(d.diferencaEntrada)}
                          </td>
                          <td className="py-1.5 pr-3 font-mono">{fmtBRL(d.saidaRazao)}</td>
                          <td className="py-1.5 pr-3 font-mono">{fmtBRL(d.saidaExtrato)}</td>
                          <td className={`py-1.5 pr-3 font-mono ${Math.abs(d.diferencaSaida) > 0.01 ? 'text-ruby font-semibold' : 'text-gray-400'}`}>
                            {fmtBRL(d.diferencaSaida)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(view === 'pendentesExtrato' || view === 'pendentesRazao' || view === 'todos') && (
            <div className="card-surface p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-semibold text-brand">
                  {view === 'pendentesExtrato' ? 'Movimentações bancárias ainda não contabilizadas' : view === 'pendentesRazao' ? 'Contabilizado, mas não localizado no banco' : 'Todos os lançamentos'}
                </h2>
                <button onClick={exportarExcel} className="bg-accent text-white rounded-lg px-3 py-1.5 text-sm font-medium">
                  Exportar Excel
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-brand text-white text-left">
                      <th className="px-3 py-2">Origem</th>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2">Histórico</th>
                      <th className="px-3 py-2">Valor</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(view === 'pendentesExtrato' ? pendentesExtrato : view === 'pendentesRazao' ? pendentesRazao : apuracao.itens).map((i) => (
                      <tr key={i.id} className="border-b border-gray-50">
                        <td className="px-3 py-1.5">{i.origem === 'RAZAO' ? 'Razão' : 'Extrato'}</td>
                        <td className="px-3 py-1.5">{fmtDate(i.data)}</td>
                        <td className="px-3 py-1.5 max-w-[240px] truncate">{i.historico || <em className="text-gray-400">(vazio)</em>}</td>
                        <td className="px-3 py-1.5 font-mono text-right">{fmtBRL(i.valor)}</td>
                        <td className="px-3 py-1.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLOR[i.status]}`}>{STATUS_LABEL[i.status]}</span>
                          {i.duplicadoSuspeito && <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-pink/10 text-pink">Possível duplicado</span>}
                        </td>
                        <td className="px-3 py-1.5 max-w-[320px] text-gray-500">{i.observacao}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(view === 'pendentesExtrato' ? pendentesExtrato : view === 'pendentesRazao' ? pendentesRazao : apuracao.itens).length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-8">Nenhum lançamento aqui — tudo certo! 🎉</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
