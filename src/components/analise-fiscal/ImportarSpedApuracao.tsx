'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, X } from 'lucide-react';
import { lerEfdIcms } from '@/lib/efd-icms/parser';
import { listarGrupos, marcarDuplicados, montarResumoMensal, validarConjunto } from '@/lib/efd-icms/consolidar';
import { fmtCnpj, rotuloMes } from '@/lib/efd-icms/rotulos';
import type { OrigemSped } from '@/lib/efd-icms/para-apuracao';
import type { ArquivoEfd } from '@/lib/efd-icms/tipos';

const MAX_ARQUIVOS = 24;
const esperar = () => new Promise<void>((r) => setTimeout(r, 0));
const soDigitos = (s: string | null | undefined) => (s || '').replace(/\D/g, '');

// Importa um (ou mais) arquivo SPED Fiscal (EFD ICMS/IPI) e entrega ao pai o resumo do mês escolhido.
// A leitura é toda no navegador — o arquivo não sobe para o servidor, só o resumo mensal (poucos KB).
export default function ImportarSpedApuracao({
  filialNome,
  filialCnpj,
  gerando,
  onGerar,
}: {
  filialNome: string | null;
  filialCnpj: string | null;
  gerando: boolean;
  onGerar: (origem: OrigemSped) => void;
}) {
  const [arquivos, setArquivos] = useState<ArquivoEfd[]>([]);
  const [lendo, setLendo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [grupoEscolhido, setGrupoEscolhido] = useState<string | null>(null);
  const [mesEscolhido, setMesEscolhido] = useState<string>('');
  const entrada = useRef<HTMLInputElement>(null);

  const grupos = useMemo(() => listarGrupos(arquivos), [arquivos]);
  const conjunto = useMemo(() => validarConjunto(arquivos, grupoEscolhido), [arquivos, grupoEscolhido]);
  const ym = conjunto.usados.some((a) => a.ym === mesEscolhido) ? mesEscolhido : conjunto.usados[conjunto.usados.length - 1]?.ym ?? '';
  const arquivo = conjunto.usados.find((a) => a.ym === ym) ?? null;

  const cnpjArquivo = arquivo?.cabecalho.cnpj ?? '';
  const outraFilial = !!arquivo && !!filialCnpj && !!soDigitos(filialCnpj) && soDigitos(filialCnpj) !== soDigitos(cnpjArquivo);
  const semE110 = !!arquivo && !arquivo.apuracao.e110;

  async function adicionar(files: File[]) {
    setErro(null);
    const txt = files.filter((f) => /\.txt$/i.test(f.name));
    if (txt.length < files.length) setErro('Só arquivos .txt do SPED Fiscal foram considerados.');
    const novos: ArquivoEfd[] = [];
    for (const f of txt) {
      if (arquivos.some((a) => a.nomeArquivo === f.name && a.tamanho === f.size) || novos.some((a) => a.nomeArquivo === f.name)) continue;
      if (arquivos.length + novos.length >= MAX_ARQUIVOS) {
        setErro(`Limite de ${MAX_ARQUIVOS} arquivos carregados ao mesmo tempo. Remova alguns para adicionar outros.`);
        break;
      }
      setLendo(`Lendo ${f.name}…`);
      await esperar();
      try {
        // o SPED é gravado em Windows-1252 (acentos); depois do |9999| vem a assinatura digital em binário
        const buffer = await f.arrayBuffer();
        const texto = new TextDecoder('windows-1252').decode(buffer);
        const arq = lerEfdIcms(texto, f.name, new Uint8Array(buffer));
        arq.tamanho = f.size;
        novos.push(arq);
      } catch {
        setErro(`Não foi possível ler "${f.name}".`);
      }
    }
    setLendo(null);
    if (novos.length) setArquivos((a) => [...a, ...novos]);
    if (entrada.current) entrada.current.value = '';
  }

  function remover(a: ArquivoEfd) {
    setArquivos((lista) => lista.filter((x) => x !== a));
  }

  function gerar() {
    if (!arquivo) return;
    marcarDuplicados(conjunto.usados);
    const resumo = montarResumoMensal(arquivo);
    onGerar({
      versao: 1,
      resumo,
      assinadoEm: arquivo.assinadoEm,
      hash: arquivo.versaoNome ? arquivo.versaoNome.hash.slice(0, 8) : null,
    });
  }

  const descartadosDoMes = conjunto.descartados.filter((d) => d.arquivo.ym === ym || !d.arquivo.ym);
  const erroLeitura = arquivos.filter((a) => a.alertas.some((x) => x.nivel === 'erro'));

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Escolha o arquivo do SPED Fiscal (EFD ICMS/IPI, .txt) do mês. O arquivo é lido aqui no seu navegador — só o resumo mensal é guardado. A apuração sai dos registros do arquivo:
        tabelas por CFOP (C190/D190), débitos e créditos (E110) e os ajustes (E111), no mesmo formato do Livro de Apuração. Se houver original e retificadora, vale a de assinatura mais recente.
      </p>

      <label
        className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-300 rounded-xl px-4 py-6 text-sm text-gray-500 cursor-pointer hover:border-brand hover:text-brand"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          adicionar(Array.from(e.dataTransfer.files));
        }}
      >
        <FileUp size={22} />
        <span>{lendo ?? 'Clique ou arraste o arquivo SPED Fiscal (.txt) aqui'}</span>
        <input ref={entrada} type="file" accept=".txt" multiple className="hidden" onChange={(e) => adicionar(Array.from(e.target.files ?? []))} disabled={!!lendo} />
      </label>

      {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>}

      {arquivos.length > 0 && (
        <div className="overflow-x-auto border border-gray-100 rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Arquivo</th>
                <th className="text-left px-3 py-2">Período</th>
                <th className="text-left px-3 py-2">Empresa</th>
                <th className="text-left px-3 py-2">Versão</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {arquivos.map((a) => {
                const err = a.alertas.find((x) => x.nivel === 'erro');
                return (
                  <tr key={a.nomeArquivo + a.tamanho} className={`border-t border-gray-50 ${err ? 'bg-red-50/40' : ''}`}>
                    <td className="px-3 py-1.5 max-w-[260px] truncate" title={a.nomeArquivo}>
                      {a.nomeArquivo}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{a.ym ? rotuloMes(a.ym) : '—'}</td>
                    <td className="px-3 py-1.5 max-w-[220px] truncate" title={a.cabecalho.nome}>
                      {err ? <span className="text-red-700">{err.mensagem}</span> : `${a.cabecalho.nome} — ${fmtCnpj(a.cabecalho.cnpj)}`}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {a.cabecalho.codFin === '1' ? 'retificadora' : 'original'}
                      {a.assinadoEm && <span className="block text-[10px] text-gray-400">assinado em {new Date(a.assinadoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      <button onClick={() => remover(a)} className="text-gray-300 hover:text-red-600" title="Remover" disabled={gerando}>
                        <X size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {arquivo && (
        <div className="space-y-3 border-t border-gray-100 pt-3">
          <div className="flex flex-wrap items-end gap-3">
            {grupos.length > 1 && (
              <label className="text-xs">
                <span className="block text-gray-500 mb-0.5">Empresa / exercício</span>
                <select value={grupoEscolhido ?? grupos[0].chave} onChange={(e) => { setGrupoEscolhido(e.target.value); setMesEscolhido(''); }} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                  {grupos.map((g) => (
                    <option key={g.chave} value={g.chave}>
                      {g.nome} — {fmtCnpj(g.cnpj)} — {g.ano}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {conjunto.usados.length > 1 && (
              <label className="text-xs">
                <span className="block text-gray-500 mb-0.5">Mês da apuração</span>
                <select value={ym} onChange={(e) => setMesEscolhido(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                  {conjunto.usados.map((a) => (
                    <option key={a.ym} value={a.ym}>
                      {rotuloMes(a.ym)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="text-sm text-teal flex items-start gap-1.5">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            <span>
              {arquivo.cabecalho.nome} — CNPJ {fmtCnpj(arquivo.cabecalho.cnpj)} — {rotuloMes(arquivo.ym)} ({arquivo.cabecalho.codFin === '1' ? 'retificadora' : 'original'}
              {arquivo.assinadoEm ? `, assinada em ${new Date(arquivo.assinadoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}).
              {conjunto.usados.length > 1 && ' A apuração é gerada de um mês por vez.'}
            </span>
          </div>

          {descartadosDoMes.length > 0 && (
            <ul className="text-xs text-gray-500 list-disc pl-5 space-y-0.5">
              {descartadosDoMes.map((d, i) => (
                <li key={i}>{d.arquivo.nomeArquivo}: {d.motivo}</li>
              ))}
            </ul>
          )}

          {outraFilial && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              O arquivo é do CNPJ {fmtCnpj(cnpjArquivo)}, mas a filial selecionada no topo é {filialNome} ({fmtCnpj(filialCnpj ?? '')}). Troque a filial ou importe o SPED correto.
            </p>
          )}
          {semE110 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Este arquivo não tem a apuração do ICMS (registro E110): os itens 001 e 005 usarão o ICMS dos registros analíticos e o saldo credor anterior ficará zerado.
            </p>
          )}

          <button
            onClick={gerar}
            disabled={gerando || outraFilial}
            className="bg-accent text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {gerando ? 'Gerando...' : `Gerar Apuração Fiscal de ${rotuloMes(ym)}`}
          </button>
        </div>
      )}

      {arquivos.length > 0 && !arquivo && erroLeitura.length === arquivos.length && (
        <p className="text-sm text-red-600">Nenhum dos arquivos é um SPED Fiscal (EFD ICMS/IPI) válido.</p>
      )}
    </div>
  );
}
