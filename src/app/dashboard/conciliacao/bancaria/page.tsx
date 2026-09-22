'use client';

import { useState, useEffect, useRef, Suspense, Fragment } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { History, Landmark } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ImportHero } from '@/components/ImportHero';
import { lerRazaoBancario, lerExtratoBancarioComSaldo } from '@/lib/conciliacao-reader';

type StatusItemDB = 'CONCILIADO' | 'CONCILIADO_GRUPO' | 'DIF_COMPETENCIA' | 'APLICACAO_AUTOMATICA' | 'FECHAMENTO_TOTAL_DIA' | 'DIVERGENCIA_VALOR' | 'PENDENTE';

type ItemDB = {
  id: string;
  origem: 'RAZAO' | 'EXTRATO';
  data: string | null;
  historico: string | null;
  valor: number;
  documento: string | null;
  status: StatusItemDB;
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
  saldoInicialRazao: number | null;
  saldoFinalRazao: number | null;
  saldoInicialExtrato: number | null;
  saldoFinalExtrato: number | null;
  diferencaSaldoFinalDia: number | null;
  consistenteRazao: boolean | null;
  consistenteExtrato: boolean | null;
  continuidadeExtrato: boolean | null;
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
  totalFechamentoTotalDia: number;
  totalDivergenciaValor: number;
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
  CONCILIADO: '✅ Conciliado',
  CONCILIADO_GRUPO: '✅ Conciliado (grupo)',
  DIF_COMPETENCIA: '🟡 Divergência de data',
  APLICACAO_AUTOMATICA: 'Aplicação automática',
  FECHAMENTO_TOTAL_DIA: '🟠 Fechamento por total (revisar)',
  DIVERGENCIA_VALOR: '🔴 Divergência de valor',
  PENDENTE: 'Pendente',
};
const STATUS_COLOR: Record<string, string> = {
  CONCILIADO: 'bg-green-100 text-green-700',
  CONCILIADO_GRUPO: 'bg-green-100 text-green-700',
  DIF_COMPETENCIA: 'bg-amber-100 text-amber-700',
  APLICACAO_AUTOMATICA: 'bg-blue-100 text-blue-700',
  FECHAMENTO_TOTAL_DIA: 'bg-orange-100 text-orange-700',
  DIVERGENCIA_VALOR: 'bg-red-100 text-red-700',
  PENDENTE: 'bg-red-100 text-red-700',
};

// PENDENTE tem crítica diferente conforme a origem: achado no Extrato mas
// não no Razão (falta contabilizar) é mais grave que achado no Razão mas
// não no Extrato (pode ser cheque não compensado, outra competência etc) —
// pedido explícito do usuário pra distinguir essas duas críticas.
function labelStatus(item: { status: StatusItemDB; origem: 'RAZAO' | 'EXTRATO' }): string {
  if (item.status === 'PENDENTE') {
    return item.origem === 'EXTRATO' ? '🔴 Falta contabilizar' : '🟠 Divergência a verificar';
  }
  return STATUS_LABEL[item.status] || item.status;
}

// Crítica do saldo do dia — pedido explícito do usuário: apontar quando o
// saldo final do dia diverge entre Razão e Extrato, ou quando Saldo Inicial
// + Entradas + Saídas não bate com o Saldo Final do próprio dia (lançamento
// fora da movimentação contada, mas que o saldo já reflete).
function criticaSaldoDia(d: DiaDB): string {
  const partes: string[] = [];
  if (d.diferencaSaldoFinalDia !== null && Math.abs(d.diferencaSaldoFinalDia) > 0.01) {
    partes.push(`🔴 Divergência de Saldo Final — Extrato: ${fmtBRL(d.saldoFinalExtrato)} · Razão: ${fmtBRL(d.saldoFinalRazao)} · Diferença: ${fmtBRL(d.diferencaSaldoFinalDia)}`);
  }
  if (d.consistenteRazao === false) {
    partes.push(`🟠 Razão: Saldo Inicial (${fmtBRL(d.saldoInicialRazao)}) + Entradas − Saídas não bate com o Saldo Final (${fmtBRL(d.saldoFinalRazao)}) — revisar lançamentos do dia.`);
  }
  if (d.consistenteExtrato === false) {
    partes.push(`🟠 Extrato: Saldo Inicial (${fmtBRL(d.saldoInicialExtrato)}) + Entradas − Saídas não bate com o Saldo Final (${fmtBRL(d.saldoFinalExtrato)}) — revisar lançamentos do dia.`);
  }
  if (d.continuidadeExtrato === false) {
    partes.push(`🟡 Abertura do Extrato (${fmtBRL(d.saldoInicialExtrato)}) diverge do saldo final calculado do dia anterior — possível ajuste/rendimento do banco não detalhado como lançamento.`);
  }
  return partes.join(' | ');
}

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
  const [view, setView] = useState<'diagnostico' | 'pendentesExtrato' | 'pendentesRazao' | 'fechamentoTotalDia' | 'divergenciaValor' | 'todos'>('diagnostico');
  const [filtroData, setFiltroData] = useState<string | null>(null);
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
      'Saldo Inicial Razão': d.saldoInicialRazao ?? '',
      'Saldo Final Razão': d.saldoFinalRazao ?? '',
      'Saldo Inicial Extrato': d.saldoInicialExtrato ?? '',
      'Saldo Final Extrato': d.saldoFinalExtrato ?? '',
      'Dif. Saldo Final': d.diferencaSaldoFinalDia ?? '',
      Crítica: criticaSaldoDia(d),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(diasRows), 'Movimentação diária');

    const itensRows = apuracao.itens.map((i) => ({
      Origem: i.origem === 'RAZAO' ? 'Razão' : 'Extrato',
      Data: fmtDate(i.data),
      Histórico: i.historico,
      Valor: i.valor,
      Documento: i.documento || '',
      Status: labelStatus(i),
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
      { Indicador: 'Fechamento por total do dia (revisar)', Valor: apuracao.totalFechamentoTotalDia },
      { Indicador: 'Divergência de valor', Valor: apuracao.totalDivergenciaValor },
      { Indicador: 'Total pendentes', Valor: apuracao.totalPendentes },
      { Indicador: 'Total entradas (Razão)', Valor: apuracao.totalEntradaRazao },
      { Indicador: 'Total saídas (Razão)', Valor: apuracao.totalSaidaRazao },
      { Indicador: 'Total entradas (Extrato)', Valor: apuracao.totalEntradaExtrato },
      { Indicador: 'Total saídas (Extrato)', Valor: apuracao.totalSaidaExtrato },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Resumo');

    XLSX.writeFile(wb, `Conciliacao_Bancaria_${apuracao.periodo.replace('/', '-')}.xlsx`);
  }

  // Relatório de Pendências — só o que ainda precisa de revisão (Pendente,
  // Divergência de valor, Fechamento por total do dia), com a crítica de
  // cada um — pedido explícito do usuário, separado da exportação completa.
  function exportarRelatorioPendencias() {
    if (!apuracao) return;
    const naoConciliados = apuracao.itens.filter((i) => i.status !== 'CONCILIADO' && i.status !== 'CONCILIADO_GRUPO' && i.status !== 'DIF_COMPETENCIA' && i.status !== 'APLICACAO_AUTOMATICA');
    const rows = naoConciliados.map((i) => ({
      Origem: i.origem === 'RAZAO' ? 'Razão' : 'Extrato',
      Data: fmtDate(i.data),
      Valor: i.valor,
      Histórico: i.historico || '',
      Documento: i.documento || '',
      Crítica: labelStatus(i),
      Observação: i.observacao || '',
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Pendências');
    XLSX.writeFile(wb, `Relatorio_Pendencias_Conciliacao_${apuracao.periodo.replace('/', '-')}.xlsx`);
  }

  const pendentesExtrato = apuracao ? apuracao.itens.filter((i) => i.origem === 'EXTRATO' && i.status === 'PENDENTE') : [];
  const pendentesRazao = apuracao ? apuracao.itens.filter((i) => i.origem === 'RAZAO' && i.status === 'PENDENTE') : [];
  const fechamentoTotalDia = apuracao ? apuracao.itens.filter((i) => i.status === 'FECHAMENTO_TOTAL_DIA') : [];
  const divergenciaValor = apuracao ? apuracao.itens.filter((i) => i.status === 'DIVERGENCIA_VALOR') : [];
  const chaveData = (v: string | null) => (v ? v.slice(0, 10) : null);
  const listaPorView: Record<string, ItemDB[]> = {
    pendentesExtrato,
    pendentesRazao,
    fechamentoTotalDia,
    divergenciaValor,
    todos: apuracao?.itens ?? [],
  };
  const listaAtual = (listaPorView[view] ?? []).filter(
    (i) => !filtroData || chaveData(i.data) === filtroData
  );

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
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
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
              <p className="text-[11px] uppercase tracking-wide text-gray-400">✅ Conciliados</p>
              <p className="text-2xl font-mono font-semibold text-green-600 mt-1">{apuracao.totalConciliados}</p>
              <p className="text-xs text-gray-400 mt-1">de {apuracao.totalRazao + apuracao.totalExtrato} lançamento(s) no total</p>
            </div>
            <div className={`card-surface p-5 ${apuracao.totalFechamentoTotalDia + apuracao.totalDivergenciaValor > 0 ? 'border border-orange-300' : ''}`}>
              <p className="text-[11px] uppercase tracking-wide text-gray-400">🟠 A revisar</p>
              <p className={`text-2xl font-mono font-semibold mt-1 ${apuracao.totalFechamentoTotalDia + apuracao.totalDivergenciaValor > 0 ? 'text-orange-600' : 'text-gray-800'}`}>
                {apuracao.totalFechamentoTotalDia + apuracao.totalDivergenciaValor}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {apuracao.totalFechamentoTotalDia} fechamento por total · {apuracao.totalDivergenciaValor} divergência de valor
              </p>
            </div>
            <div className={`card-surface p-5 ${apuracao.totalPendentes > 0 ? 'border border-ruby/40' : ''}`}>
              <p className="text-[11px] uppercase tracking-wide text-gray-400">🔴 Pendentes</p>
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

          <div className="flex justify-end">
            <button onClick={exportarRelatorioPendencias} className="bg-ruby text-white rounded-lg px-3 py-1.5 text-sm font-medium">
              Exportar Relatório de Pendências
            </button>
          </div>

          <div className="flex gap-2 border-b border-gray-200 flex-wrap">
            {(['diagnostico', 'pendentesExtrato', 'pendentesRazao', 'fechamentoTotalDia', 'divergenciaValor', 'todos'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${view === v ? 'border-brand text-brand' : 'border-transparent text-gray-500'}`}
              >
                {v === 'diagnostico'
                  ? 'Movimentação diária'
                  : v === 'pendentesExtrato'
                  ? `🔴 Falta contabilizar (${pendentesExtrato.length})`
                  : v === 'pendentesRazao'
                  ? `🟠 Divergência a verificar (${pendentesRazao.length})`
                  : v === 'fechamentoTotalDia'
                  ? `🟠 Fechamento por total (${fechamentoTotalDia.length})`
                  : v === 'divergenciaValor'
                  ? `🔴 Divergência de valor (${divergenciaValor.length})`
                  : 'Todos os lançamentos'}
              </button>
            ))}
          </div>

          {view === 'diagnostico' && (
            <div className="card-surface p-5">
              <h2 className="font-display font-semibold text-brand mb-1">Movimentação diária</h2>
              <p className="text-xs text-gray-500 mb-4">
                Total de entrada e saída de cada dia, Razão × Extrato, e o saldo final do próprio dia dos dois lados —
                confere Saldo Inicial + Entradas − Saídas = Saldo Final em cada dia e aponta quando o saldo final do
                dia diverge entre Razão e Extrato. Clique num dia para ver só os lançamentos daquela data.
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
                      <th className="py-1.5 pr-3">Saldo Final Razão</th>
                      <th className="py-1.5 pr-3">Saldo Final Extrato</th>
                      <th className="py-1.5 pr-3">Dif. Saldo Final</th>
                      <th className="py-1.5 pr-3">Crítica</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apuracao.dias.map((d) => {
                      const temDivergenciaMov = Math.abs(d.diferencaEntrada) > 0.01 || Math.abs(d.diferencaSaida) > 0.01;
                      const temDivergenciaSaldo = (d.diferencaSaldoFinalDia !== null && Math.abs(d.diferencaSaldoFinalDia) > 0.01) || d.consistenteRazao === false || d.consistenteExtrato === false || d.continuidadeExtrato === false;
                      const critica = criticaSaldoDia(d);
                      return (
                        <tr
                          key={d.id}
                          onClick={() => {
                            setFiltroData(chaveData(d.data));
                            setView('todos');
                          }}
                          className={`border-b border-gray-50 cursor-pointer hover:bg-brand/5 ${temDivergenciaMov || temDivergenciaSaldo ? 'bg-ruby/5' : ''}`}
                        >
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
                          <td className="py-1.5 pr-3 font-mono">{d.saldoFinalRazao !== null ? fmtBRL(d.saldoFinalRazao) : '—'}</td>
                          <td className="py-1.5 pr-3 font-mono">{d.saldoFinalExtrato !== null ? fmtBRL(d.saldoFinalExtrato) : '—'}</td>
                          <td className={`py-1.5 pr-3 font-mono ${d.diferencaSaldoFinalDia !== null && Math.abs(d.diferencaSaldoFinalDia) > 0.01 ? 'text-ruby font-semibold' : 'text-gray-400'}`}>
                            {d.diferencaSaldoFinalDia !== null ? fmtBRL(d.diferencaSaldoFinalDia) : '—'}
                          </td>
                          <td className="py-1.5 pr-3 max-w-[280px] text-ruby">{critica}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {view !== 'diagnostico' && (
            <div className="card-surface p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="font-display font-semibold text-brand">
                    {view === 'pendentesExtrato'
                      ? 'Está no Extrato, mas falta contabilizar no Razão'
                      : view === 'pendentesRazao'
                      ? 'Está no Razão, mas não foi encontrado no Extrato'
                      : view === 'fechamentoTotalDia'
                      ? 'Fechamento por total do dia — não verificado item a item'
                      : view === 'divergenciaValor'
                      ? 'Mesmo lançamento, valor diferente entre Razão e Extrato'
                      : 'Todos os lançamentos'}
                  </h2>
                  {filtroData && (
                    <button
                      onClick={() => setFiltroData(null)}
                      className="flex items-center gap-1 text-xs bg-brand/10 text-brand rounded-full px-2.5 py-1 hover:bg-brand/20"
                      title="Limpar filtro de data"
                    >
                      Filtrado por {fmtDate(filtroData)}
                      <span className="font-bold">×</span>
                    </button>
                  )}
                </div>
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
                      <th className="px-3 py-2">Documento</th>
                      <th className="px-3 py-2">Crítica</th>
                      <th className="px-3 py-2">Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaAtual.map((i) => (
                      <tr key={i.id} className="border-b border-gray-50">
                        <td className="px-3 py-1.5">{i.origem === 'RAZAO' ? 'Razão' : 'Extrato'}</td>
                        <td className="px-3 py-1.5">{fmtDate(i.data)}</td>
                        <td className="px-3 py-1.5 max-w-[240px] truncate">{i.historico || <em className="text-gray-400">(vazio)</em>}</td>
                        <td className="px-3 py-1.5 font-mono text-right">{fmtBRL(i.valor)}</td>
                        <td className="px-3 py-1.5 font-mono">{i.documento || '—'}</td>
                        <td className="px-3 py-1.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLOR[i.status]}`}>{labelStatus(i)}</span>
                          {i.duplicadoSuspeito && <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-pink/10 text-pink">Possível duplicado</span>}
                        </td>
                        <td className="px-3 py-1.5 max-w-[320px] text-gray-500">{i.observacao}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {listaAtual.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-8">
                    {filtroData ? 'Nenhum lançamento nessa data para esta aba.' : 'Nenhum lançamento aqui — tudo certo! 🎉'}
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
