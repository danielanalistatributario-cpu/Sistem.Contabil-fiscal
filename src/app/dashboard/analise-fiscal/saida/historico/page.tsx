'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

type ApuracaoResumo = {
  id: string;
  periodo: string | null;
  fileName: string | null;
  status: string;
  totalLinhas: number;
  totalNotas: number;
  totalDivergencias: number;
  qtdCritico: number;
  qtdAlto: number;
  qtdMedio: number;
  qtdBaixo: number;
  qtdInformativo: number;
  qtdTesNovas: number;
  processedAt: string;
  empresaAnalisadaNome: string | null;
  empresaAnalisadaCnpj: string | null;
  empresaAnalisadaUf: string | null;
};

export default function HistoricoAnaliseFiscalSaidaPage() {
  const [apuracoes, setApuracoes] = useState<ApuracaoResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState('90');
  const [previa, setPrevia] = useState<{ total: number; totalLinhas: number } | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [limpando, setLimpando] = useState(false);
  const [erroLimpeza, setErroLimpeza] = useState<string | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [excluindoSelecionadas, setExcluindoSelecionadas] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/analise-fiscal/saida/apuracoes');
    if (res.ok) {
      const data = await res.json();
      setApuracoes(data.apuracoes);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta análise de Saídas? Esta ação não pode ser desfeita.')) return;
    await fetch(`/api/analise-fiscal/saida/apuracoes/${id}`, { method: 'DELETE' });
    carregar();
  }

  function toggleSelecionada(id: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelecionarTodas() {
    setSelecionadas((prev) => (prev.size === apuracoes.length ? new Set() : new Set(apuracoes.map((a) => a.id))));
  }

  async function handleExcluirSelecionadas() {
    if (selecionadas.size === 0) return;
    if (!confirm(`Excluir ${selecionadas.size} apuração(ões) selecionada(s)? Esta ação não pode ser desfeita.`)) return;
    setExcluindoSelecionadas(true);
    try {
      await fetch('/api/analise-fiscal/saida/apuracoes/excluir-selecionadas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selecionadas) }),
      });
      setSelecionadas(new Set());
      carregar();
    } finally {
      setExcluindoSelecionadas(false);
    }
  }

  async function handleConsultarAntigas() {
    setConsultando(true);
    setErroLimpeza(null);
    setPrevia(null);
    try {
      const res = await fetch(`/api/analise-fiscal/saida/apuracoes/limpar-antigas?dias=${dias}`);
      const data = await res.json();
      if (!res.ok) {
        setErroLimpeza(data.error || 'Falha ao consultar.');
        return;
      }
      setPrevia(data);
    } finally {
      setConsultando(false);
    }
  }

  async function handleLimparAntigas() {
    if (!previa) return;
    if (previa.total === 0) return;
    if (!confirm(`Excluir ${previa.total} apuração(ões) com mais de ${dias} dia(s) (${previa.totalLinhas.toLocaleString('pt-BR')} linha(s) ao todo)? Esta ação não pode ser desfeita.`)) return;
    setLimpando(true);
    setErroLimpeza(null);
    try {
      const res = await fetch(`/api/analise-fiscal/saida/apuracoes/limpar-antigas?dias=${dias}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setErroLimpeza(data.error || 'Falha ao excluir.');
        return;
      }
      setPrevia(null);
      carregar();
    } finally {
      setLimpando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/analise-fiscal/saida" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors mb-2 w-fit">
          <ArrowLeft size={15} />
          Análise de Saídas
        </Link>
        <h1 className="text-2xl font-display font-semibold text-brand">Histórico — Análise de Saídas</h1>
        <p className="text-gray-500 text-sm mt-1">Consulte análises do Relatório de Saídas realizadas anteriormente.</p>
      </div>

      <div className="card-surface p-5 border border-accent/30">
        <h2 className="font-semibold text-brand text-sm">Limpar apurações antigas</h2>
        <p className="text-xs text-gray-500 mt-1 max-w-xl">
          Apurações antigas ocupam espaço no banco de dados. Escolha um número de dias, consulte quantas apurações
          seriam afetadas e, se quiser, exclua todas de uma vez.
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <label className="text-xs text-gray-500">Excluir apurações com mais de</label>
          <input
            type="number"
            min={1}
            value={dias}
            onChange={(e) => { setDias(e.target.value); setPrevia(null); }}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-20"
          />
          <label className="text-xs text-gray-500">dia(s)</label>
          <button
            onClick={handleConsultarAntigas}
            disabled={consultando}
            className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 disabled:opacity-50"
          >
            {consultando ? 'Consultando...' : 'Consultar'}
          </button>
          {previa && (
            <>
              <span className="text-xs text-gray-600">
                {previa.total === 0
                  ? 'Nenhuma apuração encontrada nesse período.'
                  : `${previa.total} apuração(ões) · ${previa.totalLinhas.toLocaleString('pt-BR')} linha(s) ao todo`}
              </span>
              {previa.total > 0 && (
                <button
                  onClick={handleLimparAntigas}
                  disabled={limpando}
                  className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5 disabled:opacity-50"
                >
                  {limpando ? 'Excluindo...' : `Excluir ${previa.total} apuração(ões)`}
                </button>
              )}
            </>
          )}
        </div>
        {erroLimpeza && <p className="text-xs text-red-600 mt-2">{erroLimpeza}</p>}
      </div>

      <div className="card-surface p-5">
        {loading && <p className="text-sm text-gray-400">Carregando...</p>}
        {!loading && apuracoes.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <p className="text-2xl mb-2">🗂</p>
            <p className="text-sm">
              Nenhuma análise salva ainda. Processe um relatório em{' '}
              <Link href="/dashboard/analise-fiscal/saida" className="text-brand underline">Análise de Saídas</Link>.
            </p>
          </div>
        )}
        {apuracoes.length > 0 && (
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100">
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={selecionadas.size === apuracoes.length}
                onChange={toggleSelecionarTodas}
              />
              Selecionar todas
            </label>
            {selecionadas.size > 0 && (
              <button
                onClick={handleExcluirSelecionadas}
                disabled={excluindoSelecionadas}
                className="text-xs bg-red-600 text-white rounded-lg px-3 py-1.5 disabled:opacity-50"
              >
                {excluindoSelecionadas ? 'Excluindo...' : `Excluir ${selecionadas.size} selecionada(s)`}
              </button>
            )}
          </div>
        )}
        <div className="space-y-3">
          {apuracoes.map((a) => (
            <div key={a.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3">
              <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selecionadas.has(a.id)}
                onChange={() => toggleSelecionada(a.id)}
              />
              <div>
                <h4 className="font-medium text-sm text-gray-800">
                  {a.periodo || a.fileName || 'Sem período informado'}
                  {a.empresaAnalisadaNome && (
                    <span className="ml-2 text-[10px] bg-brand/10 text-brand rounded-full px-2 py-0.5">
                      {a.empresaAnalisadaNome} ({a.empresaAnalisadaUf})
                    </span>
                  )}
                  {a.status === 'PROCESSANDO' && (
                    <span className="ml-2 text-[10px] bg-gray-200 text-gray-600 rounded-full px-2 py-0.5">
                      Incompleta — processamento não terminou
                    </span>
                  )}
                  {a.status === 'CONCLUIDA' && a.qtdCritico > 0 && (
                    <span className="ml-2 text-[10px] bg-red-100 text-red-700 rounded-full px-2 py-0.5">
                      {a.qtdCritico} crítica(s)
                    </span>
                  )}
                  {a.status === 'CONCLUIDA' && a.qtdTesNovas > 0 && (
                    <span className="ml-2 text-[10px] bg-teal/10 text-teal rounded-full px-2 py-0.5">
                      {a.qtdTesNovas} TES nova(s)
                    </span>
                  )}
                </h4>
                <p className="text-xs text-gray-400 font-mono mt-1">
                  {new Date(a.processedAt).toLocaleString('pt-BR')} · {a.totalLinhas.toLocaleString('pt-BR')} linha(s) ·{' '}
                  {a.totalNotas.toLocaleString('pt-BR')} nota(s) · {a.totalDivergencias} divergência(s) ({a.qtdCritico} crít. ·{' '}
                  {a.qtdAlto} alta · {a.qtdMedio} média · {a.qtdBaixo} baixa)
                </p>
              </div>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/dashboard/analise-fiscal/saida?apuracaoId=${a.id}`}
                  className="text-xs border border-gray-300 rounded-lg px-3 py-1.5"
                >
                  Abrir
                </Link>
                <button onClick={() => handleDelete(a.id)} className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5">
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
