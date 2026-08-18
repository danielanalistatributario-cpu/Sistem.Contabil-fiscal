'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { History } from 'lucide-react';
import { ImportHero } from '@/components/ImportHero';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  CAMPOS_ENTRADA, CAMPOS_PAGAS, CampoDef, Mapping, findHeaderRow, autoMap, guessBestSheet, extractRows,
} from '@/lib/icms-mapping';

type NotaApuradaDB = {
  id: string;
  docFiscal: string;
  fornecedor: string | null;
  cnpj: string | null;
  uf: string | null;
  filial: string | null;
  produto: string | null;
  ncm: string | null;
  tes: string | null;
  chaveNfe: string | null;
  dataEmissao: string | null;
  base: number;
  valor: number;
  status: 'PAGO' | 'PENDENTE';
  valorPago: number | null;
  dataPagamento: string | null;
  divergencia: number | null;
  itensSemAliquota: number;
};

type ApuracaoDB = {
  id: string;
  periodo: string;
  semPagamento: boolean;
  totalNF: number;
  qtdPagas: number;
  qtdPendentes: number;
  valorPago: number;
  valorPendente: number;
  itensConsiderados: number;
  itensDesconsiderados: number;
  qtdSemAliquota: number;
  divergencias: number;
  processedAt: string;
  notas: NotaApuradaDB[];
};

type FileState = {
  file: File | null;
  workbook: XLSX.WorkBook | null;
  sheetName: string;
  aoa: unknown[][];
  mapping: Mapping;
};

const EMPTY_FILE_STATE: FileState = { file: null, workbook: null, sheetName: '', aoa: [], mapping: { headerRowIdx: 0, columns: {} } };

function fmtBRL(n: number | null | undefined) {
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtNum(n: number) {
  return Number(n || 0).toLocaleString('pt-BR');
}
function fmtDate(v: string | null) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export default function IcmsPage() {
  return (
    <Suspense fallback={null}>
      <IcmsPageInner />
    </Suspense>
  );
}

function IcmsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const apuracaoIdParam = searchParams.get('apuracaoId');

  const [view, setView] = useState<'importar' | 'dashboard' | 'pagas' | 'pendentes'>('importar');
  const [entrada, setEntrada] = useState<FileState>(EMPTY_FILE_STATE);
  const [pagas, setPagas] = useState<FileState>(EMPTY_FILE_STATE);
  const [semPagamento, setSemPagamento] = useState(false);
  const [periodo, setPeriodo] = useState('');
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [apuracao, setApuracao] = useState<ApuracaoDB | null>(null);

  const inputEntradaRef = useRef<HTMLInputElement>(null);
  const inputPagasRef = useRef<HTMLInputElement>(null);

  // Carrega uma apuração específica quando vem do histórico (?apuracaoId=...)
  useEffect(() => {
    if (!apuracaoIdParam) return;
    (async () => {
      const res = await fetch(`/api/icms/apuracoes/${apuracaoIdParam}`);
      if (res.ok) {
        const data = await res.json();
        setApuracao(data.apuracao);
        setView('dashboard');
      }
    })();
  }, [apuracaoIdParam]);

  function readWorkbook(file: File): Promise<XLSX.WorkBook> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          resolve(XLSX.read(data, { type: 'array', cellDates: true }));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  function aoaForSheet(wb: XLSX.WorkBook, name: string): unknown[][] {
    return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }) as unknown[][];
  }

  async function handleFile(file: File, kind: 'entrada' | 'pagas') {
    setErro(null);
    try {
      const wb = await readWorkbook(file);
      const fields = kind === 'entrada' ? CAMPOS_ENTRADA : CAMPOS_PAGAS;
      const bestSheet = guessBestSheet(wb.SheetNames, (name) => aoaForSheet(wb, name), fields);
      const aoa = aoaForSheet(wb, bestSheet);
      const hdrRow = findHeaderRow(aoa, fields);
      const mapping = autoMap(aoa, hdrRow >= 0 ? hdrRow : 0, fields);
      const next: FileState = { file, workbook: wb, sheetName: bestSheet, aoa, mapping };
      if (kind === 'entrada') setEntrada(next);
      else setPagas(next);
    } catch (err) {
      setErro('Não foi possível ler o arquivo. Verifique se é um .xlsx, .xls ou .csv válido.');
      console.error(err);
    }
  }

  function handleSheetChange(kind: 'entrada' | 'pagas', sheetName: string) {
    const state = kind === 'entrada' ? entrada : pagas;
    if (!state.workbook) return;
    const fields = kind === 'entrada' ? CAMPOS_ENTRADA : CAMPOS_PAGAS;
    const aoa = aoaForSheet(state.workbook, sheetName);
    const hdrRow = findHeaderRow(aoa, fields);
    const mapping = autoMap(aoa, hdrRow >= 0 ? hdrRow : 0, fields);
    const next = { ...state, sheetName, aoa, mapping };
    if (kind === 'entrada') setEntrada(next);
    else setPagas(next);
  }

  function handleMappingChange(kind: 'entrada' | 'pagas', fieldKey: string, colIdx: number) {
    const state = kind === 'entrada' ? entrada : pagas;
    const next = { ...state, mapping: { ...state.mapping, columns: { ...state.mapping.columns, [fieldKey]: colIdx } } };
    if (kind === 'entrada') setEntrada(next);
    else setPagas(next);
  }

  function clearPagas() {
    setPagas(EMPTY_FILE_STATE);
    if (inputPagasRef.current) inputPagasRef.current.value = '';
  }

  const mappingReady = !!entrada.workbook && (semPagamento || !!pagas.workbook);

  function validarMapeamento(): string[] {
    const missing: string[] = [];
    CAMPOS_ENTRADA.filter((f) => f.required).forEach((f) => {
      if ((entrada.mapping.columns[f.key] ?? -1) < 0) missing.push(`Entrada → ${f.label}`);
    });
    if (!semPagamento) {
      CAMPOS_PAGAS.filter((f) => f.required).forEach((f) => {
        if ((pagas.mapping.columns[f.key] ?? -1) < 0) missing.push(`Pagas → ${f.label}`);
      });
    }
    return missing;
  }

  async function handleProcessar() {
    setErro(null);
    if (!entrada.workbook) {
      setErro('Envie o relatório de entrada antes de processar.');
      return;
    }
    if (!semPagamento && !pagas.workbook) {
      setErro('Envie o relatório de pagamentos, ou marque "Não houve pagamento no mês".');
      return;
    }
    const missing = validarMapeamento();
    if (missing.length) {
      setErro('Selecione as colunas obrigatórias antes de processar: ' + missing.join(' · '));
      return;
    }

    const entradaItems = extractRows(entrada.aoa, entrada.mapping, CAMPOS_ENTRADA);
    const pagasRows = semPagamento ? [] : extractRows(pagas.aoa, pagas.mapping, CAMPOS_PAGAS);

    setProcessando(true);
    const res = await fetch('/api/icms/apurar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodo, semPagamento, entradaItems, pagasRows }),
    });
    const data = await res.json();
    setProcessando(false);

    if (!res.ok) {
      setErro(data.error || 'Falha ao processar a apuração.');
      return;
    }
    setApuracao(data.apuracao);
    setView('dashboard');
  }

  function handleNovaApuracao() {
    setApuracao(null);
    setEntrada(EMPTY_FILE_STATE);
    setPagas(EMPTY_FILE_STATE);
    setSemPagamento(false);
    setPeriodo('');
    setErro(null);
    setView('importar');
    router.replace('/dashboard/icms');
  }

  return (
    <div className="space-y-6">
      {!apuracao ? (
        <ImportHero
          eyebrow="Antecipado Especial · Entrada × SEFA"
          titleParts={['Apuração', { text: 'ICMS Antecipado', accent: true }, 'Especial']}
          description="Envie o relatório de notas de entrada e o de pagamentos SEFA — o sistema cruza tudo automaticamente, calcula por TES/UF/origem do produto e separa o que já foi pago do que ainda está pendente."
          badges={['Cruzamento automático', 'Alíquota por UF e origem do produto']}
        />
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-semibold text-brand">Apuração · ICMS Antecipado Especial</h1>
            <p className="text-gray-500 text-sm mt-1">
              Cruzamento automático entre notas de entrada e pagamentos SEFA do Antecipado Especial.
            </p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <Link href="/dashboard/icms/historico" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
              <History size={15} />
              Histórico
            </Link>
            <button onClick={handleNovaApuracao} className="text-sm text-brand underline whitespace-nowrap">
              + Nova apuração
            </button>
          </div>
        </div>
      )}

      {!apuracao && (
        <div className="flex justify-end">
          <Link href="/dashboard/icms/historico" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
            <History size={15} />
            Ver histórico de apurações
          </Link>
        </div>
      )}

      {apuracao && (
        <div className="flex gap-2 border-b border-gray-200">
          {(['dashboard', 'pagas', 'pendentes'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                view === v ? 'border-brand text-brand' : 'border-transparent text-gray-500'
              }`}
            >
              {v === 'dashboard' ? 'Dashboard' : v === 'pagas' ? 'Notas Pagas' : 'Notas Pendentes'}
            </button>
          ))}
        </div>
      )}

      {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>}

      {view === 'importar' && !apuracao && (
        <ImportarView
          entrada={entrada}
          pagas={pagas}
          semPagamento={semPagamento}
          periodo={periodo}
          processando={processando}
          mappingReady={mappingReady}
          inputEntradaRef={inputEntradaRef}
          inputPagasRef={inputPagasRef}
          onFile={handleFile}
          onSheetChange={handleSheetChange}
          onMappingChange={handleMappingChange}
          onSemPagamentoChange={(v) => {
            setSemPagamento(v);
            if (v) clearPagas();
          }}
          onPeriodoChange={setPeriodo}
          onProcessar={handleProcessar}
        />
      )}

      {apuracao && view === 'dashboard' && <DashboardView apuracao={apuracao} />}
      {apuracao && view === 'pagas' && <NotasTable apuracao={apuracao} kind="PAGO" />}
      {apuracao && view === 'pendentes' && <NotasTable apuracao={apuracao} kind="PENDENTE" />}
    </div>
  );
}

// ============================================================
// VIEW: IMPORTAR
// ============================================================
function ImportarView({
  entrada, pagas, semPagamento, periodo, processando, mappingReady,
  inputEntradaRef, inputPagasRef, onFile, onSheetChange, onMappingChange,
  onSemPagamentoChange, onPeriodoChange, onProcessar,
}: {
  entrada: FileState;
  pagas: FileState;
  semPagamento: boolean;
  periodo: string;
  processando: boolean;
  mappingReady: boolean;
  inputEntradaRef: React.RefObject<HTMLInputElement>;
  inputPagasRef: React.RefObject<HTMLInputElement>;
  onFile: (file: File, kind: 'entrada' | 'pagas') => void;
  onSheetChange: (kind: 'entrada' | 'pagas', sheetName: string) => void;
  onMappingChange: (kind: 'entrada' | 'pagas', fieldKey: string, colIdx: number) => void;
  onSemPagamentoChange: (v: boolean) => void;
  onPeriodoChange: (v: string) => void;
  onProcessar: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UploadPanel
          title="Notas de entrada"
          tag="arquivo A"
          description="Relatório com todas as notas fiscais de entrada, incluindo Produto, NCM, TES, Origem do Produto, UF de origem, Valor Total e Despesas — o sistema calcula o ICMS Antecipado Especial a partir desses campos."
          state={entrada}
          inputRef={inputEntradaRef}
          onFile={(f) => onFile(f, 'entrada')}
          onSheetChange={(s) => onSheetChange('entrada', s)}
        />
        <div className={semPagamento ? 'opacity-40 pointer-events-none' : ''}>
          <UploadPanel
            title="Notas já pagas no mês"
            tag="arquivo B"
            description="Relatório de consulta de pagamento SEFA com as notas cujo Antecipado Especial já foi recolhido no período."
            state={pagas}
            inputRef={inputPagasRef}
            onFile={(f) => onFile(f, 'pagas')}
            onSheetChange={(s) => onSheetChange('pagas', s)}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={semPagamento}
          onChange={(e) => onSemPagamentoChange(e.target.checked)}
          className="w-4 h-4"
        />
        Não houve nenhum pagamento de ICMS Antecipado Especial neste mês
      </label>

      {mappingReady && (
        <div className="card-surface p-5">
          <h2 className="font-semibold text-brand mb-1">Conferir mapeamento de colunas</h2>
          <p className="text-xs text-gray-500 mb-4">
            O sistema tenta identificar as colunas automaticamente e calcula o ICMS Antecipado Especial aplicando as
            TES elegíveis (102, 107, 108, 109, 129, 222, 225), a alíquota por UF de origem (12% ou 7%) e a regra de
            15% para produtos importados nas TES 102/107/129. Confira o mapeamento antes de processar.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <MappingTable title="Arquivo A · Entrada" fields={CAMPOS_ENTRADA} state={entrada} kind="entrada" onChange={onMappingChange} />
            {!semPagamento ? (
              <MappingTable title="Arquivo B · Pagas" fields={CAMPOS_PAGAS} state={pagas} kind="pagas" onChange={onMappingChange} />
            ) : (
              <div>
                <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Arquivo B · Pagas</h4>
                <div className="text-sm text-gray-500 border border-gray-100 rounded-lg p-4 text-center">
                  ✓ Cenário sem pagamento no mês selecionado. Todas as notas elegíveis serão apresentadas como
                  pendentes.
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 mt-5 pt-4 border-t border-gray-100">
            <input
              type="text"
              placeholder="Período, ex: 05/2026"
              value={periodo}
              onChange={(e) => onPeriodoChange(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-40"
            />
            <button
              onClick={onProcessar}
              disabled={processando}
              className="ml-auto bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {processando ? 'Processando...' : 'Processar cruzamento →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function UploadPanel({
  title, tag, description, state, inputRef, onFile, onSheetChange,
}: {
  title: string;
  tag: string;
  description: string;
  state: FileState;
  inputRef: React.RefObject<HTMLInputElement>;
  onFile: (file: File) => void;
  onSheetChange: (sheetName: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div className="card-surface p-5 h-full">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="font-semibold text-sm">{title}</h3>
        <span className="text-[10px] font-mono bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5 text-gray-500">{tag}</span>
      </div>
      <p className="text-xs text-gray-500 mb-4">{description}</p>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
          dragging ? 'border-brand bg-brand/5' : state.file ? 'border-accent bg-accent/5' : 'border-gray-200'
        }`}
      >
        <p className="text-sm font-medium mb-1">Arraste o arquivo ou clique para selecionar</p>
        <p className="text-xs text-gray-400 mb-3">.xlsx, .xls ou .csv</p>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
          className="text-xs border border-gray-300 rounded-lg px-3 py-1.5"
        >
          Escolher arquivo
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        {state.file && (
          <p className="mt-3 text-xs font-mono bg-white border border-gray-200 rounded-full inline-block px-3 py-1">
            📄 {state.file.name}
          </p>
        )}
      </div>
      {state.workbook && state.workbook.SheetNames.length > 1 && (
        <div className="mt-3">
          <label className="text-xs text-gray-500 block mb-1">Planilha a usar</label>
          <select
            value={state.sheetName}
            onChange={(e) => onSheetChange(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
          >
            {state.workbook.SheetNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function MappingTable({
  title, fields, state, kind, onChange,
}: {
  title: string;
  fields: CampoDef[];
  state: FileState;
  kind: 'entrada' | 'pagas';
  onChange: (kind: 'entrada' | 'pagas', fieldKey: string, colIdx: number) => void;
}) {
  const header = (state.aoa[state.mapping.headerRowIdx] || []) as unknown[];
  const sampleRow = state.aoa.slice(state.mapping.headerRowIdx + 1).find((r) => r && r.some((c) => c !== null && c !== ''));

  return (
    <div>
      <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">{title}</h4>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-400 border-b border-gray-100">
            <th className="py-1.5 pr-2">Campo</th>
            <th className="py-1.5 pr-2">Coluna no arquivo</th>
            <th className="py-1.5">Exemplo</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => {
            const colIdx = state.mapping.columns[f.key] ?? -1;
            const sample = sampleRow && colIdx >= 0 ? String(sampleRow[colIdx] ?? '') : '';
            return (
              <tr key={f.key} className="border-b border-gray-50">
                <td className="py-1.5 pr-2">
                  {f.label}
                  {f.required && <span className="text-red-500"> *</span>}
                </td>
                <td className="py-1.5 pr-2">
                  <select
                    value={colIdx}
                    onChange={(e) => onChange(kind, f.key, parseInt(e.target.value))}
                    className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs"
                  >
                    <option value={-1}>— não usar —</option>
                    {header.map((h, i) => (
                      <option key={i} value={i}>
                        {h ? String(h) : `(coluna ${i + 1})`}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5 text-gray-400 font-mono">{sample}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// VIEW: DASHBOARD
// ============================================================
const CORES = { pago: '#00753A', pendente: '#BE1E2D', destaque: '#F6921E' };

function DashboardView({ apuracao }: { apuracao: ApuracaoDB }) {
  const percent = apuracao.totalNF ? (apuracao.qtdPagas / apuracao.totalNF) * 100 : 0;
  const semAliquota = apuracao.notas.filter((n) => n.itensSemAliquota > 0);

  const dataValores = [{ nome: 'Antecipado Especial', Recolhido: apuracao.valorPago, Pendente: apuracao.valorPendente }];
  const dataQtd = [
    { nome: 'Pagas', value: apuracao.qtdPagas },
    { nome: 'Pendentes', value: apuracao.qtdPendentes },
  ];
  const porFornecedor: Record<string, number> = {};
  apuracao.notas.filter((n) => n.status === 'PENDENTE').forEach((n) => {
    const key = n.fornecedor || 'Não identificado';
    porFornecedor[key] = (porFornecedor[key] || 0) + n.valor;
  });
  const topFornecedores = Object.entries(porFornecedor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([nome, valor]) => ({ nome: nome.length > 30 ? nome.slice(0, 30) + '…' : nome, valor }));

  return (
    <div className="space-y-6">
      <p className="text-xs text-gray-400">
        Período {apuracao.periodo} · processado em {new Date(apuracao.processedAt).toLocaleString('pt-BR')}
        {apuracao.semPagamento ? ' · cenário sem pagamento no mês — todas as notas elegíveis calculadas como pendentes' : ''}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Notas de entrada" value={fmtNum(apuracao.totalNF)} sub="total no período" />
        <Kpi label="Já recolhidas" value={fmtNum(apuracao.qtdPagas)} sub={`${fmtBRL(apuracao.valorPago)}`} color="text-[#00753A]" />
        <Kpi label="Pendentes" value={fmtNum(apuracao.qtdPendentes)} sub={`${fmtBRL(apuracao.valorPendente)}`} color="text-[#BE1E2D]" />
        <Kpi label="Conclusão do período" value={`${percent.toFixed(1)}%`} sub="das notas já quitadas" bar={percent} />
      </div>

      <div className="flex flex-wrap gap-3">
        <StatChip label="Itens elegíveis (TES permitidas)" value={fmtNum(apuracao.itensConsiderados)} />
        <StatChip label="Itens desconsiderados (outras TES)" value={fmtNum(apuracao.itensDesconsiderados)} />
        <StatChip label="Divergências valor pago × calculado" value={fmtNum(apuracao.divergencias)} warn={apuracao.divergencias > 0} />
        <StatChip label="Notas com alíquota não identificada" value={fmtNum(apuracao.qtdSemAliquota)} warn={apuracao.qtdSemAliquota > 0} />
      </div>

      {semAliquota.length > 0 && (
        <div className="card-surface p-5 border border-[#BE1E2D]/30">
          <h3 className="font-semibold text-[#BE1E2D] mb-1">⚠ Notas com alíquota não identificada</h3>
          <p className="text-xs text-gray-500 mb-3">
            Estes itens têm TES elegível, mas a UF de origem não corresponde a nenhuma faixa de alíquota conhecida
            (12% ou 7%), e não se enquadram na regra de importação (15%). Revise a UF de origem cadastrada — o ICMS
            destes itens <strong>não</strong> está incluído nos totais acima.
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="py-1.5">Nota</th><th>Fornecedor</th><th>UF informada</th><th>TES</th><th>Itens sem alíquota</th>
              </tr>
            </thead>
            <tbody>
              {semAliquota.map((n) => (
                <tr key={n.id} className="border-b border-gray-50">
                  <td className="py-1.5">{n.docFiscal}</td><td>{n.fornecedor}</td><td>{n.uf || '—'}</td><td>{n.tes}</td><td>{n.itensSemAliquota}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-surface p-5">
          <h3 className="font-semibold text-sm mb-3">Valor de ICMS por status</h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dataValores} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `R$ ${Number(v).toLocaleString('pt-BR')}`} fontSize={11} />
                <YAxis type="category" dataKey="nome" width={0} tick={false} />
                <Tooltip formatter={(v: number) => fmtBRL(v)} />
                <Legend />
                <Bar dataKey="Recolhido" fill={CORES.pago} radius={[0, 3, 3, 0]} />
                <Bar dataKey="Pendente" fill={CORES.pendente} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card-surface p-5">
          <h3 className="font-semibold text-sm mb-3">Composição das notas</h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dataQtd} dataKey="value" nameKey="nome" innerRadius={55} outerRadius={80}>
                  <Cell fill={CORES.pago} />
                  <Cell fill={CORES.pendente} />
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {topFornecedores.length > 0 && (
        <div className="card-surface p-5">
          <h3 className="font-semibold text-sm mb-1">Pendências por fornecedor</h3>
          <p className="text-xs text-gray-500 mb-3">Fornecedores com maior valor de ICMS Antecipado Especial ainda a recolher.</p>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topFornecedores} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `R$ ${Number(v).toLocaleString('pt-BR')}`} fontSize={11} />
                <YAxis type="category" dataKey="nome" width={160} fontSize={11} />
                <Tooltip formatter={(v: number) => fmtBRL(v)} />
                <Bar dataKey="valor" fill={CORES.destaque} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, color, bar }: { label: string; value: string; sub: string; color?: string; bar?: number }) {
  return (
    <div className="card-surface p-4 relative overflow-hidden">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color || 'text-gray-800'}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
      {bar !== undefined && (
        <div className="absolute bottom-0 left-0 h-[3px] bg-gray-100 w-full">
          <div className="h-full bg-[#00753A]" style={{ width: `${bar}%` }} />
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`flex-1 min-w-[180px] card-surface p-3 text-xs flex items-center justify-between gap-3 ${warn ? 'border border-[#BE1E2D]/40 bg-[#FBE4D9]/30' : ''}`}>
      <span className="text-gray-500">{label}</span>
      <strong className={`font-mono ${warn ? 'text-[#BE1E2D]' : 'text-gray-800'}`}>{value}</strong>
    </div>
  );
}

// ============================================================
// VIEW: TABELA (Pagas / Pendentes)
// ============================================================
function NotasTable({ apuracao, kind }: { apuracao: ApuracaoDB; kind: 'PAGO' | 'PENDENTE' }) {
  const isPagas = kind === 'PAGO';
  const todasNotas = apuracao.notas.filter((n) => n.status === kind);

  const [filtros, setFiltros] = useState<Record<string, string>>({});

  const fornecedores = Array.from(new Set(todasNotas.map((n) => n.fornecedor).filter(Boolean))).sort() as string[];
  const ufs = Array.from(new Set(todasNotas.flatMap((n) => (n.uf || '').split(',').map((s) => s.trim())).filter(Boolean))).sort();

  const rows = todasNotas.filter((n) => {
    if (filtros.doc_fiscal && !n.docFiscal.toLowerCase().includes(filtros.doc_fiscal.toLowerCase())) return false;
    if (filtros.fornecedor && n.fornecedor !== filtros.fornecedor) return false;
    if (filtros.cnpj && !(n.cnpj || '').includes(filtros.cnpj)) return false;
    if (filtros.uf && !(n.uf || '').split(',').map((s) => s.trim()).includes(filtros.uf)) return false;
    return true;
  });

  const totalValor = rows.reduce((s, n) => s + (isPagas ? (n.valorPago ?? n.valor) : n.valor), 0);

  function exportarExcel() {
    const data = rows.map((n) => ({
      'Nota Fiscal': n.docFiscal,
      Fornecedor: n.fornecedor,
      CNPJ: n.cnpj,
      'UF de origem': n.uf,
      Filial: n.filial,
      Produto: n.produto,
      NCM: n.ncm,
      TES: n.tes,
      'Base de Cálculo (R$)': n.base,
      ...(isPagas
        ? {
            'Valor Pago - DAE (R$)': n.valorPago,
            'ICMS Calculado pelo Sistema (R$)': n.valor,
            'Divergência (R$)': n.divergencia || 0,
            'Data Pagamento': fmtDate(n.dataPagamento),
          }
        : {
            'ICMS Antecipado Especial a Recolher (R$)': n.valor,
            Data: fmtDate(n.dataEmissao),
          }),
      Status: isPagas ? 'Pago' : 'Pendente',
      'Alíquota não identificada em algum item?': n.itensSemAliquota ? `Sim (${n.itensSemAliquota} item(ns))` : 'Não',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isPagas ? 'Notas Pagas' : 'Notas Pendentes');
    const resumo = [
      { Indicador: 'Período', Valor: apuracao.periodo },
      { Indicador: 'Total de notas de entrada', Valor: apuracao.totalNF },
      { Indicador: 'Notas pagas', Valor: apuracao.qtdPagas },
      { Indicador: 'Notas pendentes', Valor: apuracao.qtdPendentes },
      { Indicador: 'Valor total recolhido (R$)', Valor: apuracao.valorPago },
      { Indicador: 'Valor total pendente (R$)', Valor: apuracao.valorPendente },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Resumo');
    XLSX.writeFile(wb, `ICMS_Antecipado_Especial_${isPagas ? 'Pagas' : 'Pendentes'}_${apuracao.periodo.replace('/', '-')}.xlsx`);
  }

  return (
    <div className="card-surface p-5 space-y-4 print:shadow-none">
      <div className="flex flex-wrap items-end gap-3">
        <FilterField label="Nº da nota">
          <input value={filtros.doc_fiscal || ''} onChange={(e) => setFiltros({ ...filtros, doc_fiscal: e.target.value })} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs w-32" />
        </FilterField>
        <FilterField label="Fornecedor">
          <select value={filtros.fornecedor || ''} onChange={(e) => setFiltros({ ...filtros, fornecedor: e.target.value })} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs w-40">
            <option value="">Todos</option>
            {fornecedores.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </FilterField>
        <FilterField label="CNPJ">
          <input value={filtros.cnpj || ''} onChange={(e) => setFiltros({ ...filtros, cnpj: e.target.value })} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs w-36" />
        </FilterField>
        {ufs.length > 0 && (
          <FilterField label="UF de origem">
            <select value={filtros.uf || ''} onChange={(e) => setFiltros({ ...filtros, uf: e.target.value })} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs w-28">
              <option value="">Todas</option>
              {ufs.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </FilterField>
        )}
        <button onClick={() => setFiltros({})} className="text-xs text-gray-500 underline ml-auto">Limpar filtros</button>
      </div>

      <div className="overflow-x-auto border border-gray-100 rounded-lg">
        <table className="w-full text-xs min-w-[900px]">
          <thead>
            <tr className="bg-brand text-white text-left">
              <th className="px-3 py-2">Nota</th>
              <th className="px-3 py-2">Fornecedor</th>
              <th className="px-3 py-2">UF origem</th>
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2">TES</th>
              {isPagas ? (
                <>
                  <th className="px-3 py-2">Data pgto</th>
                  <th className="px-3 py-2">Valor pago</th>
                  <th className="px-3 py-2">ICMS calculado</th>
                  <th className="px-3 py-2">Divergência</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-2">Base de cálculo</th>
                  <th className="px-3 py-2">ICMS a recolher</th>
                </>
              )}
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => (
              <tr key={n.id} className="border-b border-gray-50">
                <td className="px-3 py-1.5">{n.docFiscal}</td>
                <td className="px-3 py-1.5">{n.fornecedor}</td>
                <td className="px-3 py-1.5">{n.uf}</td>
                <td className="px-3 py-1.5 max-w-[220px] truncate">{n.produto}</td>
                <td className="px-3 py-1.5">{n.tes}</td>
                {isPagas ? (
                  <>
                    <td className="px-3 py-1.5">{fmtDate(n.dataPagamento)}</td>
                    <td className="px-3 py-1.5 font-mono text-right">{fmtBRL(n.valorPago)}</td>
                    <td className="px-3 py-1.5 font-mono text-right">{fmtBRL(n.valor)}</td>
                    <td className={`px-3 py-1.5 font-mono text-right ${n.divergencia ? 'text-[#BE1E2D] font-semibold' : 'text-gray-400'}`}>
                      {n.divergencia ? `${n.divergencia > 0 ? '+' : ''}${fmtBRL(n.divergencia)}` : '—'}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-1.5 font-mono text-right">{fmtBRL(n.base)}</td>
                    <td className="px-3 py-1.5 font-mono text-right font-semibold text-[#F6921E]">{fmtBRL(n.valor)}</td>
                  </>
                )}
                <td className="px-3 py-1.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${isPagas ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {isPagas ? 'Pago' : 'Pendente'}
                  </span>
                  {n.itensSemAliquota > 0 && (
                    <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700">Revisar alíquota</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Nenhuma nota encontrada para os filtros selecionados.</p>}
      </div>

      <div className="flex justify-between items-center text-xs text-gray-500 print:hidden">
        <span>{fmtNum(rows.length)} nota(s) · total {fmtBRL(totalValor)}</span>
        <div className="flex gap-2">
          <button onClick={exportarExcel} className="bg-accent text-white rounded-lg px-3 py-1.5 font-medium">Exportar Excel</button>
          <button onClick={() => window.print()} className="bg-brand text-white rounded-lg px-3 py-1.5 font-medium">Exportar PDF</button>
        </div>
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wide text-gray-400">{label}</label>
      {children}
    </div>
  );
}
