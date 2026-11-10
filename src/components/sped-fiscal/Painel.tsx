'use client';

import { useMemo, useState } from 'react';
import { Download, Save, ArrowLeft } from 'lucide-react';
import { Bar, BarChart, Cell, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ArquivoEfd, ResumoMensal } from '@/lib/efd-icms/tipos';
import { consolidarAno, type ConjuntoValidado } from '@/lib/efd-icms/consolidar';
import { linhasDeDocumentos } from '@/lib/efd-icms/documentos';
import { brl, fmtCnpj, rotuloMes, rotuloMesCurto } from '@/lib/efd-icms/rotulos';
import { excelCompleto, type MetaRelatorio } from '@/lib/efd-icms/exportar';
import AbaOperacao from './AbaOperacao';
import AbaApuracao from './AbaApuracao';
import AbaCredito from './AbaCredito';
import { ListaAlertas } from './Importacao';

export type Analise = { resumos: ResumoMensal[]; arquivos: ArquivoEfd[] | null; conjunto: ConjuntoValidado | null };

type Aba = 'painel' | 'entradas' | 'saidas' | 'apuracao' | 'credito' | 'conferencia';
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'painel', rotulo: 'Painel' },
  { id: 'entradas', rotulo: 'Entradas' },
  { id: 'saidas', rotulo: 'Saídas' },
  { id: 'apuracao', rotulo: 'Apuração do ICMS' },
  { id: 'credito', rotulo: 'Crédito 20% × créditos' },
  { id: 'conferencia', rotulo: 'Conferência' },
];

const VERDE = '#00753A';
const LARANJA = '#F6921E';

const compacto = (n: number) => (Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.', ',')} mi` : Math.abs(n) >= 1000 ? `${Math.round(n / 1000)} mil` : String(Math.round(n)));

function Cartao({ rotulo, valor, sub, cor = 'text-gray-800' }: { rotulo: string; valor: string; sub?: string; cor?: string }) {
  return (
    <div className="border border-gray-100 rounded-xl px-4 py-3 bg-white">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{rotulo}</p>
      <p className={`text-xl font-bold mt-0.5 ${cor}`}>{valor}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Painel({
  analise,
  onSalvar,
  salvando,
  mensagem,
  onVoltar,
}: {
  analise: Analise;
  onSalvar: () => void;
  salvando: boolean;
  mensagem: string | null;
  onVoltar: () => void;
}) {
  const { resumos, arquivos } = analise;
  const [visao, setVisao] = useState<string>(resumos.length > 1 ? 'ANO' : resumos[0].ym);
  const [aba, setAba] = useState<Aba>('painel');
  const [gerando, setGerando] = useState(false);

  const resVisao = useMemo(() => (visao === 'ANO' ? resumos : resumos.filter((r) => r.ym === visao)), [resumos, visao]);
  const consol = useMemo(() => consolidarAno(resVisao), [resVisao]);
  const emp = resumos[0].empresa;
  const ano = resumos[0].ym.slice(0, 4);
  const periodo =
    visao === 'ANO'
      ? resumos.length > 1
        ? `Exercício ${ano} — ${resumos.length} mês(es): ${resumos.map((r) => rotuloMesCurto(r.ym).slice(0, 3)).join(', ')}`
        : rotuloMes(resumos[0].ym)
      : rotuloMes(visao);
  const meta: MetaRelatorio = { empresa: emp, periodo, titulo: 'Relatórios do SPED Fiscal (EFD ICMS/IPI)' };

  const usadosVisao = arquivos ? (visao === 'ANO' ? arquivos : arquivos.filter((a) => a.ym === visao)) : null;

  async function excelTudo() {
    setGerando(true);
    try {
      await excelCompleto({
        resumos: resVisao,
        consolidado: consol,
        entradas: usadosVisao ? linhasDeDocumentos(usadosVisao.flatMap((a) => a.docs), 'E') : null,
        saidas: usadosVisao ? linhasDeDocumentos(usadosVisao.flatMap((a) => a.docs), 'S') : null,
        meta,
        nomeBase: `SPED_Fiscal_${emp.nome}_${visao === 'ANO' ? `exercicio_${ano}` : visao}`,
      });
    } finally {
      setGerando(false);
    }
  }

  const todosAlertas = resumos.flatMap((r) => r.alertas.filter((a) => a.nivel !== 'info').map((a) => ({ ...a, mensagem: `${rotuloMes(r.ym)}: ${a.mensagem}` })));

  return (
    <div className="space-y-4">
      <div className="card-surface p-4 flex flex-wrap items-center gap-3">
        <button onClick={onVoltar} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand">
          <ArrowLeft size={15} /> Importação
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-gray-800 truncate">{emp.nome}</p>
          <p className="text-[11px] text-gray-500">
            CNPJ {fmtCnpj(emp.cnpj)} · IE {emp.ie} · UF {emp.uf} · {periodo}
            {!arquivos && ' · reaberto do histórico (só resumos)'}
          </p>
        </div>
        {resumos.length > 1 && (
          <label className="text-xs">
            <span className="block text-gray-500 mb-0.5">Visão</span>
            <select value={visao} onChange={(e) => setVisao(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
              <option value="ANO">Exercício consolidado ({resumos.length} meses)</option>
              {resumos.map((r) => (
                <option key={r.ym} value={r.ym}>
                  {rotuloMes(r.ym)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button onClick={excelTudo} disabled={gerando} className="inline-flex items-center gap-1.5 text-sm border border-brand text-brand hover:bg-brand/5 rounded-lg px-3 py-1.5 disabled:opacity-40">
          <Download size={15} /> {gerando ? 'Gerando…' : 'Excel completo'}
        </button>
        {arquivos && (
          <button onClick={onSalvar} disabled={salvando} className="inline-flex items-center gap-1.5 text-sm bg-brand text-white rounded-lg px-3 py-1.5 disabled:opacity-40" title="Guarda só o resumo mensal (poucos KB) para reabrir sem reimportar">
            <Save size={15} /> {salvando ? 'Salvando…' : 'Salvar resumos'}
          </button>
        )}
      </div>
      {mensagem && <p className="text-xs text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{mensagem}</p>}

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 whitespace-nowrap transition-colors ${aba === a.id ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            {a.rotulo}
            {a.id === 'conferencia' && todosAlertas.length > 0 && <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-800 rounded-full px-1.5">{todosAlertas.length}</span>}
          </button>
        ))}
      </div>

      {aba === 'painel' && <Dashboard resumos={resumos} resVisao={resVisao} consol={consol} arquivos={usadosVisao} visao={visao} />}
      {aba === 'entradas' && <AbaOperacao oper="E" resumos={resVisao} consolidado={consol.entradas} arquivos={arquivos} visao={visao} meta={meta} />}
      {aba === 'saidas' && <AbaOperacao oper="S" resumos={resVisao} consolidado={consol.saidas} arquivos={arquivos} visao={visao} meta={meta} />}
      {aba === 'apuracao' && <AbaApuracao resumos={resVisao} consolidado={consol} meta={meta} visao={visao} />}
      {aba === 'credito' && <AbaCredito resumos={resVisao} arquivos={usadosVisao} visao={visao} meta={meta} />}
      {aba === 'conferencia' && <Conferencia resumos={resVisao} conjunto={analise.conjunto} />}
    </div>
  );
}

// ---------------------------------------------------------------------
// Painel gerencial
// ---------------------------------------------------------------------

function Dashboard({ resumos, resVisao, consol, arquivos, visao }: { resumos: ResumoMensal[]; resVisao: ResumoMensal[]; consol: ReturnType<typeof consolidarAno>; arquivos: ArquivoEfd[] | null; visao: string }) {
  const e = consol.entradas.totais;
  const s = consol.saidas.totais;
  const ap = consol.apuracao;
  const temE110 = resVisao.some((r) => r.apuracao.e110);
  const serie = resVisao.map((r) => ({
    mes: rotuloMesCurto(r.ym),
    ym: r.ym,
    Entradas: r.entradas.totais.vlOpr,
    Saídas: r.saidas.totais.vlOpr,
    Créditos: r.apuracao.e110?.vlTotCreditos ?? 0,
    Débitos: r.apuracao.e110?.vlTotDebitos ?? 0,
    Saldo: r.apuracao.e110?.vlSldCredorTransportar ?? 0,
    Recolher: r.apuracao.e110?.vlIcmsRecolher ?? 0,
  }));
  const ranking = [...serie].map((x) => ({ ...x, total: x.Entradas + x.Saídas })).sort((a, b) => b.total - a.total);

  // maiores fornecedores/clientes: exatos quando há documentos; senão, dos 10 maiores de cada mês
  const tops = useMemo(() => {
    const juntar = (lista: { nome: string; doc: string; docs: number; valor: number }[]) => {
      const m = new Map<string, { nome: string; doc: string; docs: number; valor: number }>();
      for (const p of lista) {
        const k = p.doc || p.nome;
        const x = m.get(k) ?? { nome: p.nome, doc: p.doc, docs: 0, valor: 0 };
        x.docs += p.docs;
        x.valor += p.valor;
        m.set(k, x);
      }
      return [...m.values()].sort((a, b) => b.valor - a.valor).slice(0, 10);
    };
    if (arquivos) {
      const docs = arquivos.flatMap((a) => a.docs).filter((d) => !d.duplicadoDe && !['02', '03', '04', '05'].includes(d.sit));
      const por = (oper: 'E' | 'S') => juntar(docs.filter((d) => d.oper === oper).map((d) => ({ nome: d.partNome || d.partDoc || d.codPart || '—', doc: d.partDoc, docs: 1, valor: d.vlDoc })));
      return { E: por('E'), S: por('S'), exato: true };
    }
    return { E: juntar(resVisao.flatMap((r) => r.entradas.top)), S: juntar(resVisao.flatMap((r) => r.saidas.top)), exato: false };
  }, [arquivos, resVisao]);

  // por CFOP (visão mensal ou consolidada)
  const porCfop = (linhas: typeof consol.entradas.linhas) => {
    const m = new Map<string, number>();
    for (const l of linhas) m.set(l.cfop, (m.get(l.cfop) ?? 0) + l.vlOpr);
    return m;
  };
  const dadosCfop = (() => {
    const e = porCfop(consol.entradas.linhas);
    const s = porCfop(consol.saidas.linhas);
    const todos = new Set([...e.keys(), ...s.keys()]);
    return [...todos]
      .map((cfop) => ({ cfop, Entradas: e.get(cfop) ?? 0, Saídas: s.get(cfop) ?? 0 }))
      .sort((a, b) => b.Entradas + b.Saídas - (a.Entradas + a.Saídas))
      .slice(0, 8);
  })();

  const maisDeUm = resVisao.length > 1;
  const relSaidasEntradas = e.vlOpr > 0 ? (s.vlOpr / e.vlOpr) * 100 : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Cartao rotulo="Documentos de entrada" valor={e.docs.toLocaleString('pt-BR')} sub={`${e.docsValidos.toLocaleString('pt-BR')} com valor`} />
        <Cartao rotulo="Valor das entradas" valor={`R$ ${brl(e.vlOpr)}`} sub={`ICMS destacado R$ ${brl(e.vlIcms)}`} cor="text-brand" />
        <Cartao rotulo="Documentos de saída" valor={s.docs.toLocaleString('pt-BR')} sub={`${s.docsValidos.toLocaleString('pt-BR')} com valor`} />
        <Cartao rotulo="Valor das saídas" valor={`R$ ${brl(s.vlOpr)}`} sub={`ICMS destacado R$ ${brl(s.vlIcms)}`} cor="text-accent" />
        <Cartao rotulo="Créditos de ICMS (E110)" valor={temE110 ? `R$ ${brl(ap.vlTotCreditos)}` : '—'} cor="text-green-700" />
        <Cartao rotulo="Débitos de ICMS (E110)" valor={temE110 ? `R$ ${brl(ap.vlTotDebitos)}` : '—'} cor="text-red-700" />
        <Cartao rotulo="ICMS a recolher" valor={temE110 ? `R$ ${brl(ap.vlIcmsRecolher)}` : '—'} />
        <Cartao rotulo="Saldo credor a transportar" valor={temE110 ? `R$ ${brl(ap.vlSldCredorTransportar)}` : '—'} sub={maisDeUm ? 'ao fim do período' : undefined} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="border border-gray-100 rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Comparativo entradas × saídas</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { titulo: 'Valor das operações', e: e.vlOpr, s: s.vlOpr },
              { titulo: 'ICMS destacado', e: e.vlIcms, s: s.vlIcms },
            ].map((g) => (
              <div key={g.titulo}>
                <p className="text-[11px] text-gray-500 text-center">{g.titulo}</p>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={[{ nome: 'Entradas', valor: g.e }, { nome: 'Saídas', valor: g.s }]} margin={{ left: 4, right: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={compacto} tick={{ fontSize: 10 }} width={48} />
                    <Tooltip formatter={(v: number) => `R$ ${brl(v)}`} />
                    <Bar dataKey="valor" radius={[3, 3, 0, 0]}>
                      <Cell fill={VERDE} />
                      <Cell fill={LARANJA} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
          {relSaidasEntradas !== null && (
            <p className="text-[11px] text-gray-500 mt-1">
              Saídas = {relSaidasEntradas.toFixed(1).replace('.', ',')}% do valor das entradas · diferença de R$ {brl(s.vlOpr - e.vlOpr)} (saídas − entradas).
            </p>
          )}
        </div>
        {maisDeUm ? (
          <div className="border border-gray-100 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Evolução mensal — entradas e saídas</p>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={serie} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={compacto} tick={{ fontSize: 10 }} width={52} />
                <Tooltip formatter={(v: number) => `R$ ${brl(v)}`} />
                <Legend />
                <Bar dataKey="Entradas" fill={VERDE} />
                <Bar dataKey="Saídas" fill={LARANJA} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="border border-gray-100 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Valor por CFOP (maiores)</p>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={dadosCfop} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="cfop" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={compacto} tick={{ fontSize: 10 }} width={52} />
                <Tooltip formatter={(v: number) => `R$ ${brl(v)}`} />
                <Legend />
                <Bar dataKey="Entradas" fill={VERDE} />
                <Bar dataKey="Saídas" fill={LARANJA} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {maisDeUm && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border border-gray-100 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Evolução mensal — créditos × débitos de ICMS</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={serie} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={compacto} tick={{ fontSize: 10 }} width={46} />
                <Tooltip formatter={(v: number) => `R$ ${brl(v)}`} />
                <Legend />
                <Bar dataKey="Créditos" fill={VERDE} />
                <Bar dataKey="Débitos" fill="#BE1E2D" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="border border-gray-100 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Saldo credor a transportar e ICMS a recolher</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={serie} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={compacto} tick={{ fontSize: 10 }} width={46} />
                <Tooltip formatter={(v: number) => `R$ ${brl(v)}`} />
                <Legend />
                <Line type="monotone" dataKey="Saldo" name="Saldo credor a transportar" stroke={VERDE} strokeWidth={2} dot />
                <Line type="monotone" dataKey="Recolher" name="ICMS a recolher" stroke="#BE1E2D" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {maisDeUm && (
        <div className="border border-gray-100 rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Comparativo dos meses — maior volume de operações (entradas + saídas)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="text-left py-1.5 pr-3">#</th>
                  <th className="text-left py-1.5 pr-3">Mês</th>
                  <th className="text-right py-1.5 pr-3">Entradas</th>
                  <th className="text-right py-1.5 pr-3">Saídas</th>
                  <th className="text-right py-1.5 pr-3">Total movimentado</th>
                  <th className="text-right py-1.5 pr-3">Créditos ICMS</th>
                  <th className="text-right py-1.5">Débitos ICMS</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((m, i) => (
                  <tr key={m.ym} className={`border-t border-gray-50 ${i === 0 ? 'font-semibold bg-brand/[0.05]' : ''}`}>
                    <td className="py-1.5 pr-3">{i + 1}º</td>
                    <td className="py-1.5 pr-3">{rotuloMes(m.ym)}</td>
                    <td className="py-1.5 pr-3 text-right">{brl(m.Entradas)}</td>
                    <td className="py-1.5 pr-3 text-right">{brl(m.Saídas)}</td>
                    <td className="py-1.5 pr-3 text-right">{brl(m.total)}</td>
                    <td className="py-1.5 pr-3 text-right">{brl(m.Créditos)}</td>
                    <td className="py-1.5 text-right">{brl(m.Débitos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {(['E', 'S'] as const).map((op) => (
          <div key={op} className="border border-gray-100 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-700 mb-1">{op === 'E' ? 'Maiores fornecedores' : 'Maiores clientes'}</p>
            <p className="text-[11px] text-gray-400 mb-2">{tops.exato ? 'Por valor dos documentos válidos do período.' : 'Soma dos 10 maiores de cada mês (análise reaberta do histórico).'}</p>
            {tops[op].length === 0 ? (
              <p className="text-xs text-gray-400">Sem documentos.</p>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {tops[op].map((p, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="py-1.5 pr-2 text-gray-400">{i + 1}</td>
                      <td className="py-1.5 pr-2 max-w-[220px] truncate" title={p.nome}>
                        {p.nome}
                        <span className="block text-[10px] text-gray-400">{fmtCnpj(p.doc)}</span>
                      </td>
                      <td className="py-1.5 pr-2 text-right text-gray-500">{p.docs} doc.</td>
                      <td className="py-1.5 text-right font-medium">{brl(p.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400">
        {visao === 'ANO' && resumos.length > 1 ? 'Consolidado = soma dos meses importados (cada documento conta uma vez só).' : ''} Todos os valores vêm dos registros do próprio SPED; nada é estimado.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------
// Conferência
// ---------------------------------------------------------------------

function Conferencia({ resumos, conjunto }: { resumos: ResumoMensal[]; conjunto: ConjuntoValidado | null }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const ok = (dif: number | null) => dif !== null && Math.abs(dif) < 0.01;
  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Compara o que os relatórios mostram (soma dos registros analíticos C190/D190) com o que o próprio arquivo declara na apuração (E110). Diferença não significa que o relatório está errado: pode ser uma
        inconsistência do arquivo — por isso nada é corrigido, só apontado.
      </p>
      {conjunto && <ListaAlertas alertas={conjunto.alertas} />}
      <div className="overflow-x-auto border border-gray-100 rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-3 py-2">Mês</th>
              <th className="text-right px-3 py-2">ICMS saídas (analítico)</th>
              <th className="text-right px-3 py-2">Débitos (E110)</th>
              <th className="text-right px-3 py-2">Diferença</th>
              <th className="text-right px-3 py-2">ICMS entradas (analítico)</th>
              <th className="text-right px-3 py-2">Créditos (E110)</th>
              <th className="text-right px-3 py-2">Diferença</th>
              <th className="text-right px-3 py-2">Saldo recalculado</th>
              <th className="text-right px-3 py-2">Saldo declarado</th>
              <th className="text-left px-3 py-2">Avisos</th>
            </tr>
          </thead>
          <tbody>
            {resumos.map((r) => {
              const c = r.conferencia;
              const avisos = r.alertas.filter((a) => a.nivel !== 'info');
              return (
                <tr key={r.ym} className="border-t border-gray-50 align-top">
                  <td className="px-3 py-1.5 whitespace-nowrap font-medium">{rotuloMes(r.ym)}</td>
                  <td className="px-3 py-1.5 text-right">{brl(c.icmsSaidasAnalitico)}</td>
                  <td className="px-3 py-1.5 text-right">{c.e110Debitos === null ? '—' : brl(c.e110Debitos)}</td>
                  <td className={`px-3 py-1.5 text-right font-medium ${c.difDebitos === null ? '' : ok(c.difDebitos) ? 'text-green-700' : 'text-red-700'}`}>{c.difDebitos === null ? '—' : ok(c.difDebitos) ? 'confere' : brl(c.difDebitos)}</td>
                  <td className="px-3 py-1.5 text-right">{brl(c.icmsEntradasAnalitico)}</td>
                  <td className="px-3 py-1.5 text-right">{c.e110Creditos === null ? '—' : brl(c.e110Creditos)}</td>
                  <td className={`px-3 py-1.5 text-right font-medium ${c.difCreditos === null ? '' : ok(c.difCreditos) ? 'text-green-700' : 'text-red-700'}`}>{c.difCreditos === null ? '—' : ok(c.difCreditos) ? 'confere' : brl(c.difCreditos)}</td>
                  <td className="px-3 py-1.5 text-right">{c.saldoCalculado === null ? '—' : brl(c.saldoCalculado)}</td>
                  <td className="px-3 py-1.5 text-right">{c.saldoDeclarado === null ? '—' : brl(c.saldoDeclarado)}</td>
                  <td className="px-3 py-1.5">
                    {avisos.length === 0 ? (
                      <span className="text-green-700">Sem avisos</span>
                    ) : (
                      <button onClick={() => setAberto(aberto === r.ym ? null : r.ym)} className="text-amber-700 underline">
                        {avisos.length} aviso(s)
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400">Saldo: positivo = devedor; negativo = credor. Saldo recalculado = débitos + ajustes a débito + estornos de crédito − créditos − ajustes a crédito − estornos de débito − saldo credor anterior.</p>

      {resumos.map(
        (r) =>
          aberto === r.ym && (
            <div key={r.ym} className="border border-amber-200 rounded-xl p-4 space-y-3 bg-amber-50/40">
              <p className="text-sm font-semibold text-gray-800">{rotuloMes(r.ym)} — avisos e documentos a conferir</p>
              <ListaAlertas alertas={r.alertas} />
              {r.conferencia.docsComDiferencaValor.length > 0 && (
                <table className="w-full text-xs">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="text-left py-1">Documento</th>
                      <th className="text-left py-1">Tipo</th>
                      <th className="text-right py-1">Valor do documento</th>
                      <th className="text-right py-1">Soma dos analíticos</th>
                      <th className="text-right py-1">Diferença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.conferencia.docsComDiferencaValor.map((d, i) => (
                      <tr key={i} className="border-t border-amber-100">
                        <td className="py-1">{d.numero}</td>
                        <td className="py-1">{d.oper === 'E' ? 'Entrada' : 'Saída'}</td>
                        <td className="py-1 text-right">{brl(d.vlDoc)}</td>
                        <td className="py-1 text-right">{brl(d.vlOpr)}</td>
                        <td className="py-1 text-right font-medium">{brl(d.vlOpr - d.vlDoc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )
      )}
    </div>
  );
}
