'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, History, Settings, BookOpenText } from 'lucide-react';
import { ImportHero } from '@/components/ImportHero';
import * as XLSX from 'xlsx';
import { lerRelatorioEntradas } from '@/lib/analise-fiscal-reader';
import { apurarEntradas, type ItemApurado, type ResumoApuracao } from '@/lib/analise-fiscal-compute';
import type { TesMetadata } from '@/lib/analise-fiscal-tes-registry';
import { canAccess, type Role } from '@/lib/permissions';

type Severidade = 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO' | 'INFORMATIVO';

type DivergenciaDB = {
  id?: string;
  severidade: Severidade;
  tipo: string;
  regraEsperada: string;
  informacaoEncontrada: string;
  motivo: string;
  sugestaoCorrecao: string | null;
};

type ItemDB = {
  linha: number;
  tes: string;
  tesConhecida: boolean;
  produtoCodigo: string | null;
  produtoDescricao: string | null;
  cfop: string | null;
  uf: string | null;
  fornecedor: string | null;
  cnpjCpf: string | null;
  chaveNf: string | null;
  numeroNf: string | null;
  divergencias: DivergenciaDB[];
};

type ApuracaoDB = {
  id: string;
  periodo: string | null;
  fileName: string | null;
  status: string;
  totalLinhas: number;
  totalNotas: number;
  totalProdutos: number;
  totalTes: number;
  totalCfops: number;
  qtdTesNovas: number;
  qtdNotasSemChave: number;
  totalDivergencias: number;
  qtdCritico: number;
  qtdAlto: number;
  qtdMedio: number;
  qtdBaixo: number;
  qtdInformativo: number;
  tesNovasEncontradas: string | null;
  processedAt: string;
  itens: ItemDB[];
};

const SEVERIDADE_LABEL: Record<Severidade, string> = {
  CRITICO: 'Crítico',
  ALTO: 'Alto',
  MEDIO: 'Médio',
  BAIXO: 'Baixo',
  INFORMATIVO: 'Informativo',
};

const SEVERIDADE_COLOR: Record<Severidade, string> = {
  CRITICO: 'bg-red-100 text-red-700',
  ALTO: 'bg-amber-100 text-amber-700',
  MEDIO: 'bg-yellow-100 text-yellow-700',
  BAIXO: 'bg-blue-100 text-blue-700',
  INFORMATIVO: 'bg-gray-200 text-gray-600',
};

const SEVERIDADE_ORDEM: Severidade[] = ['CRITICO', 'ALTO', 'MEDIO', 'BAIXO', 'INFORMATIVO'];
const TAMANHO_LOTE = 2000;

type LinhaDivergencia = DivergenciaDB & { item: ItemDB };

function paraItemView(item: ItemApurado): ItemDB {
  return {
    linha: item.linha.linha,
    tes: item.linha.tes,
    tesConhecida: item.tesConhecida,
    produtoCodigo: item.linha.produtoCodigo || null,
    produtoDescricao: item.linha.produtoDescricao || null,
    cfop: item.linha.cfop || null,
    uf: item.linha.uf || null,
    fornecedor: item.linha.fornecedor || null,
    cnpjCpf: item.linha.cnpjCpf || null,
    chaveNf: item.linha.chaveNf || null,
    numeroNf: item.linha.numeroNf || null,
    divergencias: item.divergencias.map((d) => ({ ...d, sugestaoCorrecao: d.sugestaoCorrecao || null })),
  };
}

export default function AnaliseFiscalEntradaPage() {
  return (
    <Suspense fallback={null}>
      <AnaliseFiscalEntradaInner />
    </Suspense>
  );
}

function AnaliseFiscalEntradaInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const apuracaoIdParam = searchParams.get('apuracaoId');

  const [file, setFile] = useState<File | null>(null);
  const [periodo, setPeriodo] = useState('');
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState<{ fase: string; loteAtual: number; totalLotes: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [apuracao, setApuracao] = useState<ApuracaoDB | null>(null);
  const [filtroSeveridade, setFiltroSeveridade] = useState<'TODOS' | Severidade>('TODOS');
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');
  const [busca, setBusca] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (!apuracaoIdParam) return;
    (async () => {
      const res = await fetch(`/api/analise-fiscal/apuracoes/${apuracaoIdParam}`);
      if (res.ok) {
        const data = await res.json();
        setApuracao(data.apuracao);
      }
    })();
  }, [apuracaoIdParam]);

  async function handleProcessar() {
    if (!file) return;
    setErro(null);
    setApuracao(null);
    setProcessando(true);

    try {
      setProgresso({ fase: 'Lendo arquivo...', loteAtual: 0, totalLotes: 0 });
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }) as unknown[][];
      const leitura = lerRelatorioEntradas(aoa);
      if (leitura.erro) {
        setErro(leitura.erro);
        setProcessando(false);
        setProgresso(null);
        return;
      }

      setProgresso({ fase: 'Carregando configuração da empresa...', loteAtual: 0, totalLotes: 0 });
      const resCfg = await fetch('/api/analise-fiscal/config-runtime');
      const cfg = await resCfg.json().catch(() => null);
      if (!resCfg.ok || !cfg) {
        setErro(cfg?.error || 'Não foi possível carregar a configuração da empresa.');
        setProcessando(false);
        setProgresso(null);
        return;
      }
      const tesMetadataPorCodigo = cfg.tesMetadataPorCodigo as Record<string, TesMetadata>;
      const cnpjsGrupo = new Set<string>(cfg.cnpjsGrupo);

      setProgresso({ fase: 'Calculando divergências...', loteAtual: 0, totalLotes: 0 });
      const { itens, resumo }: { itens: ItemApurado[]; resumo: ResumoApuracao } = apurarEntradas(
        leitura.rows,
        cfg.company,
        { tesMetadataPorCodigo, cnpjsGrupo }
      );

      setProgresso({ fase: 'Criando apuração...', loteAtual: 0, totalLotes: 0 });
      const resIniciar = await fetch('/api/analise-fiscal/apurar/iniciar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo: periodo || null, fileName: file.name, resumo }),
      });
      const dataIniciar = await resIniciar.json().catch(() => null);
      if (!resIniciar.ok) {
        setErro(dataIniciar?.error || 'Falha ao iniciar a apuração.');
        setProcessando(false);
        setProgresso(null);
        return;
      }
      const apuracaoId: string = dataIniciar.apuracaoId;

      const totalLotes = Math.ceil(itens.length / TAMANHO_LOTE) || 1;
      for (let i = 0; i < totalLotes; i++) {
        setProgresso({ fase: 'Enviando dados...', loteAtual: i + 1, totalLotes });
        const lote = itens.slice(i * TAMANHO_LOTE, (i + 1) * TAMANHO_LOTE);
        if (lote.length === 0) continue;
        const resLote = await fetch('/api/analise-fiscal/apurar/lote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apuracaoId, itens: lote }),
        });
        if (!resLote.ok) {
          const dataLote = await resLote.json().catch(() => null);
          setErro(dataLote?.error || `Falha ao enviar lote ${i + 1} de ${totalLotes}.`);
          setProcessando(false);
          setProgresso(null);
          return;
        }
      }

      setProgresso({ fase: 'Finalizando...', loteAtual: totalLotes, totalLotes });
      const resFinalizar = await fetch('/api/analise-fiscal/apurar/finalizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apuracaoId }),
      });
      if (!resFinalizar.ok) {
        const dataFin = await resFinalizar.json().catch(() => null);
        setErro(dataFin?.error || 'Falha ao finalizar a apuração.');
        setProcessando(false);
        setProgresso(null);
        return;
      }

      setApuracao({
        id: apuracaoId,
        periodo: periodo || null,
        fileName: file.name,
        status: 'CONCLUIDA',
        processedAt: new Date().toISOString(),
        ...resumo,
        tesNovasEncontradas: resumo.tesNovasEncontradas.join(', ') || null,
        itens: itens.filter((i) => i.divergencias.length > 0).map(paraItemView),
      });
      setProcessando(false);
      setProgresso(null);
      router.replace(`/dashboard/analise-fiscal/entrada?apuracaoId=${apuracaoId}`);
    } catch (err) {
      setProcessando(false);
      setProgresso(null);
      setErro('Não foi possível processar o arquivo. Verifique sua conexão e tente novamente.');
      console.error(err);
    }
  }

  function handleNovaAnalise() {
    setApuracao(null);
    setFile(null);
    setPeriodo('');
    setErro(null);
    setFiltroSeveridade('TODOS');
    setFiltroTipo('TODOS');
    setBusca('');
    if (inputRef.current) inputRef.current.value = '';
    router.replace('/dashboard/analise-fiscal/entrada');
  }

  const divergenciasFlat: LinhaDivergencia[] = useMemo(() => {
    if (!apuracao) return [];
    return apuracao.itens.flatMap((item) => item.divergencias.map((d) => ({ ...d, item })));
  }, [apuracao]);

  const tiposDisponiveis = useMemo(() => {
    const nomes = new Set<string>();
    divergenciasFlat.forEach((d) => nomes.add(d.tipo));
    return Array.from(nomes).sort();
  }, [divergenciasFlat]);

  const divergenciasFiltradas = useMemo(() => {
    const buscaNorm = busca.trim().toLowerCase();
    return divergenciasFlat
      .filter((d) => {
        if (filtroSeveridade !== 'TODOS' && d.severidade !== filtroSeveridade) return false;
        if (filtroTipo !== 'TODOS' && d.tipo !== filtroTipo) return false;
        if (buscaNorm) {
          const alvo = `${d.item.tes} ${d.item.produtoDescricao || ''} ${d.item.fornecedor || ''} ${d.item.numeroNf || ''}`.toLowerCase();
          if (!alvo.includes(buscaNorm)) return false;
        }
        return true;
      })
      .sort((a, b) => SEVERIDADE_ORDEM.indexOf(a.severidade) - SEVERIDADE_ORDEM.indexOf(b.severidade));
  }, [divergenciasFlat, filtroSeveridade, filtroTipo, busca]);

  return (
    <div className="space-y-6">
      <Link href="/dashboard/analise-fiscal" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors w-fit">
        <ArrowLeft size={15} />
        Análise e Apuração Fiscal
      </Link>

      {!apuracao ? (
        <ImportHero
          eyebrow="Auditoria fiscal · Entradas"
          titleParts={['Análise de', { text: 'Entradas', accent: true }]}
          description="Importe o Relatório Fiscal de Entradas e o sistema audita cada lançamento contra o tratamento tributário esperado pela TES — cruzando produto, CFOP, UF, fornecedor, chave de NF-e e os cálculos de ICMS/PIS/COFINS, apontando exatamente onde e por que cada divergência acontece."
          badges={['Regras por TES (Protheus)', 'Aponta motivo e sugestão de correção']}
        />
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-semibold text-brand">Análise de Entradas</h1>
            <p className="text-gray-500 text-sm mt-1">Auditoria do Relatório Fiscal de Entradas.</p>
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
            <Link href="/dashboard/analise-fiscal/entrada/historico" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
              <History size={15} />
              Histórico
            </Link>
            <button onClick={handleNovaAnalise} className="text-sm text-brand underline whitespace-nowrap">
              + Nova análise
            </button>
          </div>
        </div>
      )}

      {!apuracao && (
        <div className="flex justify-end gap-4">
          {canAccess(role, 'analiseFiscalConfig') && (
            <>
              <Link href="/dashboard/analise-fiscal/regras" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
                <BookOpenText size={15} />
                Regras da Análise e Apuração Fiscal
              </Link>
              <Link href="/dashboard/analise-fiscal/config" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
                <Settings size={15} />
                Configurar TES
              </Link>
            </>
          )}
          <Link href="/dashboard/analise-fiscal/entrada/historico" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
            <History size={15} />
            Ver histórico de análises
          </Link>
        </div>
      )}

      {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>}

      {!apuracao && (
        <div className="card-surface p-5 space-y-3">
          <p className="text-xs text-gray-500">
            Envie o Relatório Fiscal de Entradas (Excel/CSV) exportado do Protheus, contendo colunas como TES,
            Produto, CFOP, UF, Fornec./Cliente, CNPJ/CPF, Chave NF, Total e Valor Contábil.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="text-sm"
              disabled={processando}
            />
            <input
              type="text"
              placeholder="Período/rótulo (opcional)"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-48"
              disabled={processando}
            />
            <button
              onClick={handleProcessar}
              disabled={!file || processando}
              className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {processando ? 'Processando...' : 'Analisar Entradas'}
            </button>
          </div>
          {progresso && (
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-xs text-gray-500">
                <span>{progresso.fase}</span>
                {progresso.totalLotes > 0 && <span>{progresso.loteAtual} de {progresso.totalLotes} lote(s)</span>}
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: progresso.totalLotes > 0 ? `${(progresso.loteAtual / progresso.totalLotes) * 100}%` : '15%' }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {apuracao && (
        <>
          <p className="text-xs text-gray-400">
            {apuracao.periodo ? `${apuracao.periodo} · ` : ''}
            {apuracao.fileName ? `${apuracao.fileName} · ` : ''}
            processado em {new Date(apuracao.processedAt).toLocaleString('pt-BR')}
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="card-surface p-4">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Linhas / Notas</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">
                {apuracao.totalLinhas.toLocaleString('pt-BR')}{' '}
                <span className="text-sm text-gray-400 font-normal">/ {apuracao.totalNotas.toLocaleString('pt-BR')}</span>
              </p>
            </div>
            <div className={`card-surface p-4 ${apuracao.totalDivergencias > 0 ? 'border border-amber-300' : ''}`}>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Divergências</p>
              <p className={`text-2xl font-bold mt-1 ${apuracao.totalDivergencias > 0 ? 'text-amber-600' : 'text-gray-800'}`}>
                {apuracao.totalDivergencias}
              </p>
            </div>
            <div className={`card-surface p-4 ${apuracao.qtdCritico > 0 ? 'border border-red-300' : ''}`}>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Críticas / Altas</p>
              <p className="text-lg font-bold mt-1">
                <span className={apuracao.qtdCritico > 0 ? 'text-red-600' : 'text-gray-600'}>{apuracao.qtdCritico}</span>
                <span className="text-gray-300 mx-1">/</span>
                <span className={apuracao.qtdAlto > 0 ? 'text-amber-600' : 'text-gray-600'}>{apuracao.qtdAlto}</span>
              </p>
            </div>
            <div className={`card-surface p-4 ${apuracao.qtdTesNovas > 0 ? 'border border-teal/40' : ''}`}>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">TES novas</p>
              <p className={`text-2xl font-bold mt-1 ${apuracao.qtdTesNovas > 0 ? 'text-teal' : 'text-gray-800'}`}>
                {apuracao.qtdTesNovas}
              </p>
              {apuracao.tesNovasEncontradas && (
                <p className="text-[10px] text-gray-400 mt-1 truncate" title={apuracao.tesNovasEncontradas}>
                  {apuracao.tesNovasEncontradas}
                </p>
              )}
            </div>
            <div className={`card-surface p-4 ${apuracao.qtdNotasSemChave > 0 ? 'border border-ruby/40' : ''}`}>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Notas sem chave</p>
              <p className={`text-2xl font-bold mt-1 ${apuracao.qtdNotasSemChave > 0 ? 'text-ruby' : 'text-gray-800'}`}>
                {apuracao.qtdNotasSemChave}
              </p>
            </div>
          </div>

          <div className="card-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex flex-wrap gap-2">
                {(['TODOS', ...SEVERIDADE_ORDEM] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFiltroSeveridade(f)}
                    className={`text-sm px-3 py-1.5 rounded-lg border ${
                      filtroSeveridade === f ? 'bg-brand text-white border-brand' : 'border-gray-300 text-gray-600'
                    }`}
                  >
                    {f === 'TODOS' ? 'Todas' : SEVERIDADE_LABEL[f]}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <a
                  href={`/api/analise-fiscal/apuracoes/${apuracao.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-accent text-accent rounded-lg px-3 py-1.5 text-sm font-medium"
                >
                  Exportar PDF
                </a>
                <a
                  href={`/api/analise-fiscal/apuracoes/${apuracao.id}/excel`}
                  className="bg-accent text-white rounded-lg px-3 py-1.5 text-sm font-medium"
                >
                  Exportar Excel
                </a>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="TODOS">Todos os tipos</option>
                {tiposDisponiveis.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Buscar por TES, produto, fornecedor ou nota..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[220px]"
              />
            </div>

            <p className="text-xs text-gray-400 mb-2">
              Mostrando só os itens com divergência ({divergenciasFlat.length}) — o total de linhas importadas está no
              card acima.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[1000px]">
                <thead>
                  <tr className="bg-brand text-white text-left">
                    <th className="px-3 py-2">Nota</th>
                    <th className="px-3 py-2">TES</th>
                    <th className="px-3 py-2">Produto</th>
                    <th className="px-3 py-2">Fornecedor</th>
                    <th className="px-3 py-2">Severidade</th>
                    <th className="px-3 py-2">Motivo</th>
                    <th className="px-3 py-2">Sugestão</th>
                  </tr>
                </thead>
                <tbody>
                  {divergenciasFiltradas.map((d, idx) => (
                    <tr key={d.id || `${d.item.linha}-${idx}`} className="border-b border-gray-50 align-top">
                      <td className="px-3 py-1.5 font-mono whitespace-nowrap">{d.item.numeroNf || `L${d.item.linha}`}</td>
                      <td className="px-3 py-1.5 font-mono">{d.item.tes}</td>
                      <td className="px-3 py-1.5 max-w-[200px] truncate" title={d.item.produtoDescricao || ''}>{d.item.produtoDescricao}</td>
                      <td className="px-3 py-1.5 max-w-[180px] truncate" title={d.item.fornecedor || ''}>{d.item.fornecedor}</td>
                      <td className="px-3 py-1.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${SEVERIDADE_COLOR[d.severidade]}`}>
                          {SEVERIDADE_LABEL[d.severidade]}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 max-w-[320px] text-gray-600">{d.motivo}</td>
                      <td className="px-3 py-1.5 max-w-[240px] text-gray-500">{d.sugestaoCorrecao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {divergenciasFiltradas.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">Nenhuma divergência encontrada para este filtro.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
