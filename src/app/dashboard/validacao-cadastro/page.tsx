'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { History, Settings2 } from 'lucide-react';
import { ImportHero } from '@/components/ImportHero';
import * as XLSX from 'xlsx';
import { lerCadastroProdutos } from '@/lib/cadastro-produtos-reader';

type StatusItem = 'OK' | 'DIVERGENTE' | 'SEM_PERFIL' | 'DUPLICADO';

type ItemDB = {
  id: string;
  codigo: string;
  descricao: string | null;
  perfilAtual: string | null;
  perfilEncontrado: string | null;
  perfisEncontrados: string | null;
  status: StatusItem;
  observacao: string | null;
};

type ApuracaoDB = {
  id: string;
  periodo: string | null;
  totalItens: number;
  totalOk: number;
  totalDivergente: number;
  totalSemPerfil: number;
  totalDuplicado: number;
  processedAt: string;
  itens: ItemDB[];
};

const STATUS_LABEL: Record<StatusItem, string> = {
  OK: 'OK',
  DIVERGENTE: 'Divergente',
  SEM_PERFIL: 'Sem perfil',
  DUPLICADO: 'Duplicado',
};

const STATUS_COLOR: Record<StatusItem, string> = {
  OK: 'bg-green-100 text-green-700',
  DIVERGENTE: 'bg-amber-100 text-amber-700',
  SEM_PERFIL: 'bg-gray-200 text-gray-600',
  DUPLICADO: 'bg-red-100 text-red-700',
};

export default function ValidacaoCadastroPage() {
  return (
    <Suspense fallback={null}>
      <ValidacaoCadastroInner />
    </Suspense>
  );
}

function ValidacaoCadastroInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const apuracaoIdParam = searchParams.get('apuracaoId');

  const [file, setFile] = useState<File | null>(null);
  const [periodo, setPeriodo] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [apuracao, setApuracao] = useState<ApuracaoDB | null>(null);
  const [temPerfis, setTemPerfis] = useState<boolean | null>(null);
  const [filtro, setFiltro] = useState<'TODOS' | StatusItem>('TODOS');
  const [perfilSelecionado, setPerfilSelecionado] = useState<string>('TODOS');
  const [busca, setBusca] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/validacao-cadastro/perfis');
      if (res.ok) {
        const data = await res.json();
        setTemPerfis((data.perfis || []).length > 0);
      }
    })();
  }, []);

  useEffect(() => {
    if (!apuracaoIdParam) return;
    (async () => {
      const res = await fetch(`/api/validacao-cadastro/apuracoes/${apuracaoIdParam}`);
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
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
        header: 1,
        raw: true,
        defval: null,
      }) as unknown[][];

      const leitura = lerCadastroProdutos(aoa);
      if (leitura.erro) {
        setErro(leitura.erro);
        setLoading(false);
        return;
      }

      const res = await fetch('/api/validacao-cadastro/apurar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo: periodo || null, itens: leitura.rows }),
      });
      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setErro(data.error || 'Falha ao processar.');
        return;
      }
      setApuracao(data.apuracao);
    } catch (err) {
      setLoading(false);
      setErro('Não foi possível ler o arquivo. Verifique se é um .xlsx válido no layout esperado.');
      console.error(err);
    }
  }

  function handleNovaValidacao() {
    setApuracao(null);
    setFile(null);
    setPeriodo('');
    setErro(null);
    setFiltro('TODOS');
    setPerfilSelecionado('TODOS');
    setBusca('');
    if (inputRef.current) inputRef.current.value = '';
    router.replace('/dashboard/validacao-cadastro');
  }

  function exportarExcel() {
    if (!apuracao) return;
    const ws = XLSX.utils.json_to_sheet(
      apuracao.itens.map((i) => ({
        'Código': i.codigo,
        'Descrição': i.descricao || '',
        'Perfil Atual': i.perfilAtual || '',
        'Perfil Encontrado': i.perfilEncontrado || i.perfisEncontrados || '',
        'Status': STATUS_LABEL[i.status],
        'Observações': i.observacao || '',
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Validação de Cadastro');
    XLSX.writeFile(wb, `Validacao_Cadastro_Produtos_${(apuracao.periodo || 'sem-periodo').replace('/', '-')}.xlsx`);
  }

  const perfisDisponiveis = useMemo(() => {
    if (!apuracao) return [];
    const nomes = new Set<string>();
    apuracao.itens.forEach((i) => {
      if (i.perfilEncontrado) nomes.add(i.perfilEncontrado);
    });
    return Array.from(nomes).sort();
  }, [apuracao]);

  const itensFiltrados = useMemo(() => {
    if (!apuracao) return [];
    const buscaNorm = busca.trim().toLowerCase();
    return apuracao.itens.filter((i) => {
      if (filtro !== 'TODOS' && i.status !== filtro) return false;
      if (perfilSelecionado !== 'TODOS' && i.perfilEncontrado !== perfilSelecionado) return false;
      if (buscaNorm) {
        const alvo = `${i.codigo} ${i.descricao || ''}`.toLowerCase();
        if (!alvo.includes(buscaNorm)) return false;
      }
      return true;
    });
  }, [apuracao, filtro, perfilSelecionado, busca]);

  return (
    <div className="space-y-6">
      {!apuracao ? (
        <ImportHero
          eyebrow="Auditoria de cadastro · Perfis de Produtos"
          titleParts={['Validação de', { text: 'Cadastro', accent: true }, 'de Produtos']}
          description="Importe o cadastro de produtos da empresa e o sistema confronta automaticamente cada item com os Perfis de Produtos cadastrados, apontando divergências, produtos sem perfil e códigos duplicados entre perfis."
          badges={['Comparação por código do produto', 'Detecta classificação incorreta']}
        />
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-semibold text-brand">Validação de Cadastro de Produtos</h1>
            <p className="text-gray-500 text-sm mt-1">
              Auditoria do cadastro de produtos contra os Perfis de Produtos cadastrados.
            </p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <Link href="/dashboard/validacao-cadastro/perfis" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
              <Settings2 size={15} />
              Perfis de Produtos
            </Link>
            <Link href="/dashboard/validacao-cadastro/historico" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
              <History size={15} />
              Histórico
            </Link>
            <button onClick={handleNovaValidacao} className="text-sm text-brand underline whitespace-nowrap">
              + Nova validação
            </button>
          </div>
        </div>
      )}

      {!apuracao && (
        <div className="flex justify-end gap-4">
          <Link href="/dashboard/validacao-cadastro/perfis" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
            <Settings2 size={15} />
            Gerenciar Perfis de Produtos
          </Link>
          <Link href="/dashboard/validacao-cadastro/historico" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
            <History size={15} />
            Ver histórico de validações
          </Link>
        </div>
      )}

      {temPerfis === false && !apuracao && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
          Nenhum Perfil de Produto cadastrado ainda. Cadastre ao menos um perfil em{' '}
          <Link href="/dashboard/validacao-cadastro/perfis" className="underline font-medium">
            Perfis de Produtos
          </Link>{' '}
          antes de validar o cadastro.
        </div>
      )}

      {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>}

      {!apuracao && (
        <div className="card-surface p-5 space-y-3">
          <p className="text-xs text-gray-500">
            Envie o cadastro de produtos da empresa (Excel/CSV) contendo, no mínimo, as colunas Código, Descrição e
            Perfil/Classificação atual usada no ERP.
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
              disabled={!file || loading || temPerfis === false}
              className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Processando...' : 'Validar Cadastro'}
            </button>
          </div>
        </div>
      )}

      {apuracao && (
        <>
          <p className="text-xs text-gray-400">
            {apuracao.periodo ? `${apuracao.periodo} · ` : ''}processado em {new Date(apuracao.processedAt).toLocaleString('pt-BR')}
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card-surface p-4">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Total de produtos</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{apuracao.totalItens}</p>
            </div>
            <div className="card-surface p-4">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">OK</p>
              <p className="text-2xl font-display font-semibold text-green-600 mt-1">{apuracao.totalOk}</p>
            </div>
            <div className={`card-surface p-4 ${apuracao.totalDivergente > 0 ? 'border border-amber-300' : ''}`}>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Divergentes</p>
              <p className={`text-2xl font-bold mt-1 ${apuracao.totalDivergente > 0 ? 'text-amber-600' : 'text-gray-800'}`}>
                {apuracao.totalDivergente}
              </p>
            </div>
            <div className={`card-surface p-4 ${apuracao.totalDuplicado > 0 ? 'border border-ruby/40' : ''}`}>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Sem perfil / Duplicados</p>
              <p className="text-lg font-bold mt-1">
                <span className="text-gray-600">{apuracao.totalSemPerfil}</span>
                <span className="text-gray-300 mx-1">/</span>
                <span className={apuracao.totalDuplicado > 0 ? 'text-ruby' : 'text-gray-600'}>{apuracao.totalDuplicado}</span>
              </p>
            </div>
          </div>

          <div className="card-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex flex-wrap gap-2">
                {(['TODOS', 'OK', 'DIVERGENTE', 'SEM_PERFIL', 'DUPLICADO'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFiltro(f)}
                    className={`text-sm px-3 py-1.5 rounded-lg border ${
                      filtro === f ? 'bg-brand text-white border-brand' : 'border-gray-300 text-gray-600'
                    }`}
                  >
                    {f === 'TODOS' ? 'Todos' : STATUS_LABEL[f]}
                  </button>
                ))}
              </div>
              <button onClick={exportarExcel} className="bg-accent text-white rounded-lg px-3 py-1.5 text-sm font-medium">
                Exportar Excel
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <select
                value={perfilSelecionado}
                onChange={(e) => setPerfilSelecionado(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="TODOS">Todos os perfis</option>
                {perfisDisponiveis.map((p) => (
                  <option key={p} value={p}>
                    Pertence ao perfil: {p}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Buscar por código ou descrição..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[220px]"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[800px]">
                <thead>
                  <tr className="bg-brand text-white text-left">
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Descrição</th>
                    <th className="px-3 py-2">Perfil Atual</th>
                    <th className="px-3 py-2">Perfil Encontrado</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {itensFiltrados.map((i) => (
                    <tr key={i.id} className="border-b border-gray-50">
                      <td className="px-3 py-1.5 font-mono">{i.codigo}</td>
                      <td className="px-3 py-1.5 max-w-[220px] truncate">{i.descricao}</td>
                      <td className="px-3 py-1.5">{i.perfilAtual}</td>
                      <td className="px-3 py-1.5">{i.perfilEncontrado || i.perfisEncontrados || '—'}</td>
                      <td className="px-3 py-1.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLOR[i.status]}`}>
                          {STATUS_LABEL[i.status]}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 max-w-[260px] truncate text-gray-500">{i.observacao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {itensFiltrados.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">Nenhum item encontrado para este filtro.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
