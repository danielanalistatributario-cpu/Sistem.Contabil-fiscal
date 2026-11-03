'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileCode2, FileUp, X, Download } from 'lucide-react';
import ResultadoXml from './ResultadoXml';
import { exportarValidacoesExcel } from '@/lib/validador-xml/exportarExcel';
import type { ResultadoValidacao } from '@/lib/validador-xml/tipos';

type NormaLista = { id: string; numero: string; versao: string; situacao: string; producaoEm: string | null; homologacaoEm: string | null; resumo: { executaveis: number; catalogadas: number } };
type Resultado = ResultadoValidacao & { id: string };

const LOTE_MAX_CARACTERES = 3_200_000;
const LOTE_MAX_ARQUIVOS = 40;

const COR_VEREDITO: Record<string, string> = {
  CONFORME: 'bg-green-100 text-green-700',
  DIVERGENTE: 'bg-red-100 text-red-700',
  SEM_REGRAS_APLICAVEIS: 'bg-gray-100 text-gray-600',
  ERRO: 'bg-red-100 text-red-700',
};
const ROTULO_VEREDITO: Record<string, string> = {
  CONFORME: 'De acordo',
  DIVERGENTE: 'Com divergências',
  SEM_REGRAS_APLICAVEIS: 'Sem regras aplicáveis',
  ERRO: 'Erro',
};

export default function ValidarXml({ normaInicial }: { normaInicial?: string | null }) {
  const [normas, setNormas] = useState<NormaLista[]>([]);
  const [normaId, setNormaId] = useState(normaInicial ?? '');
  const [ignorarVigencia, setIgnorarVigencia] = useState(false);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [validando, setValidando] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [rotulo, setRotulo] = useState('');
  const [rotuloIgnorou, setRotuloIgnorou] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const carregarNormas = useCallback(async () => {
    const res = await fetch('/api/validador-xml/normas');
    if (!res.ok) return;
    const lista: NormaLista[] = (await res.json()).normas.filter((n: NormaLista) => n.situacao === 'ATIVA');
    setNormas(lista);
    setNormaId((atual) => (atual && lista.some((n) => n.id === atual) ? atual : lista[0]?.id ?? ''));
  }, []);
  useEffect(() => {
    carregarNormas();
  }, [carregarNormas]);

  function adicionar(lista: FileList | File[] | null) {
    if (!lista) return;
    const xmls = Array.from(lista).filter((f) => /\.xml$/i.test(f.name));
    if (xmls.length < Array.from(lista).length) setErro('Só arquivos .xml foram adicionados.');
    else setErro(null);
    setArquivos((atual) => {
      const nomes = new Set(atual.map((f) => f.name + f.size));
      return [...atual, ...xmls.filter((f) => !nomes.has(f.name + f.size))];
    });
  }

  async function validar() {
    if (!normaId || arquivos.length === 0) return;
    setValidando(true);
    setErro(null);
    setResultados([]);
    setAberto(null);
    try {
      // lê tudo e monta lotes que cabem no limite de envio
      const lidos: { nome: string; conteudo: string }[] = [];
      for (const f of arquivos) lidos.push({ nome: f.name, conteudo: await f.text() });
      const lotes: { nome: string; conteudo: string }[][] = [];
      let atual: { nome: string; conteudo: string }[] = [];
      let tam = 0;
      for (const l of lidos) {
        if (l.conteudo.length > LOTE_MAX_CARACTERES) throw new Error(`"${l.nome}" é grande demais para validar (acima de 3 MB).`);
        if (atual.length >= LOTE_MAX_ARQUIVOS || tam + l.conteudo.length > LOTE_MAX_CARACTERES) {
          lotes.push(atual);
          atual = [];
          tam = 0;
        }
        atual.push(l);
        tam += l.conteudo.length;
      }
      if (atual.length) lotes.push(atual);

      const todos: Resultado[] = [];
      for (let i = 0; i < lotes.length; i++) {
        setProgresso(`Validando ${todos.length + lotes[i].length} de ${lidos.length}…`);
        const res = await fetch('/api/validador-xml/validar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ normaId, ignorarVigencia, arquivos: lotes[i] }),
        });
        const corpo = await res.json().catch(() => null);
        if (!res.ok) throw new Error(corpo?.error || `Falha na validação (${res.status}).`);
        setRotulo(corpo.normaRotulo);
        todos.push(...corpo.resultados);
      }
      setRotuloIgnorou(ignorarVigencia);
      setResultados(todos);
      if (todos.length === 1) setAberto(todos[0].id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha na validação.');
    } finally {
      setValidando(false);
      setProgresso('');
    }
  }

  const norma = normas.find((n) => n.id === normaId);
  const dtBr = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : null);

  return (
    <div className="space-y-5">
      <div className="card-surface p-5 space-y-4">
        <div className="flex items-center gap-2">
          <FileCode2 className="text-brand" size={20} />
          <h2 className="font-display font-semibold text-gray-800">Validar XML de NF-e / NFC-e</h2>
        </div>

        {normas.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Nenhuma Nota Técnica ativa cadastrada. Cadastre uma na aba &quot;Notas Técnicas&quot; antes de validar.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nota Técnica / versão</label>
              <select value={normaId} onChange={(e) => setNormaId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {normas.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.numero} — versão {n.versao}
                  </option>
                ))}
              </select>
              {norma && (
                <p className="text-[11px] text-gray-500 mt-1">
                  {norma.resumo.executaveis} regra(s) conferidas automaticamente · {norma.resumo.catalogadas} só catalogadas
                  {norma.producaoEm ? ` · produção a partir de ${dtBr(norma.producaoEm)}` : ''}
                  {norma.homologacaoEm ? ` (homologação ${dtBr(norma.homologacaoEm)})` : ''}
                </p>
              )}
            </div>
            <label className="flex items-start gap-2 text-sm text-gray-700 sm:pt-5 cursor-pointer">
              <input type="checkbox" checked={ignorarVigencia} onChange={(e) => setIgnorarVigencia(e.target.checked)} className="mt-1" />
              <span>
                Conferir como se a Nota Técnica já estivesse em vigor
                <span className="block text-[11px] text-gray-400">
                  Sem marcar, o que a NT ainda não exige na data de emissão do XML aparece só como alerta, não como divergência.
                </span>
              </span>
            </label>
          </div>
        )}

        <div
          onClick={() => !validando && input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            adicionar(e.dataTransfer.files);
          }}
          className={`cursor-pointer border-2 border-dashed rounded-xl px-6 py-6 text-center transition-colors ${arrastando ? 'border-accent bg-accent/5' : 'border-gray-200 hover:border-brand/40'}`}
        >
          <FileUp className="mx-auto text-brand/70" size={28} />
          <p className="text-sm font-medium text-gray-700 mt-2">Arraste um ou vários XMLs aqui</p>
          <p className="text-xs text-gray-400 mt-1">ou clique para escolher (NF-e modelo 55 / NFC-e modelo 65)</p>
          <input ref={input} type="file" accept=".xml,text/xml,application/xml" multiple className="hidden" onChange={(e) => { adicionar(e.target.files); e.target.value = ''; }} />
        </div>

        {arquivos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {arquivos.map((f) => (
              <span key={f.name + f.size} className="inline-flex items-center gap-1.5 text-xs bg-gray-50 border border-gray-200 rounded-full pl-3 pr-1.5 py-1">
                <span className="max-w-[260px] truncate">{f.name}</span>
                {!validando && (
                  <button onClick={() => setArquivos((a) => a.filter((x) => x !== f))} className="text-gray-400 hover:text-red-600">
                    <X size={14} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={validar}
            disabled={validando || !normaId || arquivos.length === 0}
            className="bg-accent hover:bg-accent-dark text-white font-medium text-sm rounded-xl px-6 py-2.5 disabled:opacity-40 transition-colors"
          >
            {validando ? progresso || 'Validando…' : `Validar ${arquivos.length || ''} XML${arquivos.length === 1 ? '' : 's'}`}
          </button>
          {arquivos.length > 0 && !validando && (
            <button onClick={() => { setArquivos([]); setResultados([]); }} className="text-xs text-gray-500 underline">
              Limpar
            </button>
          )}
        </div>
        <p className="text-[11px] text-gray-400">
          O XML é conferido contra as regras extraídas da Nota Técnica e não fica guardado — só o resultado vai para o histórico. Regras que o sistema não consegue interpretar
          aparecem como &quot;não validáveis&quot;, nunca como aprovadas.
        </p>
      </div>

      {resultados.length > 0 && (
        <div className="card-surface p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display font-semibold text-gray-800">
              Resultado — {resultados.length} XML{resultados.length === 1 ? '' : 's'} · {rotulo}
            </h2>
            <button
              onClick={() => exportarValidacoesExcel(resultados, rotulo)}
              className="inline-flex items-center gap-1.5 text-sm border border-brand text-brand hover:bg-brand/5 rounded-lg px-3 py-1.5"
            >
              <Download size={15} /> Exportar Excel
            </button>
          </div>

          {resultados.length > 1 && (
            <div className="overflow-x-auto border border-gray-100 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-3 py-2">Arquivo</th>
                    <th className="text-left px-3 py-2">NF</th>
                    <th className="text-left px-3 py-2">Resultado</th>
                    <th className="text-right px-3 py-2">Conformidade</th>
                    <th className="text-right px-3 py-2">Conformes</th>
                    <th className="text-right px-3 py-2">Alertas</th>
                    <th className="text-right px-3 py-2">Divergências</th>
                    <th className="text-right px-3 py-2">Ausentes</th>
                    <th className="text-right px-3 py-2">Indevidos</th>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((r) => (
                    <tr key={r.id} onClick={() => setAberto(aberto === r.id ? null : r.id)} className={`border-t border-gray-50 cursor-pointer hover:bg-gray-50 ${aberto === r.id ? 'bg-brand/[0.04]' : ''}`}>
                      <td className="px-3 py-1.5 max-w-[240px] truncate">{r.arquivo}</td>
                      <td className="px-3 py-1.5">{r.numero ?? '—'}</td>
                      <td className="px-3 py-1.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${COR_VEREDITO[r.veredito]}`}>{ROTULO_VEREDITO[r.veredito]}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right">{r.conformidade === null ? '—' : `${r.conformidade}%`}</td>
                      <td className="px-3 py-1.5 text-right">{r.contagens.conformes}</td>
                      <td className="px-3 py-1.5 text-right">{r.contagens.alertas}</td>
                      <td className="px-3 py-1.5 text-right">{r.contagens.divergencias}</td>
                      <td className="px-3 py-1.5 text-right">{r.contagens.ausentes}</td>
                      <td className="px-3 py-1.5 text-right">{r.contagens.indevidos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-gray-400 px-3 py-1.5">Clique numa linha para ver o detalhe.</p>
            </div>
          )}

          {resultados.map(
            (r) =>
              (resultados.length === 1 || aberto === r.id) && (
                <div key={r.id} className="space-y-2">
                  {resultados.length > 1 && <p className="text-sm font-medium text-gray-800">{r.arquivo}</p>}
                  <ResultadoXml r={r} normaRotulo={rotulo} ignorouVigencia={rotuloIgnorou} />
                </div>
              )
          )}
        </div>
      )}
    </div>
  );
}
