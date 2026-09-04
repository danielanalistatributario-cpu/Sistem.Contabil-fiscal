'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { History, Settings, BookOpenText } from 'lucide-react';
import { ImportHero } from '@/components/ImportHero';
import * as XLSX from 'xlsx';
import { canAccess, type Role } from '@/lib/permissions';

type Severidade = 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO' | 'INFORMATIVO';

type DivergenciaDB = {
  id: string;
  itemId: string;
  severidade: Severidade;
  tipo: string;
  regraEsperada: string;
  informacaoEncontrada: string;
  motivo: string;
  sugestaoCorrecao: string | null;
};

type ItemDB = {
  id: string;
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

type LinhaDivergencia = DivergenciaDB & { item: ItemDB };

export default function AnaliseFiscalPage() {
  return (
    <Suspense fallback={null}>
      <AnaliseFiscalInner />
    </Suspense>
  );
}

function AnaliseFiscalInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const apuracaoIdParam = searchParams.get('apuracaoId');

  const [file, setFile] = useState<File | null>(null);
  const [periodo, setPeriodo] = useState('');
  const [loading, setLoading] = useState(false);
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
    setLoading(true);

    try {
      // O arquivo é enviado bruto e lido no servidor — relatórios reais
      // chegam a milhares de linhas, e mandar isso já interpretado como
      // JSON estoura o limite de payload da hospedagem bem antes do
      // arquivo .xlsx compacto original.
      const formData = new FormData();
      formData.append('file', file);
      if (periodo) formData.append('periodo', periodo);

      const res = await fetch('/api/analise-fiscal/apurar', { method: 'POST', body: formData });
      const data = await res.json().catch(() => null);
      setLoading(false);

      if (!res.ok) {
        setErro(data?.error || `Falha ao processar (HTTP ${res.status}).`);
        return;
      }
      setApuracao(data.apuracao);
    } catch (err) {
      setLoading(false);
      setErro('Não foi possível enviar o arquivo. Verifique sua conexão e tente novamente.');
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
    router.replace('/dashboard/analise-fiscal');
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

  function exportarExcel() {
    if (!apuracao) return;
    const wsDivergencias = XLSX.utils.json_to_sheet(
      divergenciasFlat.map((d) => ({
        'Linha': d.item.linha,
        'Nota Fiscal': d.item.numeroNf || '',
        'TES': d.item.tes,
        'Produto': d.item.produtoDescricao || '',
        'Fornecedor': d.item.fornecedor || '',
        'CNPJ/CPF': d.item.cnpjCpf || '',
        'CFOP': d.item.cfop || '',
        'UF': d.item.uf || '',
        'Severidade': SEVERIDADE_LABEL[d.severidade],
        'Tipo': d.tipo,
        'Regra Esperada': d.regraEsperada,
        'Informação Encontrada': d.informacaoEncontrada,
        'Motivo': d.motivo,
        'Sugestão de Correção': d.sugestaoCorrecao || '',
      }))
    );
    const wsItens = XLSX.utils.json_to_sheet(
      apuracao.itens.map((i) => ({
        'Linha': i.linha,
        'Nota Fiscal': i.numeroNf || '',
        'Chave NF': i.chaveNf || '',
        'TES': i.tes,
        'TES Conhecida': i.tesConhecida ? 'Sim' : 'Não',
        'Produto': i.produtoDescricao || '',
        'Código Produto': i.produtoCodigo || '',
        'CFOP': i.cfop || '',
        'UF': i.uf || '',
        'Fornecedor': i.fornecedor || '',
        'CNPJ/CPF': i.cnpjCpf || '',
        'Qtd. Divergências': i.divergencias.length,
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsDivergencias, 'Divergências');
    XLSX.utils.book_append_sheet(wb, wsItens, 'Itens Importados');
    XLSX.writeFile(wb, `Analise_Fiscal_Entradas_${(apuracao.periodo || 'sem-periodo').replace('/', '-')}.xlsx`);
  }

  return (
    <div className="space-y-6">
      {!apuracao ? (
        <ImportHero
          eyebrow="Auditoria fiscal · Entradas"
          titleParts={['Análise e', { text: 'Apuração Fiscal', accent: true }]}
          description="Importe o Relatório Fiscal de Entradas e o sistema audita cada lançamento contra o tratamento tributário esperado pela TES — cruzando produto, CFOP, UF, fornecedor, chave de NF-e e os cálculos de ICMS/PIS/COFINS, apontando exatamente onde e por que cada divergência acontece."
          badges={['Regras por TES (Protheus)', 'Aponta motivo e sugestão de correção']}
        />
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-semibold text-brand">Análise e Apuração Fiscal</h1>
            <p className="text-gray-500 text-sm mt-1">Auditoria do Relatório Fiscal de Entradas — Relatório de Saídas em etapa futura.</p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {canAccess(role, 'analiseFiscalConfig') && (
              <>
                <Link href="/dashboard/analise-fiscal/regras" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
                  <BookOpenText size={15} />
                  Regras da Análise Fiscal
                </Link>
                <Link href="/dashboard/analise-fiscal/config" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
                  <Settings size={15} />
                  Configurar TES
                </Link>
              </>
            )}
            <Link href="/dashboard/analise-fiscal/historico" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
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
                Regras da Análise Fiscal
              </Link>
              <Link href="/dashboard/analise-fiscal/config" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
                <Settings size={15} />
                Configurar TES
              </Link>
            </>
          )}
          <Link href="/dashboard/analise-fiscal/historico" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
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
            />
            <input
              type="text"
              placeholder="Período/rótulo (opcional)"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-48"
            />
            <button
              onClick={handleProcessar}
              disabled={!file || loading}
              className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Processando...' : 'Analisar Entradas'}
            </button>
          </div>
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
                {apuracao.totalLinhas} <span className="text-sm text-gray-400 font-normal">/ {apuracao.totalNotas}</span>
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
                <button onClick={exportarExcel} className="bg-accent text-white rounded-lg px-3 py-1.5 text-sm font-medium">
                  Exportar Excel
                </button>
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
                  {divergenciasFiltradas.map((d) => (
                    <tr key={d.id} className="border-b border-gray-50 align-top">
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
