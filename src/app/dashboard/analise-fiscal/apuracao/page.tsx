'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, History, Settings, BookOpenText } from 'lucide-react';
import { canAccess, type Role } from '@/lib/permissions';

type Candidato = { id: string; periodo: string | null; fileName: string | null; processedAt: string; totalLinhas: number };

type Categoria = 'OUTROS_DEBITOS' | 'ESTORNO_CREDITOS' | 'OUTROS_CREDITOS' | 'ESTORNO_DEBITOS' | 'DEDUCOES';

type Lancamento = { id?: string; categoria: Categoria; descricao: string; valor: number };

type LinhaCfop = { cfop: string; valorContabil: number; baseIcms: number; valorIcms: number; isento: number; baseOutros: number };
type RegistroIcms = { linhas: LinhaCfop[]; totais: Omit<LinhaCfop, 'cfop'> };

type Resumo = {
  porSaidasComDebito: number; outrosDebitos: number; estornoCreditos: number; subTotalDebito: number;
  porEntradasComCredito: number; outrosCreditos: number; estornoDebitos: number; subTotalCredito: number;
  saldoCredorAnterior: number; totalCredito: number;
  saldoDevedor: number; deducoes: number; impostoARecolher: number; saldoCredorTransportar: number;
};

type Detalhe = {
  id: string;
  periodo: string;
  saldoCredorAnterior: number;
  company: { name: string; cnpj: string; inscricaoEstadual: string | null };
  entradaApuracao: Candidato | null;
  saidaApuracao: Candidato | null;
  registroEntradas: RegistroIcms | null;
  registroSaidas: RegistroIcms | null;
  lancamentos: Lancamento[];
  resumo: Resumo;
};

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export default function ApuracaoFiscalPage() {
  return (
    <Suspense fallback={null}>
      <ApuracaoFiscalInner />
    </Suspense>
  );
}

function ApuracaoFiscalInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const apuracaoIdParam = searchParams.get('apuracaoId');

  const [role, setRole] = useState<Role | null>(null);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  // form de criação
  const [periodo, setPeriodo] = useState('');
  const [periodosSugeridos, setPeriodosSugeridos] = useState<string[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [candidatosEntrada, setCandidatosEntrada] = useState<Candidato[] | null>(null);
  const [candidatosSaida, setCandidatosSaida] = useState<Candidato[] | null>(null);
  const [entradaEscolhida, setEntradaEscolhida] = useState<string>('');
  const [saidaEscolhida, setSaidaEscolhida] = useState<string>('');
  const [histEntradaFull, setHistEntradaFull] = useState<Candidato[] | null>(null);
  const [histSaidaFull, setHistSaidaFull] = useState<Candidato[] | null>(null);
  const [criando, setCriando] = useState(false);

  // edição de lançamentos / saldo anterior
  const [lancamentosEdit, setLancamentosEdit] = useState<Lancamento[]>([]);
  const [saldoAnteriorEdit, setSaldoAnteriorEdit] = useState('0');
  const [salvando, setSalvando] = useState(false);
  const [msgSalvo, setMsgSalvo] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setRole(data.user?.currentRole ?? null);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const [rEnt, rSai] = await Promise.all([
        fetch('/api/analise-fiscal/apuracoes'),
        fetch('/api/analise-fiscal/saida/apuracoes'),
      ]);
      const periodos = new Set<string>();
      if (rEnt.ok) {
        const d = await rEnt.json();
        for (const a of d.apuracoes) if (a.periodo) periodos.add(a.periodo);
      }
      if (rSai.ok) {
        const d = await rSai.json();
        for (const a of d.apuracoes) if (a.periodo) periodos.add(a.periodo);
      }
      setPeriodosSugeridos(Array.from(periodos).sort());
    })();
  }, []);

  const carregarDetalhe = useCallback(async (id: string) => {
    setCarregandoDetalhe(true);
    const res = await fetch(`/api/analise-fiscal/apuracao/${id}`);
    if (res.ok) {
      const data: Detalhe = await res.json();
      setDetalhe(data);
      setLancamentosEdit(data.lancamentos.map((l) => ({ ...l })));
      setSaldoAnteriorEdit(String(data.saldoCredorAnterior));
    }
    setCarregandoDetalhe(false);
  }, []);

  useEffect(() => {
    if (apuracaoIdParam) carregarDetalhe(apuracaoIdParam);
  }, [apuracaoIdParam, carregarDetalhe]);

  async function handleBuscarPeriodo() {
    if (!periodo.trim()) return;
    setErro(null);
    setBuscando(true);
    setCandidatosEntrada(null);
    setCandidatosSaida(null);
    setHistEntradaFull(null);
    setHistSaidaFull(null);
    const res = await fetch('/api/analise-fiscal/apuracao/candidatos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodo: periodo.trim() }),
    });
    const data = await res.json().catch(() => null);
    setBuscando(false);
    if (!res.ok) {
      setErro(data?.error || 'Falha ao buscar análises do período.');
      return;
    }
    setCandidatosEntrada(data.entrada);
    setCandidatosSaida(data.saida);
    setEntradaEscolhida(data.entrada.length === 1 ? data.entrada[0].id : '');
    setSaidaEscolhida(data.saida.length === 1 ? data.saida[0].id : '');
  }

  async function carregarHistFull(direcao: 'entrada' | 'saida') {
    const url = direcao === 'entrada' ? '/api/analise-fiscal/apuracoes' : '/api/analise-fiscal/saida/apuracoes';
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (direcao === 'entrada') setHistEntradaFull(data.apuracoes);
      else setHistSaidaFull(data.apuracoes);
    }
  }

  async function handleGerar() {
    setErro(null);
    if (!entradaEscolhida && !saidaEscolhida) {
      setErro('Vincule pelo menos uma análise de Entradas ou de Saídas.');
      return;
    }
    setCriando(true);
    const res = await fetch('/api/analise-fiscal/apuracao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        periodo: periodo.trim(),
        entradaApuracaoId: entradaEscolhida || null,
        saidaApuracaoId: saidaEscolhida || null,
      }),
    });
    const data = await res.json().catch(() => null);
    setCriando(false);
    if (!res.ok) {
      setErro(data?.error || 'Falha ao gerar a apuração.');
      return;
    }
    router.replace(`/dashboard/analise-fiscal/apuracao?apuracaoId=${data.id}`);
  }

  function handleNovaApuracao() {
    setDetalhe(null);
    setPeriodo('');
    setCandidatosEntrada(null);
    setCandidatosSaida(null);
    setEntradaEscolhida('');
    setSaidaEscolhida('');
    setErro(null);
    router.replace('/dashboard/analise-fiscal/apuracao');
  }

  function atualizarLancamento(idx: number, campo: 'descricao' | 'valor', valor: string) {
    setLancamentosEdit((prev) => {
      const novo = [...prev];
      if (campo === 'valor') novo[idx] = { ...novo[idx], valor: parseFloat(valor) || 0 };
      else novo[idx] = { ...novo[idx], descricao: valor };
      return novo;
    });
  }

  function adicionarLancamento(categoria: Categoria) {
    setLancamentosEdit((prev) => [...prev, { categoria, descricao: '', valor: 0 }]);
  }

  function removerLancamento(idx: number) {
    setLancamentosEdit((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSalvar() {
    if (!detalhe) return;
    setSalvando(true);
    setMsgSalvo(null);
    const res = await fetch(`/api/analise-fiscal/apuracao/${detalhe.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        saldoCredorAnterior: parseFloat(saldoAnteriorEdit) || 0,
        lancamentos: lancamentosEdit.filter((l) => l.descricao.trim()),
      }),
    });
    const data = await res.json().catch(() => null);
    setSalvando(false);
    if (!res.ok) {
      setErro(data?.error || 'Falha ao salvar.');
      return;
    }
    setDetalhe(data);
    setLancamentosEdit(data.lancamentos.map((l: Lancamento) => ({ ...l })));
    setMsgSalvo('Salvo — totais recalculados.');
    setTimeout(() => setMsgSalvo(null), 3000);
  }

  const houveMudanca = useMemo(() => {
    if (!detalhe) return false;
    if (parseFloat(saldoAnteriorEdit) !== detalhe.saldoCredorAnterior) return true;
    return JSON.stringify(lancamentosEdit) !== JSON.stringify(detalhe.lancamentos);
  }, [detalhe, saldoAnteriorEdit, lancamentosEdit]);

  return (
    <div className="space-y-6">
      <Link href="/dashboard/analise-fiscal" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors w-fit">
        <ArrowLeft size={15} />
        Análise e Apuração Fiscal
      </Link>

      {!detalhe && (
        <div>
          <h1 className="text-2xl font-display font-semibold text-brand">Apuração Fiscal</h1>
          <p className="text-gray-500 text-sm mt-1">
            Cruza as análises de Entradas e Saídas já validadas e monta automaticamente o Livro de Apuração do ICMS —
            débitos, créditos e saldo final, no mesmo formato do registro fiscal.
          </p>
        </div>
      )}

      {detalhe && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display font-semibold text-brand">Apuração Fiscal — {detalhe.periodo}</h1>
            <p className="text-gray-500 text-sm mt-1">
              {detalhe.company.name} · Insc. Est. {detalhe.company.inscricaoEstadual || '—'} · CNPJ {detalhe.company.cnpj}
            </p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {canAccess(role, 'analiseFiscalConfig') && (
              <>
                <Link href="/dashboard/analise-fiscal/regras" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
                  <BookOpenText size={15} />
                  Regras
                </Link>
                <Link href="/dashboard/analise-fiscal/config" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
                  <Settings size={15} />
                  Configurar TES
                </Link>
              </>
            )}
            <Link href="/dashboard/analise-fiscal/apuracao/historico" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
              <History size={15} />
              Histórico
            </Link>
            <button onClick={handleNovaApuracao} className="text-sm text-brand underline whitespace-nowrap">
              + Nova apuração
            </button>
          </div>
        </div>
      )}

      {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>}

      {!detalhe && !carregandoDetalhe && (
        <div className="card-surface p-5 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Período</label>
              <input
                list="periodos-sugeridos"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                placeholder="ex: 07/2026"
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-48"
              />
              <datalist id="periodos-sugeridos">
                {periodosSugeridos.map((p) => <option key={p} value={p} />)}
              </datalist>
            </div>
            <button
              onClick={handleBuscarPeriodo}
              disabled={!periodo.trim() || buscando}
              className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {buscando ? 'Buscando...' : 'Buscar dados do período'}
            </button>
          </div>

          {candidatosEntrada !== null && (
            <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">📥 Análise de Entradas</p>
                {candidatosEntrada.length === 1 ? (
                  <p className="text-sm text-teal">
                    Vinculado: {candidatosEntrada[0].fileName || candidatosEntrada[0].periodo} ({fmtData(candidatosEntrada[0].processedAt)})
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-gray-400 mb-1">
                      {candidatosEntrada.length === 0
                        ? 'Nenhuma análise achada com esse período exato — escolha manualmente ou deixe sem vínculo.'
                        : `${candidatosEntrada.length} análises com esse período — escolha uma.`}
                    </p>
                    <select
                      value={entradaEscolhida}
                      onChange={(e) => setEntradaEscolhida(e.target.value)}
                      onFocus={() => { if (!histEntradaFull) carregarHistFull('entrada'); }}
                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full"
                    >
                      <option value="">— Sem vínculo —</option>
                      {(histEntradaFull || candidatosEntrada).map((c) => (
                        <option key={c.id} value={c.id}>
                          {(c.fileName || c.periodo || c.id)} — {fmtData(c.processedAt)}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">📤 Análise de Saídas</p>
                {candidatosSaida && candidatosSaida.length === 1 ? (
                  <p className="text-sm text-teal">
                    Vinculado: {candidatosSaida[0].fileName || candidatosSaida[0].periodo} ({fmtData(candidatosSaida[0].processedAt)})
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-gray-400 mb-1">
                      {(candidatosSaida?.length || 0) === 0
                        ? 'Nenhuma análise achada com esse período exato — escolha manualmente ou deixe sem vínculo.'
                        : `${candidatosSaida?.length} análises com esse período — escolha uma.`}
                    </p>
                    <select
                      value={saidaEscolhida}
                      onChange={(e) => setSaidaEscolhida(e.target.value)}
                      onFocus={() => { if (!histSaidaFull) carregarHistFull('saida'); }}
                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full"
                    >
                      <option value="">— Sem vínculo —</option>
                      {(histSaidaFull || candidatosSaida || []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {(c.fileName || c.periodo || c.id)} — {fmtData(c.processedAt)}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>

              <div className="sm:col-span-2">
                <button
                  onClick={handleGerar}
                  disabled={criando || (!entradaEscolhida && !saidaEscolhida)}
                  className="bg-accent text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {criando ? 'Gerando...' : 'Gerar Apuração Fiscal'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {carregandoDetalhe && <p className="text-sm text-gray-400">Carregando...</p>}

      {detalhe && (
        <>
          <div className="card-surface p-4 text-xs text-gray-500 flex flex-wrap gap-x-6 gap-y-1">
            <span>
              📥 Entradas:{' '}
              {detalhe.entradaApuracao ? (
                <Link href={`/dashboard/analise-fiscal/entrada?apuracaoId=${detalhe.entradaApuracao.id}`} className="text-brand underline">
                  {detalhe.entradaApuracao.fileName || detalhe.entradaApuracao.periodo} ({fmtData(detalhe.entradaApuracao.processedAt)})
                </Link>
              ) : 'sem vínculo'}
            </span>
            <span>
              📤 Saídas:{' '}
              {detalhe.saidaApuracao ? (
                <Link href={`/dashboard/analise-fiscal/saida?apuracaoId=${detalhe.saidaApuracao.id}`} className="text-brand underline">
                  {detalhe.saidaApuracao.fileName || detalhe.saidaApuracao.periodo} ({fmtData(detalhe.saidaApuracao.processedAt)})
                </Link>
              ) : 'sem vínculo'}
            </span>
            <a href={`/api/analise-fiscal/apuracao/${detalhe.id}/pdf`} target="_blank" rel="noopener noreferrer" className="ml-auto text-accent underline">
              Exportar PDF (Livro Fiscal)
            </a>
          </div>

          {detalhe.registroEntradas && <TabelaCfop titulo="Entradas — ICMS por CFOP" registro={detalhe.registroEntradas} />}
          {detalhe.registroSaidas && <TabelaCfop titulo="Saídas — ICMS por CFOP" registro={detalhe.registroSaidas} />}

          <div className="card-surface p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-brand">Resumo da Apuração do Imposto</h2>
              <div className="flex items-center gap-3">
                {msgSalvo && <span className="text-xs text-teal">{msgSalvo}</span>}
                <button
                  onClick={handleSalvar}
                  disabled={salvando || !houveMudanca}
                  className="bg-brand text-white rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-40"
                >
                  {salvando ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </div>

            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              <VerticalLabel>DÉBITO DO IMPOSTO</VerticalLabel>
              <div className="flex-1 px-3 py-2 overflow-x-auto">
                <TabelaLedger>
                  <LinhaNumerada label="001 — Por saídas/prestações com débito do imposto" soma={detalhe.resumo.porSaidasComDebito} />
                  <LinhaCategoria numero="002" titulo="Outros débitos" categoria="OUTROS_DEBITOS" total={detalhe.resumo.outrosDebitos} lancamentosEdit={lancamentosEdit} atualizarLancamento={atualizarLancamento} adicionarLancamento={adicionarLancamento} removerLancamento={removerLancamento} />
                  <LinhaCategoria numero="003" titulo="Estorno de créditos" categoria="ESTORNO_CREDITOS" total={detalhe.resumo.estornoCreditos} lancamentosEdit={lancamentosEdit} atualizarLancamento={atualizarLancamento} adicionarLancamento={adicionarLancamento} removerLancamento={removerLancamento} />
                  <LinhaNumerada label="004 — Sub-total" soma={detalhe.resumo.subTotalDebito} negrito />
                </TabelaLedger>
              </div>
            </div>

            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              <VerticalLabel>CRÉDITO DO IMPOSTO</VerticalLabel>
              <div className="flex-1 px-3 py-2 overflow-x-auto">
                <TabelaLedger>
                  <LinhaNumerada label="005 — Por entradas/aquisições com crédito do imposto" soma={detalhe.resumo.porEntradasComCredito} />
                  <LinhaCategoria numero="006" titulo="Outros créditos" categoria="OUTROS_CREDITOS" total={detalhe.resumo.outrosCreditos} lancamentosEdit={lancamentosEdit} atualizarLancamento={atualizarLancamento} adicionarLancamento={adicionarLancamento} removerLancamento={removerLancamento} />
                  <LinhaCategoria numero="007" titulo="Estorno de débitos" categoria="ESTORNO_DEBITOS" total={detalhe.resumo.estornoDebitos} lancamentosEdit={lancamentosEdit} atualizarLancamento={atualizarLancamento} adicionarLancamento={adicionarLancamento} removerLancamento={removerLancamento} />
                  <LinhaNumerada label="008 — Sub-total" soma={detalhe.resumo.subTotalCredito} negrito />
                  <tr>
                    <td className="py-1.5 pr-2 text-gray-700">009 — Saldo credor do período anterior</td>
                    <td></td>
                    <td className="py-1 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={saldoAnteriorEdit}
                        onChange={(e) => setSaldoAnteriorEdit(e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-xs w-28 text-right"
                      />
                    </td>
                    <td></td>
                  </tr>
                  <LinhaNumerada label="010 — Total" soma={detalhe.resumo.totalCredito} negrito />
                </TabelaLedger>
              </div>
            </div>

            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              <VerticalLabel>APURAÇÃO DO SALDO</VerticalLabel>
              <div className="flex-1 px-3 py-2 overflow-x-auto">
                <TabelaLedger>
                  <LinhaNumerada label="011 — Saldo devedor (débito menos crédito)" soma={detalhe.resumo.saldoDevedor} />
                  <LinhaCategoria numero="012" titulo="Deduções" categoria="DEDUCOES" total={detalhe.resumo.deducoes} lancamentosEdit={lancamentosEdit} atualizarLancamento={atualizarLancamento} adicionarLancamento={adicionarLancamento} removerLancamento={removerLancamento} />
                  <LinhaNumerada label="013 — Imposto a recolher" soma={detalhe.resumo.impostoARecolher} negrito />
                  <LinhaNumerada label="014 — Saldo credor a transportar p/ período seguinte" soma={detalhe.resumo.saldoCredorTransportar} negrito destaque={detalhe.resumo.saldoCredorTransportar > 0} />
                </TabelaLedger>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TabelaCfop({ titulo, registro }: { titulo: string; registro: RegistroIcms }) {
  return (
    <div className="card-surface p-5 space-y-3">
      <h2 className="font-display font-semibold text-brand">{titulo}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[700px]">
          <thead>
            <tr className="bg-brand text-white text-left">
              <th className="px-3 py-2">CFOP</th>
              <th className="px-3 py-2 text-right">Valores Contábeis</th>
              <th className="px-3 py-2 text-right">Base de Cálculo</th>
              <th className="px-3 py-2 text-right">ICMS</th>
              <th className="px-3 py-2 text-right">Isentas/NT</th>
              <th className="px-3 py-2 text-right">Outras</th>
            </tr>
          </thead>
          <tbody>
            {registro.linhas.map((l) => (
              <tr key={l.cfop} className="border-b border-gray-50">
                <td className="px-3 py-1.5 font-mono">{l.cfop}</td>
                <td className="px-3 py-1.5 text-right">{fmt(l.valorContabil)}</td>
                <td className="px-3 py-1.5 text-right">{fmt(l.baseIcms)}</td>
                <td className="px-3 py-1.5 text-right">{fmt(l.valorIcms)}</td>
                <td className="px-3 py-1.5 text-right">{fmt(l.isento)}</td>
                <td className="px-3 py-1.5 text-right">{fmt(l.baseOutros)}</td>
              </tr>
            ))}
            <tr className="font-semibold text-brand">
              <td className="px-3 py-2">TOTAIS</td>
              <td className="px-3 py-2 text-right">{fmt(registro.totais.valorContabil)}</td>
              <td className="px-3 py-2 text-right">{fmt(registro.totais.baseIcms)}</td>
              <td className="px-3 py-2 text-right">{fmt(registro.totais.valorIcms)}</td>
              <td className="px-3 py-2 text-right">{fmt(registro.totais.isento)}</td>
              <td className="px-3 py-2 text-right">{fmt(registro.totais.baseOutros)}</td>
            </tr>
          </tbody>
        </table>
        {registro.linhas.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">Nenhum CFOP com movimento neste período.</p>
        )}
      </div>
    </div>
  );
}

// Réplica visual do Livro Fiscal de Apuração real: uma faixa vertical com
// o nome da seção (DÉBITO/CRÉDITO/SALDO) ao lado de uma tabela com
// "Coluna Auxiliar" (valor de cada lançamento discriminado) e "Soma"
// (o total da linha numerada) — mesma convenção do documento original.
function VerticalLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-8 shrink-0 bg-brand flex items-center justify-center py-3">
      <span
        className="text-white text-[10px] font-bold tracking-widest whitespace-nowrap"
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
      >
        {children}
      </span>
    </div>
  );
}

function TabelaLedger({ children }: { children: React.ReactNode }) {
  return (
    <table className="w-full text-sm min-w-[420px]">
      <thead>
        <tr className="text-[10px] uppercase tracking-wide text-gray-400">
          <th className="text-left font-medium pb-1"></th>
          <th className="text-right font-medium pb-1 w-32">Coluna Auxiliar</th>
          <th className="text-right font-medium pb-1 w-32">Soma</th>
          <th className="w-6"></th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function LinhaNumerada({ label, soma, negrito, destaque }: { label: string; soma: number; negrito?: boolean; destaque?: boolean }) {
  return (
    <tr className={destaque ? 'bg-teal/10' : negrito ? 'bg-gray-50' : ''}>
      <td className={`py-1.5 pr-2 ${negrito || destaque ? 'font-semibold text-gray-800' : 'text-gray-700'}`}>{label}</td>
      <td></td>
      <td className={`py-1.5 text-right font-mono ${destaque ? 'text-teal font-bold' : negrito ? 'font-semibold' : ''}`}>{fmt(soma)}</td>
      <td></td>
    </tr>
  );
}

type LancamentosProps = {
  lancamentosEdit: Lancamento[];
  atualizarLancamento: (idx: number, campo: 'descricao' | 'valor', valor: string) => void;
  adicionarLancamento: (categoria: Categoria) => void;
  removerLancamento: (idx: number) => void;
};

function LinhaCategoria({
  numero, titulo, categoria, total, lancamentosEdit, atualizarLancamento, adicionarLancamento, removerLancamento,
}: { numero: string; titulo: string; categoria: Categoria; total: number } & LancamentosProps) {
  const itens = lancamentosEdit.map((l, idx) => ({ ...l, idx })).filter((l) => l.categoria === categoria);
  return (
    <>
      <tr>
        <td className="py-1.5 pr-2 text-gray-700">
          {numero} — {titulo}{itens.length > 0 ? ' (discriminar abaixo)' : ''}
        </td>
        <td></td>
        <td className="py-1.5 text-right font-mono">{itens.length === 0 ? fmt(total) : ''}</td>
        <td></td>
      </tr>
      {itens.map((l, i) => (
        <tr key={l.idx}>
          <td className="py-1 pl-5">
            <input
              value={l.descricao}
              onChange={(e) => atualizarLancamento(l.idx, 'descricao', e.target.value)}
              placeholder="Descrição do lançamento"
              className="border border-gray-200 rounded px-2 py-1 text-xs w-full"
            />
          </td>
          <td className="py-1 text-right">
            <input
              type="number"
              step="0.01"
              value={l.valor}
              onChange={(e) => atualizarLancamento(l.idx, 'valor', e.target.value)}
              className="border border-gray-200 rounded px-2 py-1 text-xs w-28 text-right"
            />
          </td>
          <td className="py-1 text-right font-mono text-xs text-gray-500">{i === itens.length - 1 ? fmt(total) : ''}</td>
          <td className="py-1 text-center">
            <button onClick={() => removerLancamento(l.idx)} className="text-xs text-red-500">✕</button>
          </td>
        </tr>
      ))}
      <tr>
        <td colSpan={4} className="pb-1.5 pl-5">
          <button onClick={() => adicionarLancamento(categoria)} className="text-xs text-brand underline">
            + Adicionar lançamento
          </button>
        </td>
      </tr>
    </>
  );
}
