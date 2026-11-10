'use client';

import { useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import type { ArquivoEfd, ResumoMensal } from '@/lib/efd-icms/tipos';
import { ROTULO_PARECER, linhaDemonstrativo, notasDeSuporte, resumirDemonstrativo, totaisNotas, type ModoNotas, type ParecerMes } from '@/lib/efd-icms/credito20';
import { brl, fmtCnpj, fmtDataBr, rotuloMes, rotuloMesCurto } from '@/lib/efd-icms/rotulos';
import { excelCredito, pdfCredito, type MetaRelatorio } from '@/lib/efd-icms/exportar';

const POR_PAGINA = 100;

const COR_PARECER: Record<ParecerMes, string> = {
  SEM_CREDITO: 'bg-gray-100 text-gray-700',
  COMPATIVEL_20: 'bg-green-100 text-green-800',
  NORMAL: 'bg-amber-100 text-amber-800',
  SEM_APURACAO: 'bg-red-100 text-red-700',
};

const MODOS: { id: ModoNotas; rotulo: string; ajuda: string }[] = [
  { id: 'diesel', rotulo: 'Notas com diesel', ajuda: 'notas de entrada com algum item cuja descrição contém "diesel"' },
  { id: 'credito', rotulo: 'Notas com ICMS creditado', ajuda: 'notas de entrada com ICMS nos registros analíticos (C190)' },
  { id: 'todas', rotulo: 'Todas as notas de entrada', ajuda: 'todas as notas de entrada com valor' },
];

function Cabecalho({ children, r }: { children: React.ReactNode; r?: boolean }) {
  return <th className={`px-3 py-2 font-medium whitespace-nowrap ${r ? 'text-right' : 'text-left'}`}>{children}</th>;
}

export default function AbaCredito({ resumos, arquivos, visao, meta }: { resumos: ResumoMensal[]; arquivos: ArquivoEfd[] | null; visao: string; meta: MetaRelatorio }) {
  const [modo, setModo] = useState<ModoNotas>('diesel');
  const [mesNotas, setMesNotas] = useState<string>('');
  const [pagina, setPagina] = useState(0);
  const [gerando, setGerando] = useState<string | null>(null);

  const linhas = useMemo(() => resumos.map(linhaDemonstrativo), [resumos]);
  const resumo = useMemo(() => resumirDemonstrativo(linhas), [linhas]);
  const semMetricasDiesel = resumos.some((r) => !r.credito);

  const mesEfetivo = resumos.length === 1 ? resumos[0].ym : mesNotas;
  const notas = useMemo(() => (arquivos ? notasDeSuporte(arquivos, mesEfetivo || null, modo) : null), [arquivos, mesEfetivo, modo]);
  const totNotas = useMemo(() => (notas ? totaisNotas(notas) : null), [notas]);
  const paginas = Math.max(1, Math.ceil((notas?.length ?? 0) / POR_PAGINA));
  const pg = Math.min(pagina, paginas - 1);
  const rotuloNotas = `${MODOS.find((m) => m.id === modo)!.rotulo.toLowerCase()} — ${mesEfetivo ? rotuloMes(mesEfetivo) : 'todos os meses'}`;
  const base = `Credito_20_x_creditos_${meta.empresa.nome}_${visao === 'ANO' ? 'exercicio' : visao}`;

  const ajustes = useMemo(() => linhas.flatMap((l) => [...l.ajustesCredito, ...l.ajustesOutros].map((a) => ({ ym: l.ym, ...a }))), [linhas]);

  async function exportar(tipo: 'excel' | 'pdf') {
    setGerando(tipo);
    try {
      const metaCred = { ...meta, titulo: meta.titulo };
      if (tipo === 'excel') await excelCredito({ linhas, notas, notasRotulo: rotuloNotas, meta: metaCred, nomeBase: base });
      else await pdfCredito({ linhas, resumo, notas, notasRotulo: rotuloNotas, meta: metaCred, nomeBase: base });
    } finally {
      setGerando(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-display font-semibold text-gray-800">Crédito outorgado de 20% × créditos usados na apuração</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Mostra, mês a mês, de que é feito o crédito da apuração e quanto seria 20% do débito, com as notas de entrada (número, valor contábil, base, ICMS e produtos) que sustentam o crédito.
          </p>
        </div>
        <button onClick={() => exportar('excel')} disabled={!!gerando} className="inline-flex items-center gap-1.5 text-sm border border-brand text-brand hover:bg-brand/5 rounded-lg px-3 py-1.5 disabled:opacity-40">
          <Download size={15} /> {gerando === 'excel' ? 'Gerando…' : 'Excel'}
        </button>
        <button onClick={() => exportar('pdf')} disabled={!!gerando} className="inline-flex items-center gap-1.5 text-sm bg-brand text-white rounded-lg px-3 py-1.5 disabled:opacity-40">
          <FileText size={15} /> {gerando === 'pdf' ? 'Gerando…' : 'PDF'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-gray-100 rounded-xl px-4 py-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-400">Meses em apuração normal</p>
          <p className="text-xl font-bold text-amber-700">
            {resumo.normais} <span className="text-sm font-normal text-gray-400">de {resumo.meses}</span>
          </p>
          {resumo.pctMin !== null && resumo.pctMax !== null && (
            <p className="text-[11px] text-gray-500 mt-0.5">
              crédito entre {(resumo.pctMin * 100).toFixed(0)}% e {(resumo.pctMax * 100).toFixed(0)}% do débito
            </p>
          )}
        </div>
        <div className="border border-gray-100 rounded-xl px-4 py-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-400">Compatíveis com crédito de 20%</p>
          <p className="text-xl font-bold text-green-700">{resumo.compativeis20}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{resumo.primeiroCompativel20 ? `a partir de ${rotuloMes(resumo.primeiroCompativel20)}` : 'nenhum mês no período'}</p>
        </div>
        <div className="border border-gray-100 rounded-xl px-4 py-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-400">Meses sem crédito</p>
          <p className="text-xl font-bold text-gray-700">{resumo.semCredito}</p>
        </div>
        <div className="border border-gray-100 rounded-xl px-4 py-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-400">Ajuste com cara de crédito outorgado, valor ≠ 20%</p>
          <p className={`text-xl font-bold ${resumo.mesesComAlertaOutorgado ? 'text-red-700' : 'text-gray-700'}`}>{resumo.mesesComAlertaOutorgado}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">mês(es) — código SP020709 ou &quot;outorgado&quot; na descrição</p>
        </div>
      </div>

      {semMetricasDiesel && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Alguns meses vieram de resumos salvos antes deste relatório e não têm as métricas de diesel (litros e ICMS por litro). Importe o arquivo SPED desses meses de novo para preenchê-las.
        </p>
      )}

      <div className="overflow-x-auto border border-gray-100 rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <Cabecalho>Mês</Cabecalho>
              <Cabecalho r>Débito das saídas</Cabecalho>
              <Cabecalho r>Créditos de entradas</Cabecalho>
              <Cabecalho r>Ajustes a crédito</Cabecalho>
              <Cabecalho r>Estornos de débitos</Cabecalho>
              <Cabecalho r>Crédito utilizado</Cabecalho>
              <Cabecalho r>% do débito</Cabecalho>
              <Cabecalho r>20% do débito</Cabecalho>
              <Cabecalho r>Diferença</Cabecalho>
              <Cabecalho r>Diesel (litros)</Cabecalho>
              <Cabecalho r>ICMS / litro</Cabecalho>
              <Cabecalho r>Crédito / litro</Cabecalho>
              <Cabecalho r>ICMS a recolher</Cabecalho>
              <Cabecalho>Situação</Cabecalho>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.ym} className="border-t border-gray-50 align-top">
                <td className="px-3 py-1.5 whitespace-nowrap font-medium">{rotuloMesCurto(l.ym)}</td>
                <td className="px-3 py-1.5 text-right">{brl(l.debito)}</td>
                <td className="px-3 py-1.5 text-right">{brl(l.creditosEntradas)}</td>
                <td className="px-3 py-1.5 text-right">{brl(l.ajCreditos)}</td>
                <td className="px-3 py-1.5 text-right">{brl(l.estornosDeb)}</td>
                <td className="px-3 py-1.5 text-right font-semibold">{brl(l.creditoUtilizado)}</td>
                <td className="px-3 py-1.5 text-right">{l.pctDebito === null ? '—' : `${(l.pctDebito * 100).toFixed(1).replace('.', ',')}%`}</td>
                <td className="px-3 py-1.5 text-right">{brl(l.credito20)}</td>
                <td className={`px-3 py-1.5 text-right ${l.difCredito20 > 0.01 ? 'text-red-700' : l.difCredito20 < -0.01 ? 'text-gray-500' : 'text-green-700'}`}>{brl(l.difCredito20)}</td>
                <td className="px-3 py-1.5 text-right">{l.diesel ? l.diesel.litros.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—'}</td>
                <td className="px-3 py-1.5 text-right">{l.icmsPorLitro === null ? '—' : brl(l.icmsPorLitro)}</td>
                <td className="px-3 py-1.5 text-right">{l.creditoPorLitro === null ? '—' : brl(l.creditoPorLitro)}</td>
                <td className="px-3 py-1.5 text-right">{brl(l.icmsRecolher)}</td>
                <td className="px-3 py-1.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${COR_PARECER[l.parecer]}`}>{ROTULO_PARECER[l.parecer]}</span>
                  {l.difalMovimento && <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">DIFAL</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-500">
        Crédito utilizado = créditos de entradas + ajustes a crédito + estornos de débitos (E110). 20% do débito = 20% de &quot;saídas e prestações com débito do imposto&quot;. ICMS/litro = ICMS destacado nos itens de diesel ÷ litros
        (itens em L/LT). &quot;DIFAL&quot; indica movimento no registro E310 (apuração separada; os valores não são interpretados aqui).
      </p>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-700">Demonstração mês a mês</p>
        {linhas.map((l) => (
          <div key={l.ym} className="border border-gray-100 rounded-lg px-3 py-2 text-xs">
            <p>
              <span className="font-semibold">{rotuloMes(l.ym)}:</span> {l.parecerTexto}
            </p>
            {l.alerta && <p className="mt-1 text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">⚠ {l.alerta}</p>}
          </div>
        ))}
      </div>

      {ajustes.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Ajustes da apuração (E111) no período</p>
          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <Cabecalho>Mês</Cabecalho>
                  <Cabecalho>Código</Cabecalho>
                  <Cabecalho>Tipo (pelo código)</Cabecalho>
                  <Cabecalho>Descrição</Cabecalho>
                  <Cabecalho r>Valor</Cabecalho>
                </tr>
              </thead>
              <tbody>
                {ajustes.map((a, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-3 py-1.5">{rotuloMesCurto(a.ym)}</td>
                    <td className="px-3 py-1.5 font-mono">{a.cod}</td>
                    <td className="px-3 py-1.5">{a.categoria}</td>
                    <td className="px-3 py-1.5">{a.descr}</td>
                    <td className="px-3 py-1.5 text-right">{brl(a.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-3 border-t border-gray-100 pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <p className="text-sm font-semibold text-gray-700 mr-2">Notas de entrada que sustentam o crédito</p>
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            {MODOS.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setModo(m.id);
                  setPagina(0);
                }}
                title={m.ajuda}
                className={`px-3 py-1.5 ${modo === m.id ? 'bg-brand text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {m.rotulo}
              </button>
            ))}
          </div>
          {resumos.length > 1 && (
            <label className="text-xs">
              <span className="block text-gray-500 mb-0.5">Mês</span>
              <select
                value={mesNotas}
                onChange={(e) => {
                  setMesNotas(e.target.value);
                  setPagina(0);
                }}
                className="border border-gray-300 rounded-lg px-2 py-1.5"
              >
                <option value="">Todos os meses</option>
                {resumos.map((r) => (
                  <option key={r.ym} value={r.ym}>
                    {rotuloMes(r.ym)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {!notas || !totNotas ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            Esta análise foi reaberta do histórico, que guarda só o resumo mensal. Para ver as notas (número, valor contábil, base, ICMS e produtos), importe novamente os arquivos SPED.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto border border-gray-100 rounded-lg">
              <table className="w-full text-[11px]">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <Cabecalho>Mês</Cabecalho>
                    <Cabecalho>Emissão</Cabecalho>
                    <Cabecalho>Nº da nota</Cabecalho>
                    <Cabecalho>Sér.</Cabecalho>
                    <Cabecalho>Fornecedor</Cabecalho>
                    <Cabecalho>Descrição dos produtos</Cabecalho>
                    <Cabecalho r>Valor contábil</Cabecalho>
                    <Cabecalho r>Base ICMS</Cabecalho>
                    <Cabecalho r>Valor ICMS</Cabecalho>
                    <Cabecalho r>Diesel (L)</Cabecalho>
                    <Cabecalho r>ICMS do diesel</Cabecalho>
                  </tr>
                </thead>
                <tbody>
                  {notas.slice(pg * POR_PAGINA, (pg + 1) * POR_PAGINA).map((n) => (
                    <tr key={n.docId} className="border-t border-gray-50">
                      <td className="px-2 py-1 whitespace-nowrap">{rotuloMesCurto(n.ym)}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{fmtDataBr(n.dtDoc)}</td>
                      <td className="px-2 py-1 font-mono">{n.numero}</td>
                      <td className="px-2 py-1">{n.serie}</td>
                      <td className="px-2 py-1 max-w-[220px] truncate" title={`${n.partNome} — ${fmtCnpj(n.partDoc)}`}>
                        {n.partNome}
                      </td>
                      <td className="px-2 py-1 max-w-[320px] truncate" title={n.produtos}>
                        {n.produtos}
                      </td>
                      <td className="px-2 py-1 text-right">{brl(n.vlDoc)}</td>
                      <td className="px-2 py-1 text-right">{brl(n.vlBc)}</td>
                      <td className="px-2 py-1 text-right">{brl(n.vlIcms)}</td>
                      <td className="px-2 py-1 text-right">{n.temDiesel ? n.litrosDiesel.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : ''}</td>
                      <td className="px-2 py-1 text-right">{n.temDiesel ? brl(n.icmsDiesel) : ''}</td>
                    </tr>
                  ))}
                  {notas.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-3 py-6 text-center text-gray-400">
                        Nenhuma nota neste filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-brand/[0.06] font-semibold">
                  <tr className="border-t-2 border-brand/30">
                    <td className="px-2 py-2" colSpan={6}>
                      TOTAL — {totNotas.notas.toLocaleString('pt-BR')} nota(s)
                    </td>
                    <td className="px-2 py-2 text-right">{brl(totNotas.vlDoc)}</td>
                    <td className="px-2 py-2 text-right">{brl(totNotas.vlBc)}</td>
                    <td className="px-2 py-2 text-right">{brl(totNotas.vlIcms)}</td>
                    <td className="px-2 py-2 text-right">{totNotas.litros.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
                    <td className="px-2 py-2 text-right">{brl(totNotas.icmsDiesel)}</td>
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
                {MODOS.find((m) => m.id === modo)!.ajuda}. Valor contábil, base e ICMS são da nota (soma dos registros analíticos); &quot;Diesel&quot; e &quot;ICMS do diesel&quot; vêm só dos itens de diesel.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
