'use client';

import { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { History, ShieldCheck, X } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ImportHero } from '@/components/ImportHero';
import { parseNFeXml, parseEventoXml, RULE_DEFINITIONS, type ParsedItem, type EventoParsed } from '@/lib/auditor-rtc-parser';
import { recompute, DEFAULT_ACTIVE_RULES, type NfeBase, type NfeComputed, type ItemComputed } from '@/lib/auditor-rtc-compute';

function fmtNum(n: number | null | undefined, decimals = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtDateStr(iso: string | null) {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

const CORES = { ok: '#1E7A54', alerta: '#C1652B', erro: '#B23A32', cancel: '#8891A0', deneg: '#6B2A24' };

const STATUS_BADGE: Record<string, string> = {
  Autorizada: 'bg-green-100 text-green-700',
  Cancelada: 'bg-gray-100 text-gray-600',
  Denegada: 'bg-red-100 text-red-700',
  Outro: 'bg-amber-100 text-amber-700',
  'Sem protocolo': 'bg-amber-100 text-amber-700',
};
const SITUACAO_BADGE: Record<string, string> = {
  'Válido': 'bg-green-100 text-green-700',
  'Válido com alertas': 'bg-amber-100 text-amber-700',
  'Inconsistente': 'bg-red-100 text-red-700',
  'Cancelada': 'bg-gray-100 text-gray-600',
  'Denegada': 'bg-red-100 text-red-700',
};

export default function AuditorRtcPage() {
  return (
    <Suspense fallback={null}>
      <AuditorRtcInner />
    </Suspense>
  );
}

function AuditorRtcInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const apuracaoIdParam = searchParams.get('apuracaoId');

  const [nfesBase, setNfesBase] = useState<NfeBase[]>([]);
  const [itemsRaw, setItemsRaw] = useState<ParsedItem[]>([]);
  const [events, setEvents] = useState<EventoParsed[]>([]);
  const [readErrors, setReadErrors] = useState<{ fileName: string; error: string }[]>([]);
  const [activeRuleIds, setActiveRuleIds] = useState<string[]>(DEFAULT_ACTIVE_RULES);
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });
  const [erro, setErro] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [periodo, setPeriodo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const [historico, setHistorico] = useState<{ nfes: NfeComputed[]; items: ItemComputed[]; meta: any } | null>(null);

  const [tab, setTab] = useState<'resumo' | 'detalhado'>('resumo');
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroSituacao, setFiltroSituacao] = useState('');
  const [pagina, setPagina] = useState(1);
  const [detalheAberto, setDetalheAberto] = useState<{ tipo: 'nfe' | 'item'; dado: any } | null>(null);
  const pageSize = 100;

  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);

  const computado = useMemo(() => recompute(nfesBase, itemsRaw, events, activeRuleIds), [nfesBase, itemsRaw, events, activeRuleIds]);
  const { nfes, items } = historico ? { nfes: historico.nfes, items: historico.items } : computado;

  // carregar do histórico
  useEffect(() => {
    if (!apuracaoIdParam) return;
    (async () => {
      const res = await fetch(`/api/auditor-rtc/apuracoes/${apuracaoIdParam}`);
      if (res.ok) {
        const data = await res.json();
        const a = data.apuracao;
        const nfesComp: NfeComputed[] = a.nfes.map((n: any) => ({ ...n }));
        const itemsComp: ItemComputed[] = a.nfes.flatMap((n: any) => n.itens.map((i: any) => ({ ...i, fileName: n.fileName, chave: n.chave, docStatus: n.status })));
        setHistorico({ nfes: nfesComp, items: itemsComp, meta: a });
        setSalvo(true);
      }
    })();
  }, [apuracaoIdParam]);

  async function handleFileList(fileList: FileList | File[]) {
    const xmlFiles = Array.from(fileList).filter((f) => /\.xml$/i.test(f.name));
    if (xmlFiles.length === 0) {
      setErro('Nenhum arquivo .xml encontrado na seleção.');
      return;
    }
    setErro(null);
    setProcessando(true);
    setProgresso({ atual: 0, total: xmlFiles.length });

    const novosNfes: NfeBase[] = [];
    const novosItems: ParsedItem[] = [];
    const novosEventos: EventoParsed[] = [];
    const novosErros: { fileName: string; error: string }[] = [];

    const batchSize = 40;
    for (let i = 0; i < xmlFiles.length; i += batchSize) {
      const batch = xmlFiles.slice(i, i + batchSize);
      await Promise.all(
        batch.map(
          (file) =>
            new Promise<void>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => {
                const text = reader.result as string;
                const result = parseNFeXml(file.name, text);
                if (result.error) {
                  const evento = parseEventoXml(file.name, text);
                  if (evento) novosEventos.push(evento);
                  else novosErros.push({ fileName: file.name, error: result.error });
                } else {
                  novosNfes.push({
                    fileName: file.name,
                    chave: result.chave || '',
                    nNF: result.nNF || '',
                    serie: result.serie || '',
                    dhEmi: result.dhEmi || '',
                    cnpjEmit: result.cnpjEmit || '',
                    xNomeEmit: result.xNomeEmit || '',
                    itemCount: result.itemCount || 0,
                    statusBase: result.statusBase || '',
                    statusDetailBase: result.statusDetailBase || '',
                    nProt: result.nProt,
                    dhProt: result.dhProt,
                  });
                  novosItems.push(...(result.items || []));
                }
                resolve();
              };
              reader.onerror = () => {
                novosErros.push({ fileName: file.name, error: 'Falha ao ler arquivo' });
                resolve();
              };
              reader.readAsText(file);
            })
        )
      );
      setProgresso({ atual: Math.min(i + batchSize, xmlFiles.length), total: xmlFiles.length });
      await new Promise((r) => setTimeout(r, 0));
    }

    setNfesBase((prev) => [...prev, ...novosNfes]);
    setItemsRaw((prev) => [...prev, ...novosItems]);
    setEvents((prev) => [...prev, ...novosEventos]);
    setReadErrors((prev) => [...prev, ...novosErros]);
    setProcessando(false);
    setSalvo(false);
  }

  function handleLimpar() {
    setNfesBase([]);
    setItemsRaw([]);
    setEvents([]);
    setReadErrors([]);
    setActiveRuleIds(DEFAULT_ACTIVE_RULES);
    setHistorico(null);
    setSalvo(false);
    setErro(null);
    setPeriodo('');
    router.replace('/dashboard/auditor-rtc');
    if (folderInputRef.current) folderInputRef.current.value = '';
    if (filesInputRef.current) filesInputRef.current.value = '';
  }

  async function handleSalvar() {
    setSalvando(true);
    const payload = {
      periodo: periodo || null,
      arquivosComErro: readErrors.length,
      nfes: nfes.map((n) => ({
        ...n,
        itens: items.filter((i) => i.fileName === n.fileName),
      })),
    };
    const res = await fetch('/api/auditor-rtc/apurar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSalvando(false);
    if (res.ok) {
      const data = await res.json();
      setSalvo(true);
      router.push(`/dashboard/auditor-rtc?apuracaoId=${data.apuracao.id}`);
    }
  }

  function toggleRule(id: string) {
    if (historico) return; // não recalcula histórico salvo
    setActiveRuleIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  // --- Dashboard aggregates ---
  const ativas = nfes.filter((n) => n.status !== 'Cancelada' && n.status !== 'Denegada');
  const canceladas = nfes.filter((n) => n.status === 'Cancelada').length;
  const denegadas = nfes.filter((n) => n.status === 'Denegada').length;
  const validas = ativas.filter((n) => n.situacao === 'Válido').length;
  const comAlertas = ativas.filter((n) => n.situacao === 'Válido com alertas').length;
  const inconsistentes = ativas.filter((n) => n.situacao === 'Inconsistente').length;
  const pctConformidade = ativas.length ? Math.round(((validas + comAlertas) / ativas.length) * 1000) / 10 : 0;
  const itensAtivos = items.filter((i) => i.docStatus !== 'Cancelada' && i.docStatus !== 'Denegada');
  const semIBS = itensAtivos.filter((i) => !i.hasIBS).length;
  const semCBS = itensAtivos.filter((i) => !i.hasCBS).length;

  const donutData = [
    { name: 'Válidas', value: validas, color: CORES.ok },
    { name: 'Com alertas', value: comAlertas, color: CORES.alerta },
    { name: 'Inconsistentes', value: inconsistentes, color: CORES.erro },
    { name: 'Canceladas', value: canceladas, color: CORES.cancel },
    { name: 'Denegadas', value: denegadas, color: CORES.deneg },
  ].filter((d) => d.value > 0);

  const missingCounter: Record<string, number> = {};
  items.forEach((it) => (it as any).activeIssues?.filter((x: any) => x.severity === 'erro').forEach((x: any) => {
    missingCounter[x.message] = (missingCounter[x.message] || 0) + 1;
  }));
  const barData = Object.entries(missingCounter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label: label.length > 40 ? label.slice(0, 38) + '…' : label, count, full: label }));

  // --- Table data ---
  const dadosFiltrados = useMemo(() => {
    const source: any[] = tab === 'resumo' ? nfes : items;
    const q = busca.trim().toLowerCase();
    return source.filter((row) => {
      if (filtroSituacao && row.situacao !== filtroSituacao) return false;
      const rowStatus = tab === 'resumo' ? row.status : row.docStatus;
      if (filtroStatus && rowStatus !== filtroStatus) return false;
      if (!q) return true;
      const hay = [row.chave, row.nNF, row.cnpjEmit, row.xNomeEmit, row.cProd, row.xProd, row.ncm, row.fileName].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [tab, nfes, items, busca, filtroStatus, filtroSituacao]);

  const totalPaginas = Math.max(1, Math.ceil(dadosFiltrados.length / pageSize));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const pageData = dadosFiltrados.slice((paginaAtual - 1) * pageSize, paginaAtual * pageSize);

  function exportarCSV() {
    const cols = tab === 'resumo'
      ? ['nNF', 'serie', 'chave', 'dhEmi', 'cnpjEmit', 'xNomeEmit', 'status', 'itemCount', 'itensErro', 'itensAlerta', 'itensSemIBS', 'itensSemCBS', 'situacao', 'observacoes']
      : ['nNF', 'serie', 'chave', 'xNomeEmit', 'cProd', 'xProd', 'ncm', 'cfop', 'tes', 'cClassTrib', 'cst', 'qCom', 'vUnCom', 'vProd', 'vBC', 'pIBSTotal', 'pCBS', 'vIBS', 'vCBS', 'cstPis', 'pPis', 'vPis', 'cstCofins', 'pCofins', 'vCofins', 'situacao', 'missingLabel', 'alertLabel'];
    const header = cols.join(';');
    const rows = dadosFiltrados.map((row) => cols.map((c) => `"${String(row[c] ?? '').replace(/"/g, '""')}"`).join(';'));
    const csv = '\uFEFF' + [header, ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditor_rtc_${tab}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const temDados = nfesBase.length > 0 || !!historico;

  return (
    <div className="space-y-6">
      {!temDados ? (
        <ImportHero
          eyebrow="NT 2025.002 · IBS e CBS"
          titleParts={['Auditor', { text: 'RTC', accent: true }, '— Reforma Tributária']}
          description="Envie os XMLs de NF-e (pasta ou arquivos) e confira em lote se os grupos IBS/CBS foram gerados corretamente. Processamento 100% no seu navegador — os XMLs nunca saem da sua máquina, só o resultado calculado é salvo no histórico."
          badges={['Processamento local, sem envio de XML', 'Regras configuráveis', 'Correlação com eventos de cancelamento']}
        />
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-semibold text-brand">Auditor RTC — IBS/CBS</h1>
            <p className="text-gray-500 text-sm mt-1">Validação dos grupos da Reforma Tributária nos XMLs de NF-e.</p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <Link href="/dashboard/auditor-rtc/historico" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
              <History size={15} />
              Histórico
            </Link>
            <button onClick={handleLimpar} className="text-sm text-brand underline whitespace-nowrap">
              + Nova auditoria
            </button>
          </div>
        </div>
      )}

      {!temDados && (
        <div className="flex justify-end">
          <Link href="/dashboard/auditor-rtc/historico" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
            <History size={15} />
            Ver histórico
          </Link>
        </div>
      )}

      {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>}

      {!historico && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) handleFileList(e.dataTransfer.files);
          }}
          className={`card-surface border-2 border-dashed text-center px-6 py-10 transition-all duration-200 ${
            dragging ? 'border-brand bg-brand/5' : temDados ? 'border-lime bg-lime/5' : 'border-gray-200'
          }`}
        >
          <p className="font-display text-lg font-semibold text-gray-800">Arraste a pasta com os XMLs aqui</p>
          <p className="text-sm text-gray-500 mt-1.5">Ou selecione manualmente. Nenhum XML é enviado a servidores externos.</p>
          <div className="flex items-center justify-center gap-3 mt-5 flex-wrap">
            <input ref={folderInputRef} type="file" multiple {...({ webkitdirectory: 'true', directory: 'true' } as any)} className="hidden" onChange={(e) => e.target.files && handleFileList(e.target.files)} />
            <input ref={filesInputRef} type="file" multiple accept=".xml,text/xml" className="hidden" onChange={(e) => e.target.files && handleFileList(e.target.files)} />
            <button onClick={() => folderInputRef.current?.click()} disabled={processando} className="bg-brand text-white rounded-xl px-5 py-2.5 text-sm font-medium shadow-card hover:shadow-card-hover transition-all disabled:opacity-50">
              Selecionar pasta
            </button>
            <button onClick={() => filesInputRef.current?.click()} disabled={processando} className="border border-gray-300 rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-50">
              Selecionar arquivos
            </button>
            {temDados && (
              <button onClick={handleLimpar} className="text-sm text-gray-500 underline">
                Limpar tudo
              </button>
            )}
          </div>
          {processando && (
            <div className="mt-5 max-w-md mx-auto">
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-brand to-accent transition-all" style={{ width: `${progresso.total ? (progresso.atual / progresso.total) * 100 : 0}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-1.5 font-mono">Processando {progresso.atual}/{progresso.total} arquivos…</p>
            </div>
          )}
          {readErrors.length > 0 && (
            <p className="text-xs text-red-500 mt-3">{readErrors.length} arquivo(s) não puderam ser interpretados como NF-e ou evento.</p>
          )}
        </div>
      )}

      {temDados && (
        <>
          {/* Selo + KPIs */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="card-surface p-5 flex items-center gap-4 lg:col-span-1">
              <div className="relative w-16 h-16 shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="#E3E6EB" strokeWidth="9" />
                  <circle
                    cx="50" cy="50" r="44" fill="none"
                    stroke={pctConformidade >= 95 ? CORES.ok : pctConformidade >= 70 ? CORES.alerta : CORES.erro}
                    strokeWidth="9" strokeLinecap="round"
                    strokeDasharray={`${(pctConformidade / 100) * 276.5} 276.5`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-mono text-xs font-semibold text-gray-700">
                  {ativas.length ? pctConformidade.toFixed(1) + '%' : '—'}
                </div>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Conformidade</p>
                <p className="text-xs text-gray-500 mt-0.5">{validas + comAlertas} de {ativas.length} notas ativas OK</p>
              </div>
            </div>
            <div className="card-surface p-4">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">XMLs processados</p>
              <p className="text-xl font-mono font-semibold text-gray-800 mt-1">{nfes.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">{readErrors.length} com erro de leitura</p>
            </div>
            <div className="card-surface p-4">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Inconsistentes</p>
              <p className="text-xl font-mono font-semibold text-ruby mt-1">{inconsistentes}</p>
              <p className="text-xs text-gray-400 mt-0.5">notas ativas com tag ausente</p>
            </div>
            <div className="card-surface p-4">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Sem IBS / Sem CBS</p>
              <p className="text-xl font-mono font-semibold text-accent mt-1">{semIBS} / {semCBS}</p>
              <p className="text-xs text-gray-400 mt-0.5">itens ativos</p>
            </div>
            <div className="card-surface p-4">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Canceladas / Denegadas</p>
              <p className="text-xl font-mono font-semibold text-gray-600 mt-1">{canceladas} / {denegadas}</p>
              <p className="text-xs text-gray-400 mt-0.5">fora da apuração de conformidade</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card-surface p-5">
              <h3 className="font-semibold text-sm text-gray-700 mb-3">Conformidade geral</h3>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
                      {donutData.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card-surface p-5">
              <h3 className="font-semibold text-sm text-gray-700 mb-3">Tags obrigatórias mais ausentes</h3>
              {barData.length === 0 ? (
                <p className="text-sm text-gray-400 py-10 text-center">Nenhuma tag obrigatória ausente identificada.</p>
              ) : (
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" fontSize={11} allowDecimals={false} />
                      <YAxis type="category" dataKey="label" width={160} fontSize={10} />
                      <Tooltip formatter={(v: number) => v} labelFormatter={(_l, p) => p?.[0]?.payload?.full || ''} />
                      <Bar dataKey="count" fill={CORES.erro} radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Regras */}
          {!historico && (
            <div className="card-surface p-5">
              <h3 className="font-semibold text-sm text-gray-700 mb-1">Regras de validação ativas</h3>
              <p className="text-xs text-gray-400 mb-3">Desmarque para não considerar na apuração de conformidade — o recálculo é instantâneo.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto">
                {RULE_DEFINITIONS.map((r) => (
                  <label key={r.id} className="flex items-start gap-2 text-xs px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={activeRuleIds.includes(r.id)} onChange={() => toggleRule(r.id)} className="mt-0.5" />
                    <span className="text-gray-600">{r.label} <span className="font-mono text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded ml-1">{r.cat}</span></span>
                  </label>
                ))}
              </div>
              {!salvo && (
                <div className="flex justify-end mt-4 pt-3 border-t border-gray-100">
                  <button onClick={handleSalvar} disabled={salvando} className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 flex items-center gap-2">
                    <ShieldCheck size={15} />
                    {salvando ? 'Salvando...' : 'Salvar auditoria no histórico'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tabs + tabela */}
          <div className="card-surface p-5">
            <div className="flex gap-2 border-b border-gray-200 mb-4">
              {(['resumo', 'detalhado'] as const).map((t) => (
                <button key={t} onClick={() => { setTab(t); setPagina(1); }} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-brand text-brand' : 'border-transparent text-gray-500'}`}>
                  {t === 'resumo' ? 'Resumo por Nota' : 'Detalhado por Item'}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} placeholder="Buscar por chave, número, produto, NCM, CNPJ, emitente…" className="flex-1 min-w-[220px] border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
              <select value={filtroStatus} onChange={(e) => { setFiltroStatus(e.target.value); setPagina(1); }} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                <option value="">Todos os status</option>
                {['Autorizada', 'Cancelada', 'Denegada', 'Outro', 'Sem protocolo'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filtroSituacao} onChange={(e) => { setFiltroSituacao(e.target.value); setPagina(1); }} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                <option value="">Todas as situações</option>
                {['Válido', 'Válido com alertas', 'Inconsistente', 'Cancelada', 'Denegada'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={exportarCSV} className="bg-accent text-white rounded-lg px-3 py-1.5 text-sm font-medium">Exportar CSV</button>
            </div>

            <div className="overflow-x-auto border border-gray-100 rounded-lg">
              <table className="w-full text-xs min-w-[900px]">
                <thead>
                  <tr className="bg-brand text-white text-left">
                    {tab === 'resumo' ? (
                      <>
                        <th className="px-3 py-2">NF-e</th>
                        <th className="px-3 py-2">Emissão</th>
                        <th className="px-3 py-2">Emitente</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Itens</th>
                        <th className="px-3 py-2">Situação</th>
                        <th className="px-3 py-2"></th>
                      </>
                    ) : (
                      <>
                        <th className="px-3 py-2">NF-e</th>
                        <th className="px-3 py-2">Código</th>
                        <th className="px-3 py-2">Produto</th>
                        <th className="px-3 py-2">NCM</th>
                        <th className="px-3 py-2">CST</th>
                        <th className="px-3 py-2">Vlr Total</th>
                        <th className="px-3 py-2">IBS</th>
                        <th className="px-3 py-2">CBS</th>
                        <th className="px-3 py-2">Situação</th>
                        <th className="px-3 py-2"></th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {pageData.map((row: any, idx: number) => (
                    <tr key={idx} className={`border-b border-gray-50 ${row.situacao === 'Inconsistente' || row.situacao === 'Denegada' ? 'bg-ruby/5' : row.situacao === 'Válido com alertas' ? 'bg-amber-50' : row.situacao === 'Cancelada' ? 'bg-gray-50 text-gray-400' : ''}`}>
                      {tab === 'resumo' ? (
                        <>
                          <td className="px-3 py-1.5">{row.nNF}/{row.serie}</td>
                          <td className="px-3 py-1.5">{fmtDateStr(row.dhEmi)}</td>
                          <td className="px-3 py-1.5 max-w-[200px] truncate">{row.xNomeEmit}</td>
                          <td className="px-3 py-1.5"><span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_BADGE[row.status] || 'bg-gray-100 text-gray-600'}`}>{row.status}</span></td>
                          <td className="px-3 py-1.5">{row.itemCount}</td>
                          <td className="px-3 py-1.5"><span className={`text-[10px] px-2 py-0.5 rounded-full ${SITUACAO_BADGE[row.situacao] || 'bg-gray-100'}`}>{row.situacao}</span></td>
                          <td className="px-3 py-1.5"><button onClick={() => setDetalheAberto({ tipo: 'nfe', dado: row })} className="text-xs text-brand underline">detalhes</button></td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-1.5">{row.nNF}/{row.serie}</td>
                          <td className="px-3 py-1.5 font-mono">{row.cProd}</td>
                          <td className="px-3 py-1.5 max-w-[220px] truncate">{row.xProd}</td>
                          <td className="px-3 py-1.5 font-mono">{row.ncm}</td>
                          <td className="px-3 py-1.5 font-mono">{row.cst}</td>
                          <td className="px-3 py-1.5 font-mono text-right">{fmtNum(row.vProd)}</td>
                          <td className="px-3 py-1.5">{row.hasIBS ? '✓' : <span className="text-ruby">✕</span>}</td>
                          <td className="px-3 py-1.5">{row.hasCBS ? '✓' : <span className="text-ruby">✕</span>}</td>
                          <td className="px-3 py-1.5"><span className={`text-[10px] px-2 py-0.5 rounded-full ${SITUACAO_BADGE[row.situacao] || 'bg-gray-100'}`}>{row.situacao}</span></td>
                          <td className="px-3 py-1.5"><button onClick={() => setDetalheAberto({ tipo: 'item', dado: row })} className="text-xs text-brand underline">detalhes</button></td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {dadosFiltrados.length === 0 && <p className="text-sm text-gray-400 text-center py-10">Nenhum registro encontrado.</p>}
            </div>

            <div className="flex items-center justify-end gap-3 mt-3 text-xs text-gray-500">
              <span>{dadosFiltrados.length} registro(s) — página {paginaAtual} de {totalPaginas}</span>
              <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={paginaAtual <= 1} className="border border-gray-300 rounded px-2 py-1 disabled:opacity-40">◀</button>
              <button onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={paginaAtual >= totalPaginas} className="border border-gray-300 rounded px-2 py-1 disabled:opacity-40">▶</button>
            </div>
          </div>
        </>
      )}

      {/* Drawer de detalhes */}
      {detalheAberto && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setDetalheAberto(null)} />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 overflow-y-auto p-6 animate-fade-in">
            <button onClick={() => setDetalheAberto(null)} className="absolute right-5 top-5 text-gray-400 hover:text-gray-700">
              <X size={20} />
            </button>
            {detalheAberto.tipo === 'nfe' ? <DetalheNfe nfe={detalheAberto.dado} items={items.filter((i: any) => i.fileName === detalheAberto.dado.fileName)} /> : <DetalheItem item={detalheAberto.dado} />}
          </div>
        </>
      )}
    </div>
  );
}

function DetalheNfe({ nfe, items }: { nfe: any; items: any[] }) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-gray-800">NF-e {nfe.nNF} — série {nfe.serie}</h2>
      <div className="flex gap-2 mt-2">
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_BADGE[nfe.status] || 'bg-gray-100'}`}>{nfe.status}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${SITUACAO_BADGE[nfe.situacao] || 'bg-gray-100'}`}>{nfe.situacao}</span>
      </div>
      <dl className="grid grid-cols-[120px_1fr] gap-2 text-xs mt-4">
        <dt className="text-gray-400">Arquivo</dt><dd className="font-mono break-all">{nfe.fileName}</dd>
        <dt className="text-gray-400">Chave</dt><dd className="font-mono break-all">{nfe.chave}</dd>
        <dt className="text-gray-400">Emissão</dt><dd>{fmtDateStr(nfe.dhEmi)}</dd>
        <dt className="text-gray-400">CNPJ Emitente</dt><dd className="font-mono">{nfe.cnpjEmit}</dd>
        <dt className="text-gray-400">Emitente</dt><dd>{nfe.xNomeEmit}</dd>
        <dt className="text-gray-400">Itens</dt><dd>{nfe.itemCount}</dd>
      </dl>
      {nfe.statusDetail && <p className="text-xs bg-amber-50 text-amber-700 rounded-lg px-3 py-2 mt-3">{nfe.statusDetail}</p>}
      <div className="mt-5 pt-4 border-t border-gray-100">
        <h4 className="text-xs uppercase tracking-wide text-gray-400 mb-2">Itens ({items.length})</h4>
        <div className="space-y-3">
          {items.map((it, idx) => (
            <div key={idx} className="border-b border-gray-50 pb-2">
              <div className="flex justify-between items-start gap-2">
                <strong className="text-xs text-gray-700">{it.xProd}</strong>
                <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${SITUACAO_BADGE[it.situacao] || 'bg-gray-100'}`}>{it.situacao}</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">NCM {it.ncm} · CFOP {it.cfop} · IBS {it.hasIBS ? 'Sim' : 'Não'} · CBS {it.hasCBS ? 'Sim' : 'Não'}</p>
              {it.missingLabel && <p className="text-[11px] text-ruby mt-1">{it.missingLabel}</p>}
              {it.alertLabel && <p className="text-[11px] text-amber-600 mt-1">{it.alertLabel}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DetalheItem({ item }: { item: any }) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-gray-800">{item.xProd}</h2>
      <div className="flex gap-2 mt-2">
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_BADGE[item.docStatus] || 'bg-gray-100'}`}>{item.docStatus}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${SITUACAO_BADGE[item.situacao] || 'bg-gray-100'}`}>{item.situacao}</span>
      </div>
      <dl className="grid grid-cols-[140px_1fr] gap-2 text-xs mt-4">
        <dt className="text-gray-400">Código do produto</dt><dd className="font-mono">{item.cProd || '—'}</dd>
        <dt className="text-gray-400">NF-e / Série</dt><dd>{item.nNF} / {item.serie}</dd>
        <dt className="text-gray-400">Chave</dt><dd className="font-mono break-all">{item.chave}</dd>
        <dt className="text-gray-400">NCM / CFOP / TES</dt><dd className="font-mono">{item.ncm} / {item.cfop} / {item.tes || '—'}</dd>
        <dt className="text-gray-400">CST / cClassTrib</dt><dd className="font-mono">{item.cst} / {item.cClassTrib}</dd>
        <dt className="text-gray-400">Grupo tributário</dt><dd>{item.groupType || 'não identificado'}</dd>
        <dt className="text-gray-400">Quantidade</dt><dd className="font-mono">{fmtNum(item.qCom, 4)}</dd>
        <dt className="text-gray-400">Valor unitário</dt><dd className="font-mono">{fmtNum(item.vUnCom, 4)}</dd>
        <dt className="text-gray-400">Valor total</dt><dd className="font-mono">{fmtNum(item.vProd)}</dd>
        <dt className="text-gray-400">Base cálc. IBS/CBS</dt><dd className="font-mono">{item.vBC == null ? '—' : fmtNum(item.vBC)}</dd>
        <dt className="text-gray-400">Alíquota IBS</dt><dd className="font-mono">{item.pIBSTotal == null ? '—' : fmtNum(item.pIBSTotal, 4) + '%'}</dd>
        <dt className="text-gray-400">Alíquota CBS</dt><dd className="font-mono">{item.pCBS == null ? '—' : fmtNum(item.pCBS, 4) + '%'}</dd>
        <dt className="text-gray-400">Valor IBS</dt><dd className="font-mono">{item.vIBS == null ? '—' : fmtNum(item.vIBS)}</dd>
        <dt className="text-gray-400">Valor CBS</dt><dd className="font-mono">{item.vCBS == null ? '—' : fmtNum(item.vCBS)}</dd>
      </dl>
      <div className="mt-4 pt-4 border-t border-gray-100">
        <h4 className="text-xs uppercase tracking-wide text-gray-400 mb-2">Informações complementares (PIS/COFINS) — apenas leitura, sem validação</h4>
        <dl className="grid grid-cols-[140px_1fr] gap-2 text-xs">
          <dt className="text-gray-400">CST PIS</dt><dd>{item.cstPis || '—'}</dd>
          <dt className="text-gray-400">Alíquota PIS</dt><dd className="font-mono">{item.pPis == null ? '—' : fmtNum(item.pPis, 4) + '%'}</dd>
          <dt className="text-gray-400">Valor PIS</dt><dd className="font-mono">{item.vPis == null ? '—' : fmtNum(item.vPis)}</dd>
          <dt className="text-gray-400">CST COFINS</dt><dd>{item.cstCofins || '—'}</dd>
          <dt className="text-gray-400">Alíquota COFINS</dt><dd className="font-mono">{item.pCofins == null ? '—' : fmtNum(item.pCofins, 4) + '%'}</dd>
          <dt className="text-gray-400">Valor COFINS</dt><dd className="font-mono">{item.vCofins == null ? '—' : fmtNum(item.vCofins)}</dd>
        </dl>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-100">
        <h4 className="text-xs uppercase tracking-wide text-gray-400 mb-2">Pendências</h4>
        {item.missingLabel && <p className="text-xs text-ruby mb-1">{item.missingLabel}</p>}
        {item.alertLabel && <p className="text-xs text-amber-600 mb-1">{item.alertLabel}</p>}
        {!item.missingLabel && !item.alertLabel && <p className="text-xs text-gray-400">Nenhuma pendência identificada.</p>}
      </div>
    </div>
  );
}
