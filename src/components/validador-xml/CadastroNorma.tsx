'use client';

import { useCallback, useEffect, useState } from 'react';
import { ScrollText, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import SeletorPdf from '@/components/legislacao/SeletorPdf';
import { extrairTextoPdf } from '@/lib/legislacao/extrairTextoPdf';
import { extrairNorma } from '@/lib/validador-xml/extrairNorma';
import type { NormaExtraida, RegraNorma } from '@/lib/validador-xml/tipos';

type NormaLista = {
  id: string;
  numero: string;
  versao: string;
  titulo: string | null;
  documentos: string;
  situacao: string;
  homologacaoEm: string | null;
  producaoEm: string | null;
  userName: string | null;
  createdAt: string;
  validacoes: number;
  resumo: { total: number; executaveis: number; catalogadas: number; futuras: number; removidas: number };
};

const dtBr = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

function Etiqueta({ r }: { r: RegraNorma }) {
  if (r.situacao === 'REMOVIDA') return <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">removida pela NT</span>;
  if (r.exec)
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">
        {r.situacao === 'FUTURA' ? 'conferida (futura)' : 'conferida automaticamente'}
      </span>
    );
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">só catalogada</span>;
}

// Regras da NT: o que foi reconhecido (e como o sistema vai conferir) e o
// que ficou só catalogado. Dá pra desligar qualquer regra.
export function TabelaRegras({ regras, onToggle }: { regras: RegraNorma[]; onToggle: (chave: string, habilitada: boolean) => void }) {
  const [aberta, setAberta] = useState<string | null>(null);
  return (
    <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
      {regras.map((r) => (
        <div key={r.chave} className={`px-3 py-2 ${r.habilitada ? '' : 'opacity-50'}`}>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="checkbox"
              checked={r.habilitada}
              disabled={r.situacao === 'REMOVIDA'}
              onChange={(e) => onToggle(r.chave, e.target.checked)}
              title="Conferir esta regra"
            />
            <code className="text-xs font-semibold text-gray-800">{r.chave}</code>
            <span className="text-[10px] text-gray-500">modelo {r.modelos.join('/') || '—'}</span>
            {r.rejeicao && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">rejeição {r.rejeicao}</span>}
            <Etiqueta r={r} />
            {r.producaoEm && r.situacao !== 'REMOVIDA' && <span className="text-[10px] text-gray-400">produção {dtBr(r.producaoEm)}</span>}
            <button onClick={() => setAberta(aberta === r.chave ? null : r.chave)} className="ml-auto text-gray-400 hover:text-brand" title="Ver texto da NT">
              {aberta === r.chave ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>
          {r.exec ? (
            <p className="text-xs text-gray-700 mt-1 ml-6">
              <strong>O sistema vai conferir:</strong> {r.descricaoExecutavel}
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-1 ml-6">{r.motivoNaoExecutavel ?? 'Regra não interpretada automaticamente.'} Aparecerá nos relatórios como &quot;não validável automaticamente&quot;.</p>
          )}
          {aberta === r.chave && (
            <div className="mt-2 ml-6 text-xs text-gray-600 bg-gray-50 rounded p-2 whitespace-pre-wrap">
              {r.texto}
              {r.observacoes.length > 0 && `\n\n${r.observacoes.join('\n')}`}
              {r.mensagem && `\n\nRejeição ${r.rejeicao}: ${r.mensagem}`}
              <span className="block text-[10px] text-gray-400 mt-1">Página {r.pagina} da Nota Técnica</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function CadastroNorma({ onCadastrada }: { onCadastrada: (id: string) => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [lendo, setLendo] = useState<string | null>(null);
  const [norma, setNorma] = useState<NormaExtraida | null>(null);
  const [paginas, setPaginas] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mostrarCampos, setMostrarCampos] = useState(false);

  const [normas, setNormas] = useState<NormaLista[]>([]);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [regrasExpandida, setRegrasExpandida] = useState<RegraNorma[]>([]);

  const carregar = useCallback(async () => {
    const res = await fetch('/api/validador-xml/normas');
    if (res.ok) setNormas((await res.json()).normas);
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function ler() {
    if (!arquivo) return;
    setErro(null);
    setNorma(null);
    try {
      const pags = await extrairTextoPdf(arquivo, (a, t) => setLendo(`Lendo a Nota Técnica… página ${a} de ${t}`));
      setPaginas(pags.length);
      const n = extrairNorma(pags);
      if (n.regras.length === 0 && n.campos.length === 0) throw new Error('Não encontrei regras de validação nem tabela de leiaute neste PDF. Ele é mesmo uma Nota Técnica de NF-e/NFC-e?');
      setNorma(n);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao ler o PDF.');
    } finally {
      setLendo(null);
    }
  }

  function alterarRegra(chave: string, habilitada: boolean) {
    setNorma((n) => (n ? { ...n, regras: n.regras.map((r) => (r.chave === chave ? { ...r, habilitada } : r)) } : n));
  }

  async function cadastrar(substituir = false) {
    if (!norma) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch('/api/validador-xml/normas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ norma, substituir, arquivoNome: arquivo?.name, paginas }),
      });
      const corpo = await res.json().catch(() => null);
      if (res.status === 409 && corpo?.existe) {
        if (confirm(`${corpo.error}\n\nSubstituir pelas regras desta leitura? (O histórico de validações é mantido.)`)) return cadastrar(true);
        return;
      }
      if (!res.ok) throw new Error(corpo?.error || `Falha ao cadastrar (${res.status}).`);
      setNorma(null);
      setArquivo(null);
      await carregar();
      onCadastrada(corpo.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao cadastrar.');
    } finally {
      setSalvando(false);
    }
  }

  async function abrir(id: string) {
    if (expandida === id) return setExpandida(null);
    const res = await fetch(`/api/validador-xml/normas/${id}`);
    if (!res.ok) return;
    setRegrasExpandida((await res.json()).norma.regras);
    setExpandida(id);
  }

  async function alternarRegraSalva(id: string, chave: string, habilitada: boolean) {
    setRegrasExpandida((rs) => rs.map((r) => (r.chave === chave ? { ...r, habilitada } : r)));
    await fetch(`/api/validador-xml/normas/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ habilitadas: { [chave]: habilitada } }) });
  }

  async function alternarNorma(n: NormaLista) {
    await fetch(`/api/validador-xml/normas/${n.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ situacao: n.situacao === 'ATIVA' ? 'INATIVA' : 'ATIVA' }) });
    carregar();
  }

  async function excluir(n: NormaLista) {
    if (!confirm(`Excluir ${n.numero} versão ${n.versao}? O histórico de validações dela é mantido.`)) return;
    await fetch(`/api/validador-xml/normas/${n.id}`, { method: 'DELETE' });
    if (expandida === n.id) setExpandida(null);
    carregar();
  }

  const exec = norma?.regras.filter((r) => r.exec && r.situacao !== 'REMOVIDA').length ?? 0;
  const catalogadas = norma?.regras.filter((r) => !r.exec && r.situacao !== 'REMOVIDA').length ?? 0;

  return (
    <div className="space-y-5">
      <div className="card-surface p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ScrollText className="text-brand" size={20} />
          <h2 className="font-display font-semibold text-gray-800">Cadastrar Nota Técnica</h2>
        </div>
        <p className="text-xs text-gray-500">
          Anexe o PDF da NT (ex: NT 2026.008). O sistema lê as tabelas de leiaute, as regras de validação (com os códigos de rejeição) e o cronograma de vigência — tudo direto
          do documento. Nada é inventado: o que não for possível interpretar fica &quot;só catalogado&quot; e aparece nos relatórios como não validável.
        </p>
        <SeletorPdf rotulo="PDF da Nota Técnica" arquivo={arquivo} onArquivo={(f) => { setArquivo(f); setNorma(null); }} desabilitado={!!lendo} />
        {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
        {!norma && (
          <button onClick={ler} disabled={!arquivo || !!lendo} className="bg-accent hover:bg-accent-dark text-white font-medium text-sm rounded-xl px-6 py-2.5 disabled:opacity-40">
            {lendo ?? 'Ler Nota Técnica'}
          </button>
        )}

        {norma && (
          <div className="space-y-4 border-t border-gray-100 pt-4">
            <div className="grid sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nota Técnica</label>
                <input value={norma.numero} onChange={(e) => setNorma({ ...norma, numero: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Versão</label>
                <input value={norma.versao} onChange={(e) => setNorma({ ...norma, versao: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Homologação a partir de</label>
                <input type="date" value={norma.homologacaoEm ?? ''} onChange={(e) => setNorma({ ...norma, homologacaoEm: e.target.value || null })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Produção a partir de</label>
                <input type="date" value={norma.producaoEm ?? ''} onChange={(e) => setNorma({ ...norma, producaoEm: e.target.value || null })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
              </div>
            </div>
            <p className="text-sm text-gray-800">
              <strong>{norma.titulo || 'Sem título identificado'}</strong> · {norma.documentos.join(' / ') || 'documento não identificado'} (modelo {norma.modelos.join('/') || '—'})
            </p>

            {norma.avisos.map((a) => (
              <p key={a} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{a}</p>
            ))}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="rounded-lg border border-green-100 bg-green-50 py-2"><p className="text-xl font-bold text-green-800">{exec}</p><p className="text-[10px] uppercase text-green-700">conferidas automaticamente</p></div>
              <div className="rounded-lg border border-amber-100 bg-amber-50 py-2"><p className="text-xl font-bold text-amber-800">{catalogadas}</p><p className="text-[10px] uppercase text-amber-700">só catalogadas</p></div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 py-2"><p className="text-xl font-bold text-gray-700">{norma.campos.length}</p><p className="text-[10px] uppercase text-gray-500">campos do leiaute</p></div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 py-2"><p className="text-xl font-bold text-gray-700">{norma.marcos.length}</p><p className="text-[10px] uppercase text-gray-500">marcos de cronograma</p></div>
            </div>

            {norma.marcos.length > 0 && (
              <div className="text-xs text-gray-600 space-y-1">
                <p className="font-medium text-gray-700">Cronograma lido da NT</p>
                {norma.marcos.map((m, i) => (
                  <p key={i} className="bg-gray-50 rounded px-2 py-1">
                    v{m.versao}: homologação {dtBr(m.homologacao)} · produção {dtBr(m.producao)}
                    {m.regrasIncluidas.length > 0 && ` · regras incluídas: ${m.regrasIncluidas.join(', ')}`}
                    {m.regrasAlteradas.length > 0 && ` · alteradas: ${m.regrasAlteradas.join(', ')}`}
                    {m.regrasRemovidas.length > 0 && ` · removidas: ${m.regrasRemovidas.join(', ')}`}
                  </p>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Regras de validação ({norma.regras.length}) — desmarque as que não quiser conferir</p>
              <TabelaRegras regras={norma.regras} onToggle={alterarRegra} />
            </div>

            {norma.campos.length > 0 && (
              <div>
                <button onClick={() => setMostrarCampos(!mostrarCampos)} className="text-xs text-brand underline">
                  {mostrarCampos ? 'Ocultar' : 'Ver'} campos do leiaute ({norma.campos.length}) — formato, tamanho e ocorrência são conferidos
                </button>
                {mostrarCampos && (
                  <div className="overflow-x-auto mt-2 border border-gray-100 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          {['#', 'ID', 'Tag', 'Descrição', 'Ele', 'Pai', 'Tipo', 'Ocor.', 'Tam.'].map((h) => (
                            <th key={h} className="text-left px-2 py-1.5">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {norma.campos.map((c) => (
                          <tr key={c.seq + c.id} className="border-t border-gray-50">
                            <td className="px-2 py-1">{c.seq}</td>
                            <td className="px-2 py-1">{c.id}</td>
                            <td className="px-2 py-1 font-mono">{c.tag}</td>
                            <td className="px-2 py-1 max-w-[280px]">{c.descricao}</td>
                            <td className="px-2 py-1">{c.ele}</td>
                            <td className="px-2 py-1">{c.pai ?? '—'}</td>
                            <td className="px-2 py-1">{c.tipo ?? '—'}</td>
                            <td className="px-2 py-1">{c.ocorMin}-{c.ocorMax ?? 'n'}</td>
                            <td className="px-2 py-1">{c.tamanho ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button onClick={() => cadastrar(false)} disabled={salvando || !norma.numero || !norma.versao} className="bg-accent hover:bg-accent-dark text-white font-medium text-sm rounded-xl px-6 py-2.5 disabled:opacity-40">
                {salvando ? 'Cadastrando…' : 'Cadastrar e ativar'}
              </button>
              <button onClick={() => setNorma(null)} className="text-sm text-gray-500 underline">Cancelar</button>
            </div>
          </div>
        )}
      </div>

      <div className="card-surface p-5">
        <h2 className="font-display font-semibold text-gray-800 mb-3">Notas Técnicas cadastradas</h2>
        {normas.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma ainda.</p>
        ) : (
          <div className="space-y-2">
            {normas.map((n) => (
              <div key={n.id} className="border border-gray-100 rounded-lg">
                <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <button onClick={() => abrir(n.id)} className="text-gray-400 hover:text-brand">{expandida === n.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800">
                      {n.numero} — versão {n.versao}
                      <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full ${n.situacao === 'ATIVA' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>{n.situacao === 'ATIVA' ? 'ativa' : 'inativa'}</span>
                    </p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {n.titulo} · {n.documentos} · produção {dtBr(n.producaoEm)} · {n.resumo.executaveis} conferidas / {n.resumo.catalogadas} catalogadas · {n.validacoes} validação(ões)
                    </p>
                  </div>
                  <button onClick={() => alternarNorma(n)} className="text-xs text-gray-500 underline">{n.situacao === 'ATIVA' ? 'Desativar' : 'Ativar'}</button>
                  <button onClick={() => excluir(n)} className="text-gray-400 hover:text-red-600" title="Excluir"><Trash2 size={16} /></button>
                </div>
                {expandida === n.id && (
                  <div className="px-3 pb-3">
                    <TabelaRegras regras={regrasExpandida} onToggle={(chave, h) => alternarRegraSalva(n.id, chave, h)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
