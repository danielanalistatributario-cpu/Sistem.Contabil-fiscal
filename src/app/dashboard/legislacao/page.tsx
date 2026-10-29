'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GitCompareArrows, Search, ScanText, FileText, Trash2 } from 'lucide-react';
import { ImportHero } from '@/components/ImportHero';
import SeletorPdf from '@/components/legislacao/SeletorPdf';
import ProgressoAnalise from '@/components/legislacao/ProgressoAnalise';
import AvisoIaNaoConfigurada, { useIaConfigurada } from '@/components/legislacao/AvisoIaNaoConfigurada';
import { anexarDocumento, enviarAnalise, LIMITE_UPLOAD_PDF, type EtapaEnvio } from '@/lib/legislacao/cliente';
import { ROTULO_STATUS, STATUS_ANALISE, COR_STATUS, type StatusAnalise } from '@/lib/legislacao/tipos';
import { fmtData } from '@/lib/legislacao/formatar';

type AnaliseResumo = {
  id: string;
  modo: string;
  nomeArquivo: string;
  nomeArquivoB: string | null;
  tipoDocumento: string | null;
  numero: string | null;
  dataDocumento: string | null;
  orgao: string | null;
  titulo: string;
  resumo: string | null;
  status: StatusAnalise;
  userName: string | null;
  createdAt: string;
};

export default function LegislacaoPage() {
  const router = useRouter();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [etapa, setEtapa] = useState<EtapaEnvio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const iaConfigurada = useIaConfigurada();

  const [analises, setAnalises] = useState<AnaliseResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');

  const carregar = useCallback(async (q: string, status: string) => {
    setCarregando(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    const res = await fetch(`/api/legislacao/analises?${params}`);
    if (res.ok) setAnalises((await res.json()).analises);
    setCarregando(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => carregar(busca, filtroStatus), busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [busca, filtroStatus, carregar]);

  async function analisar() {
    if (!arquivo) return;
    setErro(null);
    try {
      const form = new FormData();
      await anexarDocumento(form, arquivo, '', LIMITE_UPLOAD_PDF, setEtapa);
      const id = await enviarAnalise('/api/legislacao/analisar', form, setEtapa);
      router.push(`/dashboard/legislacao/${id}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha na análise.');
      setEtapa(null);
    }
  }

  async function excluir(a: AnaliseResumo) {
    if (!confirm(`Excluir a análise "${a.titulo}"? Esta ação não pode ser desfeita.`)) return;
    await fetch(`/api/legislacao/analises/${a.id}`, { method: 'DELETE' });
    carregar(busca, filtroStatus);
  }

  const processando = etapa !== null;

  return (
    <div className="space-y-6 max-w-6xl">
      <ImportHero
        eyebrow="Inteligência tributária"
        titleParts={['Analisador de', { text: 'Legislação', accent: true }, 'Fiscal e Tributária']}
        description="Envie uma Lei, IN, Ajuste SINIEF, Nota Técnica, Convênio ou Ato COTEPE em PDF e receba análise técnica, resumo executivo, prazos, checklist de adequação, base legal com página e um comunicado visual pronto para a gestão."
        badges={['Resumo executivo', 'Linha do tempo', 'Checklist', 'Base legal rastreável', 'Comunicado visual']}
      />

      <div className="grid md:grid-cols-3 gap-5">
        <div className="card-surface p-5 md:col-span-2 space-y-4">
          <div className="flex items-center gap-2">
            <ScanText className="text-brand" size={20} />
            <h2 className="font-display font-semibold text-gray-800">Nova análise</h2>
          </div>
          {iaConfigurada === false && <AvisoIaNaoConfigurada />}
          <SeletorPdf rotulo="PDF da legislação" arquivo={arquivo} onArquivo={setArquivo} desabilitado={processando || iaConfigurada === false} />
          {arquivo && arquivo.size > LIMITE_UPLOAD_PDF && !processando && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              PDF acima de 4 MB: o texto será extraído aqui no navegador e enviado página a página. Tabelas e imagens podem perder parte da estrutura — a análise indica isso em &quot;Limitações&quot;.
            </p>
          )}
          <ProgressoAnalise etapa={etapa} />
          {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
          <button
            onClick={analisar}
            disabled={!arquivo || processando || iaConfigurada === false}
            className="w-full sm:w-auto bg-accent hover:bg-accent-dark disabled:opacity-40 text-white font-medium text-sm rounded-xl px-6 py-2.5 transition-colors"
          >
            {processando ? 'Analisando…' : 'Analisar documento'}
          </button>
        </div>

        <Link href="/dashboard/legislacao/comparar" className="card-surface p-5 hover:shadow-card-hover transition-shadow group flex flex-col">
          <div className="flex items-center gap-2">
            <GitCompareArrows className="text-teal" size={20} />
            <h2 className="font-display font-semibold text-gray-800">Comparar documentos</h2>
          </div>
          <p className="text-sm text-gray-500 mt-3 flex-1">
            Duas versões de uma NT (ex: v1.50 × v1.51) ou duas normas diferentes: veja o que foi incluído, excluído e alterado, novos prazos, novas obrigações e impactos no ERP.
          </p>
          <span className="text-sm text-brand font-medium mt-4 group-hover:underline">Comparar →</span>
        </Link>
      </div>

      <div className="card-surface p-5">
        <div className="flex flex-wrap items-center gap-3 justify-between mb-4">
          <h2 className="font-display font-semibold text-gray-800">Histórico de análises</h2>
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Pesquisar nome, número, órgão, assunto…"
                className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg w-72 max-w-full"
              />
            </div>
            <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2">
              <option value="">Todos os status</option>
              {STATUS_ANALISE.map((s) => (
                <option key={s} value={s}>
                  {ROTULO_STATUS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {carregando && <p className="text-sm text-gray-400">Carregando…</p>}
        {!carregando && analises.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <FileText className="mx-auto mb-2" size={28} />
            <p className="text-sm">{busca || filtroStatus ? 'Nenhuma análise encontrada para essa pesquisa.' : 'Nenhum documento analisado ainda.'}</p>
          </div>
        )}
        {!carregando && analises.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="py-2 pr-3 font-medium">Documento</th>
                  <th className="py-2 pr-3 font-medium">Tipo</th>
                  <th className="py-2 pr-3 font-medium">Número</th>
                  <th className="py-2 pr-3 font-medium">Data</th>
                  <th className="py-2 pr-3 font-medium">Analisado em</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {analises.map((a) => (
                  <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/60 align-top">
                    <td className="py-3 pr-3 max-w-md">
                      <Link href={`/dashboard/legislacao/${a.id}`} className="font-medium text-gray-800 hover:text-brand">
                        {a.titulo}
                      </Link>
                      {a.resumo && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.resumo}</p>}
                      <p className="text-[11px] text-gray-400 font-mono mt-0.5 truncate">
                        {a.nomeArquivo}
                        {a.nomeArquivoB ? ` × ${a.nomeArquivoB}` : ''}
                      </p>
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      {a.modo === 'COMPARACAO' ? <span className="text-teal font-medium">Comparação</span> : a.tipoDocumento || '—'}
                      {a.orgao && <p className="text-[11px] text-gray-400">{a.orgao}</p>}
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap font-mono text-xs">{a.numero || '—'}</td>
                    <td className="py-3 pr-3 whitespace-nowrap">{fmtData(a.dataDocumento) || '—'}</td>
                    <td className="py-3 pr-3 whitespace-nowrap text-xs text-gray-500">
                      {new Date(a.createdAt).toLocaleDateString('pt-BR')}
                      {a.userName && <p className="text-[11px] text-gray-400">{a.userName}</p>}
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <span className={`text-[11px] rounded-full px-2 py-0.5 ${COR_STATUS[a.status] ?? ''}`}>{ROTULO_STATUS[a.status] ?? a.status}</span>
                    </td>
                    <td className="py-3 whitespace-nowrap text-right">
                      <Link href={`/dashboard/legislacao/${a.id}`} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 mr-2">
                        Abrir
                      </Link>
                      <Link href={`/dashboard/legislacao/${a.id}?aba=comunicado`} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 mr-2">
                        Comunicado
                      </Link>
                      <button onClick={() => excluir(a)} className="text-gray-400 hover:text-red-600 align-middle" title="Excluir">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
