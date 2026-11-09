'use client';

import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import type { ApuracaoE110, ResumoMensal } from '@/lib/efd-icms/tipos';
import type { ConsolidadoAno } from '@/lib/efd-icms/consolidar';
import { ROTULOS_E110, brl, fmtDataBr, rotuloMesCurto } from '@/lib/efd-icms/rotulos';
import { excelApuracao, gerarPdf, tabelasPdfApuracao, type MetaRelatorio } from '@/lib/efd-icms/exportar';

const DESTAQUE = new Set(['vlTotDebitos', 'vlTotCreditos', 'vlIcmsRecolher', 'vlSldCredorTransportar']);

export default function AbaApuracao({ resumos, consolidado, meta, visao }: { resumos: ResumoMensal[]; consolidado: ConsolidadoAno; meta: MetaRelatorio; visao: string }) {
  const [gerando, setGerando] = useState<string | null>(null);
  const anual = resumos.length > 1;
  const metaAp = { ...meta, titulo: `${meta.titulo} — Apuração do ICMS (operações próprias)` };
  const base = `Apuracao_ICMS_${meta.empresa.nome}_${visao === 'ANO' ? 'exercicio' : visao}`;

  async function exportar(tipo: 'excel' | 'pdf') {
    setGerando(tipo);
    try {
      if (tipo === 'excel') await excelApuracao(resumos, anual ? consolidado : null, metaAp, base);
      else
        await gerarPdf(metaAp, tabelasPdfApuracao(resumos, anual ? consolidado : null), base, [
          'Valores do registro E110 (apuração do ICMS — operações próprias) e dos lançamentos E111/E116 do próprio arquivo SPED. Nenhum valor foi recalculado.',
          ...(anual ? ['No exercício: saldo credor do período anterior = o do 1º mês; saldo credor a transportar = o do último mês; os demais campos = soma dos meses.'] : []),
        ]);
    } finally {
      setGerando(null);
    }
  }

  const semE110 = resumos.filter((r) => !r.apuracao.e110);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display font-semibold text-gray-800">Registros fiscais da apuração do ICMS — operações próprias</h3>
        <span className="flex-1" />
        <button onClick={() => exportar('excel')} disabled={!!gerando} className="inline-flex items-center gap-1.5 text-sm border border-brand text-brand hover:bg-brand/5 rounded-lg px-3 py-1.5 disabled:opacity-40">
          <Download size={15} /> {gerando === 'excel' ? 'Gerando…' : 'Excel'}
        </button>
        <button onClick={() => exportar('pdf')} disabled={!!gerando} className="inline-flex items-center gap-1.5 text-sm bg-brand text-white rounded-lg px-3 py-1.5 disabled:opacity-40">
          <FileText size={15} /> {gerando === 'pdf' ? 'Gerando…' : 'PDF'}
        </button>
      </div>

      {semE110.length > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Sem apuração (E110) em: {semE110.map((r) => rotuloMesCurto(r.ym)).join(', ')}.</p>
      )}

      <div className="overflow-x-auto border border-gray-100 rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-3 py-2 min-w-[320px]">Descrição</th>
              {resumos.map((r) => (
                <th key={r.ym} className="text-right px-3 py-2 whitespace-nowrap">
                  {anual ? rotuloMesCurto(r.ym) : 'Valor R$'}
                </th>
              ))}
              {anual && <th className="text-right px-3 py-2 bg-brand/[0.08]">Exercício</th>}
            </tr>
          </thead>
          <tbody>
            {ROTULOS_E110.map((l, i) => (
              <tr key={l.campo} className={`border-t border-gray-50 ${i % 2 ? 'bg-gray-50/60' : ''} ${DESTAQUE.has(l.campo) ? 'font-semibold' : ''}`}>
                <td className="px-3 py-1.5">{l.rotulo}</td>
                {resumos.map((r) => (
                  <td key={r.ym} className="px-3 py-1.5 text-right whitespace-nowrap">
                    {r.apuracao.e110 ? brl(r.apuracao.e110[l.campo as keyof ApuracaoE110]) : '—'}
                  </td>
                ))}
                {anual && <td className="px-3 py-1.5 text-right bg-brand/[0.05] whitespace-nowrap">{brl(consolidado.apuracao[l.campo as keyof ApuracaoE110])}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {anual && (
        <p className="text-[11px] text-gray-500">
          Exercício: saldo credor do período anterior = o do 1º mês; saldo credor a transportar = o do último mês; os demais campos são a soma dos meses (valores do próprio E110 — nada é recalculado).
        </p>
      )}

      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Ajustes da apuração (E111)</h4>
        {consolidado.ajustes.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhum ajuste lançado no período.</p>
        ) : (
          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2">Mês</th>
                  <th className="text-left px-3 py-2">Código</th>
                  <th className="text-left px-3 py-2">Tipo (pelo código)</th>
                  <th className="text-left px-3 py-2">Descrição</th>
                  <th className="text-right px-3 py-2">Valor</th>
                </tr>
              </thead>
              <tbody>
                {consolidado.ajustes.map((a, i) => (
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
        )}
      </div>

      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Obrigações do ICMS a recolher (E116)</h4>
        {consolidado.obrigacoes.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhuma obrigação a recolher lançada no período.</p>
        ) : (
          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2">Mês</th>
                  <th className="text-left px-3 py-2">Cód. obrigação</th>
                  <th className="text-right px-3 py-2">Valor</th>
                  <th className="text-left px-3 py-2">Vencimento</th>
                  <th className="text-left px-3 py-2">Cód. receita</th>
                  <th className="text-left px-3 py-2">Mês ref.</th>
                  <th className="text-left px-3 py-2">Informação complementar</th>
                </tr>
              </thead>
              <tbody>
                {consolidado.obrigacoes.map((o, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-3 py-1.5">{rotuloMesCurto(o.ym)}</td>
                    <td className="px-3 py-1.5 font-mono">{o.cod}</td>
                    <td className="px-3 py-1.5 text-right">{brl(o.valor)}</td>
                    <td className="px-3 py-1.5">{fmtDataBr(o.vencimento)}</td>
                    <td className="px-3 py-1.5">{o.codReceita}</td>
                    <td className="px-3 py-1.5">{o.mesRef}</td>
                    <td className="px-3 py-1.5">{o.txt}</td>
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
