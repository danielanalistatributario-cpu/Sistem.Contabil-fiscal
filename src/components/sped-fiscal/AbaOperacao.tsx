'use client';

import { useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import type { ArquivoEfd, LinhaResumo, Oper, ResumoMensal, TotaisResumo } from '@/lib/efd-icms/tipos';
import { linhasDeDocumentos, filtrarLinhas, totaisDeLinhas, type FiltroDocs } from '@/lib/efd-icms/documentos';
import { brl, fmtCnpj, fmtDataBr, rotuloMes, rotuloMesCurto, SITUACAO_DOC } from '@/lib/efd-icms/rotulos';
import { excelDocumentos, excelResumo, gerarPdf, tabelaPdfDocumentos, tabelaPdfResumo, type MetaRelatorio } from '@/lib/efd-icms/exportar';

const POR_PAGINA = 100;
const LIMITE_PDF = 20000;

function Cabecalho({ children, r }: { children: React.ReactNode; r?: boolean }) {
  return <th className={`px-3 py-2 font-medium whitespace-nowrap ${r ? 'text-right' : 'text-left'}`}>{children}</th>;
}

export default function AbaOperacao({
  oper,
  resumos,
  consolidado,
  arquivos,
  visao,
  meta,
}: {
  oper: Oper;
  resumos: ResumoMensal[]; // meses da visão
  consolidado: { linhas: LinhaResumo[]; totais: TotaisResumo };
  arquivos: ArquivoEfd[] | null; // com documentos (null = análise reaberta do histórico)
  visao: string;
  meta: MetaRelatorio;
}) {
  const nome = oper === 'E' ? 'Entradas' : 'Saídas';
  const [modo, setModo] = useState<'resumo' | 'docs'>('resumo');
  const [f, setF] = useState<FiltroDocs>({});
  const [pagina, setPagina] = useState(0);
  const [gerando, setGerando] = useState<string | null>(null);

  // ---------- resumo por CST/CFOP ----------
  const linhasResumo = useMemo(() => consolidado.linhas.filter((l) => (!f.cfop || l.cfop === f.cfop) && (!f.cst || l.cst === f.cst) && (!f.sit || l.sit === f.sit)), [consolidado, f.cfop, f.cst, f.sit]);
  const totaisResumo = useMemo(() => {
    const t: TotaisResumo = { docs: 0, docsValidos: 0, vlDoc: 0, vlOpr: 0, vlBc: 0, vlIcms: 0, vlBcSt: 0, vlIcmsSt: 0, vlIpi: 0 };
    for (const l of linhasResumo) {
      t.vlOpr += l.vlOpr;
      t.vlBc += l.vlBc;
      t.vlIcms += l.vlIcms;
      t.vlBcSt += l.vlBcSt;
      t.vlIcmsSt += l.vlIcmsSt;
      t.vlIpi += l.vlIpi;
    }
    t.docsValidos = f.cfop || f.cst || f.sit ? linhasResumo.reduce((s, l) => s + l.docs, 0) : consolidado.totais.docsValidos;
    return t;
  }, [linhasResumo, consolidado, f.cfop, f.cst, f.sit]);

  const opcoes = useMemo(() => {
    const cfops = [...new Set(consolidado.linhas.map((l) => l.cfop))].sort();
    const csts = [...new Set(consolidado.linhas.map((l) => l.cst))].sort();
    const sits = [...new Set(consolidado.linhas.map((l) => l.sit))].sort();
    return { cfops, csts, sits };
  }, [consolidado]);

  // ---------- documentos ----------
  const todasLinhas = useMemo(() => {
    if (!arquivos) return null;
    const usados = visao === 'ANO' ? arquivos : arquivos.filter((a) => a.ym === visao);
    return linhasDeDocumentos(usados.flatMap((a) => a.docs), oper);
  }, [arquivos, visao, oper]);
  const filtradas = useMemo(() => (todasLinhas ? filtrarLinhas(todasLinhas, f) : []), [todasLinhas, f]);
  const totaisDocs = useMemo(() => totaisDeLinhas(filtradas), [filtradas]);
  const modelos = useMemo(() => [...new Set((todasLinhas ?? []).map((l) => l.codMod))].sort(), [todasLinhas]);
  const paginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const pg = Math.min(pagina, paginas - 1);

  const atualizar = (patch: FiltroDocs) => {
    setF((x) => ({ ...x, ...patch }));
    setPagina(0);
  };

  const metaOp = { ...meta, titulo: `${meta.titulo} — ${modo === 'resumo' ? `${nome}: resumo por CST/CFOP` : `${nome}: documentos`}` };
  const base = `${nome}_${modo === 'resumo' ? 'resumo' : 'documentos'}_${meta.empresa.nome}_${visao === 'ANO' ? 'exercicio' : visao}`;

  async function exportar(tipo: 'excel' | 'pdf') {
    setGerando(tipo);
    try {
      if (modo === 'resumo') {
        if (tipo === 'excel') await excelResumo(linhasResumo, metaOp, base);
        else await gerarPdf(metaOp, [tabelaPdfResumo(linhasResumo, totaisResumo)], base);
      } else {
        if (tipo === 'excel') await excelDocumentos(filtradas, metaOp, base);
        else {
          if (filtradas.length > LIMITE_PDF && !confirm(`O PDF terá ${filtradas.length.toLocaleString('pt-BR')} linhas e pode demorar. Para volumes grandes o Excel é mais indicado. Continuar?`)) return;
          await gerarPdf(metaOp, [tabelaPdfDocumentos(filtradas, totaisDocs)], base, ['Os valores do documento (frete, despesas, seguro e valor contábil) aparecem uma vez por nota, na primeira linha dela; os demais são do registro analítico (CST/CFOP/alíquota).']);
        }
      }
    } finally {
      setGerando(null);
    }
  };

  const pagina_linhas = filtradas.slice(pg * POR_PAGINA, (pg + 1) * POR_PAGINA);
  const temFiltro = Object.values(f).some(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <button onClick={() => setModo('resumo')} className={`px-4 py-1.5 ${modo === 'resumo' ? 'bg-brand text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            Resumo por CST / CFOP
          </button>
          <button onClick={() => setModo('docs')} className={`px-4 py-1.5 ${modo === 'docs' ? 'bg-brand text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            Documentos fiscais
          </button>
        </div>
        <span className="flex-1" />
        <button
          onClick={() => exportar('excel')}
          disabled={!!gerando || (modo === 'docs' && !arquivos)}
          className="inline-flex items-center gap-1.5 text-sm border border-brand text-brand hover:bg-brand/5 rounded-lg px-3 py-1.5 disabled:opacity-40"
        >
          <Download size={15} /> {gerando === 'excel' ? 'Gerando…' : 'Excel'}
        </button>
        <button
          onClick={() => exportar('pdf')}
          disabled={!!gerando || (modo === 'docs' && !arquivos)}
          className="inline-flex items-center gap-1.5 text-sm bg-brand text-white rounded-lg px-3 py-1.5 disabled:opacity-40"
        >
          <FileText size={15} /> {gerando === 'pdf' ? 'Gerando…' : 'PDF'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-end text-xs">
        {modo === 'docs' && visao === 'ANO' && resumos.length > 1 && (
          <label>
            <span className="block text-gray-500 mb-0.5">Mês</span>
            <select value={f.ym ?? ''} onChange={(e) => atualizar({ ym: e.target.value })} className="border border-gray-300 rounded-lg px-2 py-1.5">
              <option value="">Todos</option>
              {resumos.map((r) => (
                <option key={r.ym} value={r.ym}>
                  {rotuloMes(r.ym)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span className="block text-gray-500 mb-0.5">CFOP</span>
          <select value={f.cfop ?? ''} onChange={(e) => atualizar({ cfop: e.target.value })} className="border border-gray-300 rounded-lg px-2 py-1.5">
            <option value="">Todos</option>
            {opcoes.cfops.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-gray-500 mb-0.5">CST do ICMS</span>
          <select value={f.cst ?? ''} onChange={(e) => atualizar({ cst: e.target.value })} className="border border-gray-300 rounded-lg px-2 py-1.5">
            <option value="">Todos</option>
            {opcoes.csts.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-gray-500 mb-0.5">Situação</span>
          <select value={f.sit ?? ''} onChange={(e) => atualizar({ sit: e.target.value })} className="border border-gray-300 rounded-lg px-2 py-1.5 max-w-[200px]">
            <option value="">Todas</option>
            {opcoes.sits.map((c) => (
              <option key={c} value={c}>
                {c} — {SITUACAO_DOC[c] ?? ''}
              </option>
            ))}
          </select>
        </label>
        {modo === 'docs' && (
          <>
            {modelos.length > 1 && (
              <label>
                <span className="block text-gray-500 mb-0.5">Modelo</span>
                <select value={f.modelo ?? ''} onChange={(e) => atualizar({ modelo: e.target.value })} className="border border-gray-300 rounded-lg px-2 py-1.5">
                  <option value="">Todos</option>
                  {modelos.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <span className="block text-gray-500 mb-0.5">{oper === 'E' ? 'Fornecedor' : 'Cliente'} (nome ou CNPJ/CPF)</span>
              <input value={f.participante ?? ''} onChange={(e) => atualizar({ participante: e.target.value })} className="border border-gray-300 rounded-lg px-2 py-1.5 w-56" />
            </label>
            <label>
              <span className="block text-gray-500 mb-0.5">Nº do documento</span>
              <input value={f.numero ?? ''} onChange={(e) => atualizar({ numero: e.target.value })} className="border border-gray-300 rounded-lg px-2 py-1.5 w-32" />
            </label>
            <label>
              <span className="block text-gray-500 mb-0.5">Produto (parte do nome)</span>
              <input value={f.produto ?? ''} onChange={(e) => atualizar({ produto: e.target.value })} className="border border-gray-300 rounded-lg px-2 py-1.5 w-48" />
            </label>
          </>
        )}
        {temFiltro && (
          <button onClick={() => { setF({}); setPagina(0); }} className="text-gray-500 underline pb-1.5">
            Limpar filtros
          </button>
        )}
      </div>

      {modo === 'resumo' ? (
        <div className="overflow-x-auto border border-gray-100 rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <Cabecalho>Situação</Cabecalho>
                <Cabecalho>CST</Cabecalho>
                <Cabecalho>CFOP</Cabecalho>
                <Cabecalho r>Alíq.</Cabecalho>
                <Cabecalho r>Docs</Cabecalho>
                <Cabecalho r>Valor da operação</Cabecalho>
                <Cabecalho r>Base de cálculo ICMS</Cabecalho>
                <Cabecalho r>Valor ICMS</Cabecalho>
                <Cabecalho r>Base ICMS-ST</Cabecalho>
                <Cabecalho r>Valor ICMS-ST</Cabecalho>
                <Cabecalho r>Red. base</Cabecalho>
                <Cabecalho r>IPI</Cabecalho>
              </tr>
            </thead>
            <tbody>
              {linhasResumo.map((l) => (
                <tr key={`${l.sit}${l.cst}${l.cfop}${l.aliq}`} className="border-t border-gray-50">
                  <td className="px-3 py-1.5" title={SITUACAO_DOC[l.sit]}>
                    {l.sit} — <span className="text-gray-500">{(SITUACAO_DOC[l.sit] ?? '').slice(0, 28)}</span>
                  </td>
                  <td className="px-3 py-1.5 font-mono">{l.cst}</td>
                  <td className="px-3 py-1.5 font-mono">{l.cfop}</td>
                  <td className="px-3 py-1.5 text-right">{brl(l.aliq)}</td>
                  <td className="px-3 py-1.5 text-right">{l.docs}</td>
                  <td className="px-3 py-1.5 text-right">{brl(l.vlOpr)}</td>
                  <td className="px-3 py-1.5 text-right">{brl(l.vlBc)}</td>
                  <td className="px-3 py-1.5 text-right">{brl(l.vlIcms)}</td>
                  <td className="px-3 py-1.5 text-right">{brl(l.vlBcSt)}</td>
                  <td className="px-3 py-1.5 text-right">{brl(l.vlIcmsSt)}</td>
                  <td className="px-3 py-1.5 text-right">{brl(l.vlRedBc)}</td>
                  <td className="px-3 py-1.5 text-right">{brl(l.vlIpi)}</td>
                </tr>
              ))}
              {linhasResumo.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-6 text-center text-gray-400">
                    Nenhum registro analítico neste período/filtro.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-brand/[0.06] font-semibold">
              <tr className="border-t-2 border-brand/30">
                <td className="px-3 py-2" colSpan={4}>
                  TOTAL ({totaisResumo.docsValidos} documento(s) com valor{consolidado.totais.docs > consolidado.totais.docsValidos ? ` · ${consolidado.totais.docs - consolidado.totais.docsValidos} cancelado(s)/inutilizado(s)` : ''})
                </td>
                <td className="px-3 py-2 text-right">{totaisResumo.docsValidos}</td>
                <td className="px-3 py-2 text-right">{brl(totaisResumo.vlOpr)}</td>
                <td className="px-3 py-2 text-right">{brl(totaisResumo.vlBc)}</td>
                <td className="px-3 py-2 text-right">{brl(totaisResumo.vlIcms)}</td>
                <td className="px-3 py-2 text-right">{brl(totaisResumo.vlBcSt)}</td>
                <td className="px-3 py-2 text-right">{brl(totaisResumo.vlIcmsSt)}</td>
                <td />
                <td className="px-3 py-2 text-right">{brl(totaisResumo.vlIpi)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : !arquivos ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          Esta análise foi reaberta do histórico, que guarda só o resumo mensal. Para ver a lista nota a nota, importe novamente os arquivos SPED.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-[11px]">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  {visao === 'ANO' && <Cabecalho>Mês</Cabecalho>}
                  <Cabecalho>Emissão</Cabecalho>
                  <Cabecalho>{oper === 'E' ? 'Entrada' : 'Saída'}</Cabecalho>
                  <Cabecalho>Nº doc.</Cabecalho>
                  <Cabecalho>Sér.</Cabecalho>
                  <Cabecalho>Mod.</Cabecalho>
                  <Cabecalho>Sit.</Cabecalho>
                  <Cabecalho>{oper === 'E' ? 'Fornecedor' : 'Cliente'}</Cabecalho>
                  <Cabecalho>CNPJ/CPF</Cabecalho>
                  <Cabecalho>Produtos</Cabecalho>
                  <Cabecalho>CFOP</Cabecalho>
                  <Cabecalho>CST</Cabecalho>
                  <Cabecalho r>Alíq.</Cabecalho>
                  <Cabecalho r>Vl. operação</Cabecalho>
                  <Cabecalho r>BC ICMS</Cabecalho>
                  <Cabecalho r>ICMS</Cabecalho>
                  <Cabecalho r>ICMS-ST</Cabecalho>
                  <Cabecalho r>Produtos/serv.</Cabecalho>
                  <Cabecalho r>Frete</Cabecalho>
                  <Cabecalho r>Desp.</Cabecalho>
                  <Cabecalho r>Seguro</Cabecalho>
                  <Cabecalho r>Desc.</Cabecalho>
                  <Cabecalho r>Vl. contábil</Cabecalho>
                </tr>
              </thead>
              <tbody>
                {pagina_linhas.map((l, i) => (
                  <tr key={`${l.docId}-${i}`} className={`border-t ${l.primeira ? 'border-gray-100' : 'border-gray-50 text-gray-500'} ${l.sit === '02' || l.sit === '03' || l.sit === '04' || l.sit === '05' ? 'bg-red-50/40' : ''}`}>
                    {visao === 'ANO' && <td className="px-2 py-1 whitespace-nowrap">{rotuloMesCurto(l.ym)}</td>}
                    <td className="px-2 py-1 whitespace-nowrap">{l.primeira ? fmtDataBr(l.dtDoc) : ''}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{l.primeira ? fmtDataBr(l.dtES) : ''}</td>
                    <td className="px-2 py-1 font-mono">{l.primeira ? l.numero : ''}</td>
                    <td className="px-2 py-1">{l.primeira ? l.serie : ''}</td>
                    <td className="px-2 py-1">{l.primeira ? l.codMod : ''}</td>
                    <td className="px-2 py-1" title={SITUACAO_DOC[l.sit]}>{l.primeira ? l.sit : ''}</td>
                    <td className="px-2 py-1 max-w-[200px] truncate" title={l.partNome}>{l.primeira ? l.partNome : ''}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{l.primeira ? fmtCnpj(l.partDoc) : ''}</td>
                    <td className="px-2 py-1 max-w-[280px] truncate" title={l.produtos}>
                      {l.produtos}
                    </td>
                    <td className="px-2 py-1 font-mono">{l.cfop}</td>
                    <td className="px-2 py-1 font-mono">{l.cst}</td>
                    <td className="px-2 py-1 text-right">{l.aliq === null ? '' : brl(l.aliq)}</td>
                    <td className="px-2 py-1 text-right">{l.cfop ? brl(l.vlOpr) : ''}</td>
                    <td className="px-2 py-1 text-right">{l.cfop ? brl(l.vlBc) : ''}</td>
                    <td className="px-2 py-1 text-right">{l.cfop ? brl(l.vlIcms) : ''}</td>
                    <td className="px-2 py-1 text-right">{l.vlIcmsSt ? brl(l.vlIcmsSt) : ''}</td>
                    <td className="px-2 py-1 text-right">{l.primeira ? brl(l.vlMerc) : ''}</td>
                    <td className="px-2 py-1 text-right">{l.primeira && l.vlFrt ? brl(l.vlFrt) : ''}</td>
                    <td className="px-2 py-1 text-right">{l.primeira && l.vlOutDa ? brl(l.vlOutDa) : ''}</td>
                    <td className="px-2 py-1 text-right">{l.primeira && l.vlSeg ? brl(l.vlSeg) : ''}</td>
                    <td className="px-2 py-1 text-right">{l.primeira && l.vlDesc ? brl(l.vlDesc) : ''}</td>
                    <td className="px-2 py-1 text-right font-medium">{l.primeira ? brl(l.vlDoc) : ''}</td>
                  </tr>
                ))}
                {filtradas.length === 0 && (
                  <tr>
                    <td colSpan={23} className="px-3 py-6 text-center text-gray-400">
                      Nenhum documento neste período/filtro.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-brand/[0.06] font-semibold">
                <tr className="border-t-2 border-brand/30">
                  <td className="px-2 py-2" colSpan={visao === 'ANO' ? 13 : 12}>
                    TOTAL — {totaisDocs.docs.toLocaleString('pt-BR')} documento(s) · {filtradas.length.toLocaleString('pt-BR')} linha(s)
                  </td>
                  <td className="px-2 py-2 text-right">{brl(totaisDocs.vlOpr)}</td>
                  <td className="px-2 py-2 text-right">{brl(totaisDocs.vlBc)}</td>
                  <td className="px-2 py-2 text-right">{brl(totaisDocs.vlIcms)}</td>
                  <td className="px-2 py-2 text-right">{brl(totaisDocs.vlIcmsSt)}</td>
                  <td className="px-2 py-2 text-right">{brl(totaisDocs.vlMerc)}</td>
                  <td className="px-2 py-2 text-right">{brl(totaisDocs.vlFrt)}</td>
                  <td className="px-2 py-2 text-right">{brl(totaisDocs.vlOutDa)}</td>
                  <td className="px-2 py-2 text-right">{brl(totaisDocs.vlSeg)}</td>
                  <td className="px-2 py-2 text-right">{brl(totaisDocs.vlDesc)}</td>
                  <td className="px-2 py-2 text-right">{brl(totaisDocs.vlDoc)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <button onClick={() => setPagina(Math.max(0, pg - 1))} disabled={pg === 0} className="border border-gray-300 rounded px-2 py-1 disabled:opacity-40">
              ‹ Anterior
            </button>
            <span>
              Página {pg + 1} de {paginas}
            </span>
            <button onClick={() => setPagina(Math.min(paginas - 1, pg + 1))} disabled={pg >= paginas - 1} className="border border-gray-300 rounded px-2 py-1 disabled:opacity-40">
              Próxima ›
            </button>
            <span className="text-gray-400">
              Os valores do documento (produtos, frete, despesas, seguro, desconto e valor contábil) saem uma vez por nota; CST/CFOP/alíquota, base e ICMS são do registro analítico (linhas em cinza = continuação da mesma nota). A coluna Produtos lista os itens da nota que pertencem ao CST/CFOP daquela linha (em CT-e não há produtos).
            </span>
          </div>
        </>
      )}
    </div>
  );
}
