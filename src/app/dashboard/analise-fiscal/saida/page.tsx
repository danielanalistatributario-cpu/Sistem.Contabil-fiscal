'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, History, Settings, BookOpenText } from 'lucide-react';
import { ImportHero } from '@/components/ImportHero';
import * as XLSX from 'xlsx';
import { lerRelatorioSaidas } from '@/lib/analise-fiscal-saida-reader';
import { lerPrimeiraAbaValida } from '@/lib/ler-planilha-multi-aba';
import { apurarSaidas, type ItemApuradoSaida, type ResumoApuracaoSaida } from '@/lib/analise-fiscal-saida-compute';
import type { TesMetadata } from '@/lib/analise-fiscal-tes-registry';
import { canAccess, type Role } from '@/lib/permissions';

type Severidade = 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO' | 'INFORMATIVO';

type DivergenciaView = {
  id?: string;
  severidade: Severidade;
  tipo: string;
  regraEsperada: string;
  informacaoEncontrada: string;
  motivo: string;
  sugestaoCorrecao: string | null;
};

type ItemView = {
  linha: number;
  tes: string;
  tesConhecida: boolean;
  produtoCodigo: string | null;
  produtoDescricao: string | null;
  cfop: string | null;
  uf: string | null;
  cliente: string | null;
  cnpjCpf: string | null;
  chaveNf: string | null;
  numeroNf: string | null;
  divergencias: DivergenciaView[];
};

type ApuracaoView = {
  id: string;
  periodo: string | null;
  fileName: string | null;
  status: string;
  processedAt: string;
  resumo: ResumoApuracaoSaida;
  itens: ItemView[];
  empresaAnalisadaNome?: string | null;
  empresaAnalisadaCnpj?: string | null;
  empresaAnalisadaUf?: string | null;
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

// Tela "Pergunte" (Data Base + Empresa) — o <input type="month"> nativo
// devolve "YYYY-MM"; convertido pra "MM/YYYY" no armazenamento, mesmo
// formato que já era usado nos exemplos de período em todo o sistema.
function monthInputParaPeriodo(v: string): string {
  if (!v) return '';
  const [ano, mes] = v.split('-');
  return mes && ano ? `${mes}/${ano}` : '';
}

// `resumo.tesNovasEncontradas` vem como string[] logo após processar
// (saída direta de apurarSaidas), mas como string já unida por vírgula
// quando a apuração é recarregada do histórico (coluna do banco,
// `resumo: a` reaproveita o objeto inteiro da API) — normaliza os dois
// formatos pra exibição.
function formatarTesNovas(v: string[] | string | null | undefined): string | null {
  if (!v) return null;
  const texto = Array.isArray(v) ? v.join(', ') : v;
  return texto || null;
}

// Converte o payload cru da API (linha do banco + itens) pro shape de
// tela — reaproveitado tanto no carregamento via histórico quanto logo
// após finalizar uma análise nova.
function paraApuracaoView(a: any): ApuracaoView {
  return {
    id: a.id,
    periodo: a.periodo,
    fileName: a.fileName,
    status: a.status,
    processedAt: a.processedAt,
    resumo: a,
    itens: a.itens,
    empresaAnalisadaNome: a.empresaAnalisadaNome,
    empresaAnalisadaCnpj: a.empresaAnalisadaCnpj,
    empresaAnalisadaUf: a.empresaAnalisadaUf,
  };
}

function paraItemView(item: ItemApuradoSaida): ItemView {
  return {
    linha: item.linha.linha,
    tes: item.linha.tes,
    tesConhecida: item.tesConhecida,
    produtoCodigo: item.linha.produtoCodigo || null,
    produtoDescricao: item.linha.produtoDescricao || null,
    cfop: item.linha.cfop || null,
    uf: item.linha.uf || null,
    cliente: item.linha.fornecedor || null,
    cnpjCpf: item.linha.cnpjCpf || null,
    chaveNf: item.linha.chaveNf || null,
    numeroNf: item.linha.numeroNf || null,
    divergencias: item.divergencias.map((d) => ({ ...d, sugestaoCorrecao: d.sugestaoCorrecao || null })),
  };
}

export default function AnaliseFiscalSaidaPage() {
  return (
    <Suspense fallback={null}>
      <AnaliseFiscalSaidaInner />
    </Suspense>
  );
}

function AnaliseFiscalSaidaInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const apuracaoIdParam = searchParams.get('apuracaoId');

  const [file, setFile] = useState<File | null>(null);
  const [dataBase, setDataBase] = useState('');
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState<{ fase: string; loteAtual: number; totalLotes: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [apuracao, setApuracao] = useState<ApuracaoView | null>(null);
  const [filtroSeveridade, setFiltroSeveridade] = useState<'TODOS' | Severidade>('TODOS');
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');
  const [busca, setBusca] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  // Filial ativa é lida do seletor "Filial" no topo da aplicação (Topbar),
  // global pra todo o módulo — esta tela não tem mais seletor próprio.
  const [currentEmpresaGrupoId, setCurrentEmpresaGrupoId] = useState<string | null>(null);
  const [temEmpresasGrupo, setTemEmpresasGrupo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setRole(data.user?.currentRole ?? null);
        setCurrentEmpresaGrupoId(data.user?.currentEmpresaGrupoId ?? null);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/analise-fiscal/config-runtime');
      if (res.ok) {
        const data = await res.json();
        setTemEmpresasGrupo((data.empresasGrupo || []).length > 0);
      }
    })();
  }, []);

  useEffect(() => {
    if (!apuracaoIdParam) return;
    (async () => {
      const res = await fetch(`/api/analise-fiscal/saida/apuracoes/${apuracaoIdParam}`);
      if (res.ok) {
        const data = await res.json();
        setApuracao(paraApuracaoView(data.apuracao));
      }
    })();
  }, [apuracaoIdParam]);

  async function handleProcessar() {
    if (!file) return;
    if (!dataBase) {
      setErro('Selecione a Data Base.');
      return;
    }
    if (temEmpresasGrupo && !currentEmpresaGrupoId) {
      setErro('Selecione a filial no topo da tela antes de continuar.');
      return;
    }
    const periodo = monthInputParaPeriodo(dataBase);
    setErro(null);
    setApuracao(null);
    setProcessando(true);

    try {
      setProgresso({ fase: 'Lendo arquivo...', loteAtual: 0, totalLotes: 0 });
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const leitura = lerPrimeiraAbaValida(wb, lerRelatorioSaidas);
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
      const produtosClassificacao = new Map<string, 'ISENTO' | 'TRIBUTADO'>(cfg.produtosClassificacao);
      const produtosClassificacaoPisCofins = new Map<string, 'ISENTO' | 'TRIBUTADO'>(cfg.produtosClassificacaoPisCofins);
      const produtosBeneficioAliquota = new Map<string, { interna: number | null; interestadual: number | null }>(cfg.produtosBeneficioAliquota);

      // cfg.company já vem resolvido pro lado servidor (UF/alíquota da
      // filial ativa, se houver — ver config-runtime/route.ts).
      setProgresso({ fase: 'Calculando divergências...', loteAtual: 0, totalLotes: 0 });
      const { itens, resumo } = apurarSaidas(leitura.rows, cfg.company, { tesMetadataPorCodigo, cnpjsGrupo, produtosClassificacao, produtosClassificacaoPisCofins, produtosBeneficioAliquota });

      setProgresso({ fase: 'Criando apuração...', loteAtual: 0, totalLotes: 0 });
      const resIniciar = await fetch('/api/analise-fiscal/saida/apurar/iniciar', {
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
        const resLote = await fetch('/api/analise-fiscal/saida/apurar/lote', {
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
      const resFinalizar = await fetch('/api/analise-fiscal/saida/apurar/finalizar', {
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

      // Busca o cabeçalho já persistido (empresaAnalisada* já resolvido no
      // servidor a partir da filial ativa) em vez de reconstruir esses
      // campos aqui.
      const resDetalhe = await fetch(`/api/analise-fiscal/saida/apuracoes/${apuracaoId}`);
      const dataDetalhe = await resDetalhe.json().catch(() => null);
      if (resDetalhe.ok && dataDetalhe?.apuracao) {
        setApuracao(paraApuracaoView(dataDetalhe.apuracao));
      } else {
        setApuracao({
          id: apuracaoId,
          periodo: periodo || null,
          fileName: file.name,
          status: 'CONCLUIDA',
          processedAt: new Date().toISOString(),
          resumo,
          itens: itens.filter((i) => i.divergencias.length > 0).map(paraItemView),
        });
      }
      setProcessando(false);
      setProgresso(null);
      router.replace(`/dashboard/analise-fiscal/saida?apuracaoId=${apuracaoId}`);
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
    setDataBase('');
    setErro(null);
    setFiltroSeveridade('TODOS');
    setFiltroTipo('TODOS');
    setBusca('');
    if (inputRef.current) inputRef.current.value = '';
    router.replace('/dashboard/analise-fiscal/saida');
  }

  const parametrosDefinidos = !!dataBase && (!temEmpresasGrupo || !!currentEmpresaGrupoId);

  const divergenciasFlat = useMemo(() => {
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
          const alvo = `${d.item.tes} ${d.item.produtoDescricao || ''} ${d.item.cliente || ''} ${d.item.numeroNf || ''}`.toLowerCase();
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
          eyebrow="Auditoria fiscal · Saídas"
          titleParts={['Análise de', { text: 'Saídas', accent: true }]}
          description="Importe o Relatório Fiscal de Saídas e o sistema audita cada venda/transferência contra o tratamento tributário esperado pela TES — mesma lógica do módulo de Entradas, adaptada pras TES de venda. Arquivos grandes (dezenas de milhares de linhas) são calculados no seu navegador e enviados em lotes."
          badges={['Regras por TES (Protheus)', 'Processa arquivos grandes em lotes']}
        />
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-semibold text-brand">Análise de Saídas</h1>
            <p className="text-gray-500 text-sm mt-1">Auditoria do Relatório Fiscal de Saídas (vendas e transferências).</p>
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
            <Link href="/dashboard/analise-fiscal/saida/historico" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
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
          <Link href="/dashboard/analise-fiscal/saida/historico" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
            <History size={15} />
            Ver histórico de análises
          </Link>
        </div>
      )}

      {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>}

      {!apuracao && (
        <div className="card-surface p-5 space-y-3">
          <h2 className="font-display font-semibold text-brand text-sm">Parâmetros da análise</h2>
          <p className="text-xs text-gray-500">
            Mesma lógica da tela "Pergunte" do Protheus — escolha a Data Base antes de enviar o arquivo.
            {temEmpresasGrupo && ' A filial é a selecionada no topo da tela.'}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Data Base</label>
              <input
                type="month"
                value={dataBase}
                onChange={(e) => setDataBase(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                disabled={processando}
                required
              />
            </div>
          </div>
          {!parametrosDefinidos && (
            <p className="text-xs text-gray-400">
              {!dataBase && 'Preencha a Data Base'}
              {!dataBase && temEmpresasGrupo && !currentEmpresaGrupoId && ' e selecione a filial no topo da tela'}
              {dataBase && temEmpresasGrupo && !currentEmpresaGrupoId && 'Selecione a filial no topo da tela'}
              {' '}pra liberar o envio do arquivo.
            </p>
          )}
        </div>
      )}

      {!apuracao && parametrosDefinidos && (
        <div className="card-surface p-5 space-y-3">
          <p className="text-xs text-gray-500">
            Envie o Relatório Fiscal de Saídas (Excel/CSV) exportado do Protheus — mesmas colunas do Relatório de
            Entradas (TES, Produto, CFOP, UF, Fornec./Cliente, CNPJ/CPF, Chave NF, Total).
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
            <button
              onClick={handleProcessar}
              disabled={!file || processando}
              className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {processando ? 'Processando...' : 'Analisar Saídas'}
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
            {apuracao.empresaAnalisadaNome ? `${apuracao.empresaAnalisadaNome} (${apuracao.empresaAnalisadaUf}) · ` : ''}
            {apuracao.periodo ? `${apuracao.periodo} · ` : ''}
            {apuracao.fileName ? `${apuracao.fileName} · ` : ''}
            processado em {new Date(apuracao.processedAt).toLocaleString('pt-BR')}
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="card-surface p-4">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Linhas / Notas</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">
                {apuracao.resumo.totalLinhas.toLocaleString('pt-BR')}{' '}
                <span className="text-sm text-gray-400 font-normal">/ {apuracao.resumo.totalNotas.toLocaleString('pt-BR')}</span>
              </p>
            </div>
            <div className={`card-surface p-4 ${apuracao.resumo.totalDivergencias > 0 ? 'border border-amber-300' : ''}`}>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Divergências</p>
              <p className={`text-2xl font-bold mt-1 ${apuracao.resumo.totalDivergencias > 0 ? 'text-amber-600' : 'text-gray-800'}`}>
                {apuracao.resumo.totalDivergencias}
              </p>
            </div>
            <div className={`card-surface p-4 ${apuracao.resumo.qtdCritico > 0 ? 'border border-red-300' : ''}`}>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Críticas / Altas</p>
              <p className="text-lg font-bold mt-1">
                <span className={apuracao.resumo.qtdCritico > 0 ? 'text-red-600' : 'text-gray-600'}>{apuracao.resumo.qtdCritico}</span>
                <span className="text-gray-300 mx-1">/</span>
                <span className={apuracao.resumo.qtdAlto > 0 ? 'text-amber-600' : 'text-gray-600'}>{apuracao.resumo.qtdAlto}</span>
              </p>
            </div>
            <div className={`card-surface p-4 ${apuracao.resumo.qtdTesNovas > 0 ? 'border border-teal/40' : ''}`}>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">TES novas</p>
              <p className={`text-2xl font-bold mt-1 ${apuracao.resumo.qtdTesNovas > 0 ? 'text-teal' : 'text-gray-800'}`}>
                {apuracao.resumo.qtdTesNovas}
              </p>
              {formatarTesNovas(apuracao.resumo.tesNovasEncontradas) && (
                <p className="text-[10px] text-gray-400 mt-1 truncate" title={formatarTesNovas(apuracao.resumo.tesNovasEncontradas) || ''}>
                  {formatarTesNovas(apuracao.resumo.tesNovasEncontradas)}
                </p>
              )}
            </div>
            <div className={`card-surface p-4 ${apuracao.resumo.qtdNotasSemChave > 0 ? 'border border-ruby/40' : ''}`}>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Notas sem chave</p>
              <p className={`text-2xl font-bold mt-1 ${apuracao.resumo.qtdNotasSemChave > 0 ? 'text-ruby' : 'text-gray-800'}`}>
                {apuracao.resumo.qtdNotasSemChave}
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
                  href={`/api/analise-fiscal/saida/apuracoes/${apuracao.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-accent text-accent rounded-lg px-3 py-1.5 text-sm font-medium"
                >
                  Exportar PDF
                </a>
                <a
                  href={`/api/analise-fiscal/saida/apuracoes/${apuracao.id}/excel`}
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
                placeholder="Buscar por TES, produto, cliente ou nota..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[220px]"
              />
            </div>

            <p className="text-xs text-gray-400 mb-2">
              Mostrando só os itens com divergência ({divergenciasFlat.length}) — o total de linhas importadas está no
              card acima. Pra ver todas as linhas (mesmo sem divergência), use "Exportar Excel".
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[1000px]">
                <thead>
                  <tr className="bg-brand text-white text-left">
                    <th className="px-3 py-2">Nota</th>
                    <th className="px-3 py-2">TES</th>
                    <th className="px-3 py-2">Produto</th>
                    <th className="px-3 py-2">Cliente</th>
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
                      <td className="px-3 py-1.5 max-w-[180px] truncate" title={d.item.cliente || ''}>{d.item.cliente}</td>
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
