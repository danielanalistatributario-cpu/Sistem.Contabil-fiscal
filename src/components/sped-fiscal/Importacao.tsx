'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileUp, X, Trash2, FolderOpen, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { ArquivoEfd, ResumoMensal } from '@/lib/efd-icms/tipos';
import type { ConjuntoValidado } from '@/lib/efd-icms/consolidar';
import { brl, fmtCnpj, rotuloMes } from '@/lib/efd-icms/rotulos';

export const MAX_ARQUIVOS = 12;

type GrupoSalvo = {
  cnpj: string;
  ie: string;
  empresaNome: string;
  uf: string | null;
  ano: string;
  meses: { id: string; ym: string; codFin: string | null; nomeArquivo: string; updatedAt: string; userName: string | null }[];
};

const COR_NIVEL = { erro: 'text-red-700 bg-red-50 border-red-200', aviso: 'text-amber-800 bg-amber-50 border-amber-200', info: 'text-sky-800 bg-sky-50 border-sky-200' } as const;

export function ListaAlertas({ alertas }: { alertas: { nivel: 'erro' | 'aviso' | 'info'; mensagem: string }[] }) {
  if (alertas.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {alertas.map((a, i) => (
        <p key={i} className={`text-xs border rounded-lg px-3 py-2 flex gap-2 ${COR_NIVEL[a.nivel]}`}>
          {a.nivel === 'info' ? <Info size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
          <span>{a.mensagem}</span>
        </p>
      ))}
    </div>
  );
}

export default function Importacao({
  arquivos,
  conjunto,
  lendo,
  erro,
  onAdicionar,
  onRemover,
  onProcessar,
  onAbrirSalvo,
}: {
  arquivos: ArquivoEfd[];
  conjunto: ConjuntoValidado;
  lendo: string | null;
  erro: string | null;
  onAdicionar: (files: File[]) => void;
  onRemover: (a: ArquivoEfd) => void;
  onProcessar: () => void;
  onAbrirSalvo: (resumos: ResumoMensal[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [salvos, setSalvos] = useState<GrupoSalvo[]>([]);
  const [abrindo, setAbrindo] = useState<string | null>(null);

  const carregarSalvos = useCallback(async () => {
    const res = await fetch('/api/sped-fiscal-relatorios/resumos');
    if (res.ok) setSalvos((await res.json()).grupos);
  }, []);
  useEffect(() => {
    carregarSalvos();
  }, [carregarSalvos]);

  async function abrir(g: GrupoSalvo) {
    setAbrindo(`${g.cnpj}${g.ano}`);
    const res = await fetch(`/api/sped-fiscal-relatorios/resumos?cnpj=${g.cnpj}&ie=${g.ie}&ano=${g.ano}`);
    setAbrindo(null);
    if (res.ok) onAbrirSalvo((await res.json()).resumos);
  }
  async function excluir(g: GrupoSalvo) {
    if (!confirm(`Excluir do histórico os resumos de ${g.empresaNome} — ${g.ano} (${g.meses.length} mês(es))? Os arquivos SPED não são afetados.`)) return;
    await fetch(`/api/sped-fiscal-relatorios/resumos?cnpj=${g.cnpj}&ie=${g.ie}&ano=${g.ano}`, { method: 'DELETE' });
    carregarSalvos();
  }

  const statusDe = (a: ArquivoEfd) => conjunto.descartados.find((d) => d.arquivo === a);

  return (
    <div className="space-y-5">
      <div className="card-surface p-5 space-y-4">
        <h2 className="font-display font-semibold text-gray-800">Importar arquivos SPED Fiscal (EFD ICMS/IPI)</h2>
        <p className="text-xs text-gray-500">
          Um arquivo = análise do mês. Até {MAX_ARQUIVOS} arquivos (janeiro a dezembro) = análise anual consolidada. O período, a empresa, o CNPJ e a inscrição estadual são lidos do próprio
          arquivo. Os arquivos são lidos aqui no navegador e <strong>não são enviados nem guardados</strong>.
        </p>
        <div
          onClick={() => !lendo && input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            onAdicionar(Array.from(e.dataTransfer.files));
          }}
          className={`cursor-pointer border-2 border-dashed rounded-xl px-6 py-8 text-center transition-colors ${arrastando ? 'border-accent bg-accent/5' : 'border-gray-200 hover:border-brand/40'}`}
        >
          <FileUp className="mx-auto text-brand/70" size={30} />
          <p className="text-sm font-medium text-gray-700 mt-2">{lendo ?? 'Arraste os arquivos .txt do SPED Fiscal aqui'}</p>
          <p className="text-xs text-gray-400 mt-1">ou clique para escolher (você pode selecionar vários de uma vez)</p>
          <input
            ref={input}
            type="file"
            accept=".txt,text/plain"
            multiple
            className="hidden"
            onChange={(e) => {
              onAdicionar(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
        </div>
        {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}

        {arquivos.length > 0 && (
          <>
            <div className="overflow-x-auto border border-gray-100 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-3 py-2">Período</th>
                    <th className="text-left px-3 py-2">Empresa</th>
                    <th className="text-left px-3 py-2">CNPJ</th>
                    <th className="text-left px-3 py-2">IE</th>
                    <th className="text-left px-3 py-2">Versão / finalidade</th>
                    <th className="text-right px-3 py-2">Docs entrada</th>
                    <th className="text-right px-3 py-2">Docs saída</th>
                    <th className="text-left px-3 py-2">Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...arquivos]
                    .sort((a, b) => a.ym.localeCompare(b.ym))
                    .map((a) => {
                      const d = statusDe(a);
                      const ent = a.docs.filter((x) => x.oper === 'E').length;
                      const sai = a.docs.length - ent;
                      const erroArq = a.alertas.find((x) => x.nivel === 'erro');
                      return (
                        <tr key={a.nomeArquivo + a.tamanho} className={`border-t border-gray-50 ${d || erroArq ? 'bg-red-50/40' : ''}`}>
                          <td className="px-3 py-1.5 whitespace-nowrap font-medium">{a.ym ? rotuloMes(a.ym) : '—'}</td>
                          <td className="px-3 py-1.5 max-w-[220px] truncate" title={a.cabecalho.nome}>{a.cabecalho.nome || '—'}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">{fmtCnpj(a.cabecalho.cnpj)}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">{a.cabecalho.ie}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            {a.cabecalho.codVer} · {a.cabecalho.codFin === '1' ? 'substituto' : 'original'}
                          </td>
                          <td className="px-3 py-1.5 text-right">{ent}</td>
                          <td className="px-3 py-1.5 text-right">{sai}</td>
                          <td className="px-3 py-1.5">
                            {d || erroArq ? (
                              <span className="text-red-700 inline-flex items-start gap-1" title={d?.motivo ?? erroArq?.mensagem}>
                                <AlertTriangle size={13} className="mt-0.5 shrink-0" /> Não usado — {d?.motivo ?? erroArq?.mensagem}
                              </span>
                            ) : (
                              <span className="text-green-700 inline-flex items-center gap-1">
                                <CheckCircle2 size={13} /> Usado
                                {a.alertas.filter((x) => x.nivel === 'aviso').length > 0 && <span className="text-amber-700"> · {a.alertas.filter((x) => x.nivel === 'aviso').length} aviso(s)</span>}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <button onClick={() => onRemover(a)} className="text-gray-300 hover:text-red-600" title="Remover">
                              <X size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            <ListaAlertas alertas={[...conjunto.alertas, ...arquivos.flatMap((a) => a.alertas.filter((x) => x.nivel !== 'erro').map((x) => ({ ...x, mensagem: `${a.ym ? rotuloMes(a.ym) : a.nomeArquivo}: ${x.mensagem}` })))]} />

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={onProcessar}
                disabled={conjunto.usados.length === 0 || !!lendo}
                className="bg-accent hover:bg-accent-dark text-white font-medium text-sm rounded-xl px-6 py-2.5 disabled:opacity-40 transition-colors"
              >
                Gerar relatórios ({conjunto.usados.length} arquivo{conjunto.usados.length === 1 ? '' : 's'} — {conjunto.usados.length === 1 ? 'análise mensal' : 'análise anual'})
              </button>
              <span className="text-xs text-gray-400">
                {conjunto.empresa ? `${conjunto.empresa.nome} — CNPJ ${fmtCnpj(conjunto.empresa.cnpj)} — exercício ${conjunto.ano}` : ''}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="card-surface p-5">
        <h2 className="font-display font-semibold text-gray-800 mb-1">Análises salvas</h2>
        <p className="text-xs text-gray-500 mb-3">
          Guardamos só o <strong>resumo mensal</strong> (apuração, totais por CST/CFOP e conferências — poucos KB), para reabrir sem reimportar. A lista nota a nota exige reimportar o arquivo.
        </p>
        {salvos.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum resumo salvo ainda.</p>
        ) : (
          <div className="space-y-2">
            {salvos.map((g) => (
              <div key={g.cnpj + g.ie + g.ano} className="flex flex-wrap items-center gap-3 border border-gray-100 rounded-lg px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800">
                    {g.empresaNome} <span className="text-gray-400 font-normal">· {fmtCnpj(g.cnpj)} · IE {g.ie}</span>
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Exercício {g.ano} — {g.meses.length} mês(es): {g.meses.map((m) => rotuloMes(m.ym).slice(0, 3)).join(', ')} · salvo em {new Date(g.meses[g.meses.length - 1].updatedAt).toLocaleDateString('pt-BR')}
                    {g.meses[0].userName ? ` por ${g.meses[0].userName}` : ''}
                  </p>
                </div>
                <button onClick={() => abrir(g)} disabled={abrindo === `${g.cnpj}${g.ano}`} className="inline-flex items-center gap-1.5 text-sm border border-brand text-brand hover:bg-brand/5 rounded-lg px-3 py-1.5">
                  <FolderOpen size={15} /> {abrindo === `${g.cnpj}${g.ano}` ? 'Abrindo…' : 'Abrir'}
                </button>
                <button onClick={() => excluir(g)} className="text-gray-300 hover:text-red-600" title="Excluir do histórico">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export { brl };
