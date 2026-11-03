'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, Trash2, Download } from 'lucide-react';
import ResultadoXml from './ResultadoXml';
import { exportarValidacoesExcel } from '@/lib/validador-xml/exportarExcel';
import type { Ocorrencia, ResultadoValidacao } from '@/lib/validador-xml/tipos';

type Linha = {
  id: string;
  normaRotulo: string;
  arquivoNome: string;
  chave: string | null;
  numeroNf: string | null;
  modelo: string | null;
  dataEmissao: string | null;
  emitenteDoc: string | null;
  emitenteNome: string | null;
  destinatarioDoc: string | null;
  destinatarioNome: string | null;
  veredito: string;
  conformidade: number | null;
  qtdConformes: number;
  qtdAlertas: number;
  qtdDivergencias: number;
  qtdAusentes: number;
  qtdIndevidos: number;
  qtdNaoValidaveis: number;
  ignorouVigencia: boolean;
  userName: string | null;
  createdAt: string;
};

const ROTULO: Record<string, string> = { CONFORME: 'De acordo', DIVERGENTE: 'Com divergências', SEM_REGRAS_APLICAVEIS: 'Sem regras aplicáveis', ERRO: 'Erro' };
const COR: Record<string, string> = { CONFORME: 'bg-green-100 text-green-700', DIVERGENTE: 'bg-red-100 text-red-700', SEM_REGRAS_APLICAVEIS: 'bg-gray-100 text-gray-600', ERRO: 'bg-red-100 text-red-700' };
const fmtDoc = (d: string | null) => (d ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : '—');

type Detalhe = { linha: Linha; resultado: ResultadoValidacao };

export default function HistoricoValidacoes() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [veredito, setVeredito] = useState('');
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);

  const carregar = useCallback(async (q: string, v: string) => {
    setCarregando(true);
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (v) p.set('veredito', v);
    const res = await fetch(`/api/validador-xml/historico?${p}`);
    if (res.ok) setLinhas((await res.json()).validacoes);
    setCarregando(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => carregar(busca, veredito), busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [busca, veredito, carregar]);

  async function abrir(l: Linha) {
    if (detalhe?.linha.id === l.id) return setDetalhe(null);
    const res = await fetch(`/api/validador-xml/historico/${l.id}`);
    if (!res.ok) return;
    const v = (await res.json()).validacao;
    const resultado: ResultadoValidacao = {
      arquivo: v.arquivoNome,
      erro: v.erro,
      chave: v.chave,
      numero: v.numeroNf,
      serie: v.serie,
      modelo: v.modelo,
      emissao: v.dataEmissao,
      tpAmb: v.tpAmb,
      emitente: { doc: v.emitenteDoc, nome: v.emitenteNome },
      destinatario: { doc: v.destinatarioDoc, nome: v.destinatarioNome },
      contagens: { conformes: v.qtdConformes, alertas: v.qtdAlertas, divergencias: v.qtdDivergencias, ausentes: v.qtdAusentes, indevidos: v.qtdIndevidos, naoValidaveis: v.qtdNaoValidaveis, regrasNaoAplicaveis: 0 },
      conformidade: v.conformidade,
      veredito: v.veredito,
      ocorrencias: v.ocorrencias as Ocorrencia[],
      regras: v.regras ?? [],
    };
    setDetalhe({ linha: l, resultado });
  }

  async function excluir(l: Linha) {
    if (!confirm(`Excluir a validação de "${l.arquivoNome}" do histórico?`)) return;
    await fetch(`/api/validador-xml/historico/${l.id}`, { method: 'DELETE' });
    if (detalhe?.linha.id === l.id) setDetalhe(null);
    carregar(busca, veredito);
  }

  return (
    <div className="card-surface p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h2 className="font-display font-semibold text-gray-800">Histórico de validações</h2>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Chave, nº da NF, CNPJ, nome, arquivo…"
              className="border border-gray-300 rounded-lg pl-9 pr-3 py-1.5 text-sm w-72"
            />
          </div>
          <select value={veredito} onChange={(e) => setVeredito(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">Todos os resultados</option>
            <option value="CONFORME">De acordo</option>
            <option value="DIVERGENTE">Com divergências</option>
            <option value="ERRO">Erro</option>
          </select>
        </div>
      </div>

      {carregando ? (
        <p className="text-sm text-gray-400">Carregando…</p>
      ) : linhas.length === 0 ? (
        <p className="text-sm text-gray-400">Nenhuma validação encontrada.</p>
      ) : (
        <div className="overflow-x-auto border border-gray-100 rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Data</th>
                <th className="text-left px-3 py-2">Usuário</th>
                <th className="text-left px-3 py-2">Nota Técnica</th>
                <th className="text-left px-3 py-2">NF / chave</th>
                <th className="text-left px-3 py-2">Emitente</th>
                <th className="text-left px-3 py-2">Destinatário</th>
                <th className="text-left px-3 py-2">Resultado</th>
                <th className="text-right px-3 py-2">Conf.</th>
                <th className="text-right px-3 py-2" title="Divergências + ausentes + indevidos">Erros</th>
                <th className="text-right px-3 py-2">Alertas</th>
                <th className="text-right px-3 py-2">Conformes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} onClick={() => abrir(l)} className={`border-t border-gray-50 cursor-pointer hover:bg-gray-50 ${detalhe?.linha.id === l.id ? 'bg-brand/[0.04]' : ''}`}>
                  <td className="px-3 py-1.5 whitespace-nowrap">{new Date(l.createdAt).toLocaleString('pt-BR')}</td>
                  <td className="px-3 py-1.5">{l.userName ?? '—'}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{l.normaRotulo}{l.ignorouVigencia ? ' *' : ''}</td>
                  <td className="px-3 py-1.5">
                    <span className="font-medium">{l.numeroNf ?? '—'}</span>
                    <span className="block text-[10px] text-gray-400 font-mono">{l.chave ?? l.arquivoNome}</span>
                  </td>
                  <td className="px-3 py-1.5">{fmtDoc(l.emitenteDoc)}</td>
                  <td className="px-3 py-1.5">{fmtDoc(l.destinatarioDoc)}</td>
                  <td className="px-3 py-1.5"><span className={`text-[10px] px-2 py-0.5 rounded-full ${COR[l.veredito]}`}>{ROTULO[l.veredito]}</span></td>
                  <td className="px-3 py-1.5 text-right">{l.conformidade === null ? '—' : `${l.conformidade}%`}</td>
                  <td className="px-3 py-1.5 text-right">{l.qtdDivergencias + l.qtdAusentes + l.qtdIndevidos}</td>
                  <td className="px-3 py-1.5 text-right">{l.qtdAlertas}</td>
                  <td className="px-3 py-1.5 text-right">{l.qtdConformes}</td>
                  <td className="px-2 py-1.5">
                    <button onClick={(e) => { e.stopPropagation(); excluir(l); }} className="text-gray-300 hover:text-red-600" title="Excluir"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-gray-400 px-3 py-1.5">* conferida como se a NT já estivesse em vigor. Clique numa linha para ver o detalhe (até 300 ocorrências por validação ficam guardadas).</p>
        </div>
      )}

      {detalhe && (
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-gray-800">{detalhe.resultado.arquivo}</p>
            <button
              onClick={() => exportarValidacoesExcel([detalhe.resultado], detalhe.linha.normaRotulo)}
              className="inline-flex items-center gap-1.5 text-sm border border-brand text-brand hover:bg-brand/5 rounded-lg px-3 py-1.5"
            >
              <Download size={15} /> Exportar Excel
            </button>
          </div>
          <ResultadoXml r={detalhe.resultado} normaRotulo={detalhe.linha.normaRotulo} ignorouVigencia={detalhe.linha.ignorouVigencia} />
        </div>
      )}
    </div>
  );
}
