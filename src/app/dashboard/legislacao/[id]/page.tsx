'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft, FileDown, FileSpreadsheet, CircleHelp, Repeat, CalendarDays, Users, ListTodo, Hourglass, Cpu, ShieldAlert, Lightbulb, Landmark, Receipt, FileStack, Hash, AlertTriangle, Info, PlusCircle, MinusCircle, PenLine,
} from 'lucide-react';
import AbaComunicado from '@/components/legislacao/AbaComunicado';
import { Secao, ListaItensFonte, LinhaDoTempo, RefFonte, SeloNatureza, ListaComparacao } from '@/components/legislacao/Blocos';
import { ROTULO_STATUS, STATUS_ANALISE, COR_STATUS, type ResultadoAnalise, type ResultadoComparacao, type Comunicado, type StatusAnalise, type ItemChecklist } from '@/lib/legislacao/tipos';
import { fmtData, ehComparacao } from '@/lib/legislacao/formatar';

type Analise = {
  id: string;
  modo: string;
  nomeArquivo: string;
  nomeArquivoB: string | null;
  tipoDocumento: string | null;
  numero: string | null;
  dataDocumento: string | null;
  orgao: string | null;
  titulo: string;
  status: StatusAnalise;
  resultado: ResultadoAnalise | ResultadoComparacao;
  checklistMarcados: number[] | null;
  assinaturaId: string | null;
  modelo: string | null;
  paginas: number | null;
  leituraTexto: boolean;
  userName: string | null;
  createdAt: string;
};

type Aba = { id: string; rotulo: string };
const ABAS_ANALISE: Aba[] = [
  { id: 'resumo', rotulo: 'Resumo Executivo' },
  { id: 'analise', rotulo: 'Análise Técnica' },
  { id: 'prazos', rotulo: 'Linha do Tempo' },
  { id: 'checklist', rotulo: 'Checklist' },
  { id: 'base', rotulo: 'Base Legal / Fonte' },
  { id: 'comunicado', rotulo: 'Comunicado Visual' },
];
const ABAS_COMPARACAO: Aba[] = [
  { id: 'resumo', rotulo: 'Resumo' },
  { id: 'diferencas', rotulo: 'Diferenças' },
  { id: 'prazos', rotulo: 'Novos Prazos' },
  { id: 'checklist', rotulo: 'Checklist' },
  { id: 'comunicado', rotulo: 'Comunicado Visual' },
];

export default function AnaliseLegislacaoPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={null}>
      <Conteudo id={params.id} />
    </Suspense>
  );
}

function Conteudo({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState(searchParams.get('aba') || 'resumo');

  useEffect(() => {
    fetch(`/api/legislacao/analises/${id}`)
      .then(async (r) => (r.ok ? setAnalise((await r.json()).analise) : setErro((await r.json().catch(() => null))?.error || 'Falha ao carregar.')))
      .catch(() => setErro('Falha ao carregar.'));
  }, [id]);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/legislacao/analises/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) setAnalise((await res.json()).analise);
  }

  if (erro) return <p className="text-sm text-red-700">{erro}</p>;
  if (!analise) return <p className="text-sm text-gray-400">Carregando análise…</p>;

  const r = analise.resultado;
  const comparacao = ehComparacao(r);
  const semIa = (analise.modelo ?? '').startsWith('regras');
  const abas = comparacao ? ABAS_COMPARACAO : ABAS_ANALISE;
  const marcados = analise.checklistMarcados ?? [];

  return (
    <div className="space-y-5 max-w-6xl">
      <Link href="/dashboard/legislacao" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand">
        <ArrowLeft size={15} /> Analisador de Legislação
      </Link>

      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-brand-deep text-white px-7 py-7">
        <div className="brand-arcs" />
        <div className="relative z-10 flex flex-wrap gap-5 justify-between items-start">
          <div className="min-w-0 max-w-3xl">
            <p className="font-mono text-[11px] tracking-widest uppercase text-white/50">— {comparacao ? 'Comparação de documentos' : analise.tipoDocumento || 'Legislação'}</p>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold leading-tight mt-2">{analise.titulo}</h1>
            <div className="flex flex-wrap gap-2 mt-4 text-[11px]">
              {[analise.numero, analise.orgao, fmtData(analise.dataDocumento)].filter(Boolean).map((t) => (
                <span key={t} className="bg-white/10 border border-white/15 rounded-full px-3 py-1">
                  {t}
                </span>
              ))}
              <span className="bg-white/10 border border-white/15 rounded-full px-3 py-1 font-mono truncate max-w-xs" title={analise.nomeArquivo}>
                {analise.nomeArquivo}
                {analise.nomeArquivoB ? ` × ${analise.nomeArquivoB}` : ''}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 items-end">
            <select
              value={analise.status}
              onChange={(e) => patch({ status: e.target.value })}
              className="text-sm text-gray-800 rounded-lg px-3 py-1.5 border-0"
            >
              {STATUS_ANALISE.map((s) => (
                <option key={s} value={s}>
                  {ROTULO_STATUS[s]}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <a href={`/api/legislacao/analises/${id}/pdf`} className="inline-flex items-center gap-1.5 bg-accent hover:bg-accent-dark text-white text-sm rounded-lg px-3 py-1.5">
                <FileDown size={15} /> Relatório PDF
              </a>
              <a href={`/api/legislacao/analises/${id}/excel`} className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-sm rounded-lg px-3 py-1.5">
                <FileSpreadsheet size={15} /> Excel
              </a>
            </div>
            <p className="text-[10px] text-white/45 text-right">
              Analisado em {new Date(analise.createdAt).toLocaleString('pt-BR')}
              {analise.userName ? ` por ${analise.userName}` : ''}
              {analise.paginas ? ` · ${analise.paginas} pág.` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-gray-500 bg-white border border-gray-100 rounded-xl px-4 py-2.5">
        <Info size={15} className="text-brand shrink-0 mt-px" />
        <span>
          {semIa ? (
            <>
              <strong className="text-brand">Resumo automático sem IA</strong>: as frases foram localizadas e extraídas do próprio PDF por regras (não reescritas). Confira o comunicado antes de divulgar — dá para editar os textos na aba Comunicado Visual.{' '}
            </>
          ) : (
            'Análise gerada com IA a partir do documento. '
          )}
          <SeloNatureza natureza="expresso" /> = está escrito no documento; <SeloNatureza natureza="interpretacao" /> = leitura técnica ou recomendação. Clique na referência de página para ver o trecho de origem.
          {analise.leituraTexto && !semIa && <strong className="text-amber-700"> PDF lido pelo texto extraído (arquivo grande) — tabelas e imagens podem não ter sido consideradas.</strong>}
        </span>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`px-4 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${aba === a.id ? 'border-accent text-brand font-medium' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {aba === 'comunicado' && (
        <AbaComunicado
          analiseId={analise.id}
          comunicado={r.comunicado}
          tipoDocumento={comparacao ? 'Atualização normativa' : analise.tipoDocumento || ''}
          assinaturaIdInicial={analise.assinaturaId}
          onComunicadoSalvo={(c: Comunicado) => setAnalise({ ...analise, resultado: { ...r, comunicado: c } as typeof r })}
        />
      )}
      {aba === 'checklist' && <AbaChecklist itens={r.checklist} marcados={marcados} status={analise.status} onSalvar={patch} />}
      {aba === 'prazos' && (
        <Secao titulo={comparacao ? 'Novos prazos' : 'Linha do tempo'} icone={<CalendarDays size={18} className="text-brand" />} vazio={(comparacao ? r.novosPrazos : r.linhaDoTempo).length === 0}>
          <LinhaDoTempo marcos={comparacao ? r.novosPrazos : r.linhaDoTempo} />
        </Secao>
      )}

      {!comparacao && aba === 'resumo' && <AbaResumo r={r} />}
      {!comparacao && aba === 'analise' && <AbaTecnica r={r} />}
      {!comparacao && aba === 'base' && <AbaBaseLegal r={r} />}

      {comparacao && aba === 'resumo' && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {(['documentoA', 'documentoB'] as const).map((k) => (
              <div key={k} className="card-surface p-5">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-400">{k === 'documentoA' ? 'Documento A' : 'Documento B'}</p>
                <p className="font-medium text-gray-800 mt-1">{r[k].titulo || '—'}</p>
                <p className="text-xs text-gray-500 mt-1 font-mono">{[r[k].numero, r[k].versao && `v${r[k].versao}`, fmtData(r[k].data)].filter(Boolean).join(' · ')}</p>
                <p className="text-[11px] text-gray-400 mt-1 truncate">{k === 'documentoA' ? analise.nomeArquivo : analise.nomeArquivoB}</p>
              </div>
            ))}
          </div>
          <Secao titulo="Resumo das diferenças" icone={<Repeat size={18} className="text-teal" />}>
            {r.relacao && <p className="text-sm text-teal font-medium mb-2">{r.relacao}</p>}
            <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{r.resumo}</p>
            <div className="grid grid-cols-3 gap-3 mt-4 text-center">
              {[
                ['Incluído', r.incluido.length, 'text-green-700'],
                ['Excluído', r.excluido.length, 'text-red-700'],
                ['Alterado', r.alterado.length, 'text-amber-700'],
              ].map(([rot, n, cor]) => (
                <div key={rot as string} className="bg-gray-50 rounded-xl py-3">
                  <p className={`font-display text-2xl font-semibold ${cor}`}>{n as number}</p>
                  <p className="text-xs text-gray-500">{rot as string}</p>
                </div>
              ))}
            </div>
          </Secao>
          <Limitacoes itens={r.limitacoes} />
        </div>
      )}
      {comparacao && aba === 'diferencas' && (
        <div className="space-y-4">
          <Secao titulo="O que foi incluído" icone={<PlusCircle size={18} className="text-green-600" />} vazio={!r.incluido.length}>
            <ListaComparacao itens={r.incluido} cor="border-green-400" />
          </Secao>
          <Secao titulo="O que foi excluído" icone={<MinusCircle size={18} className="text-red-600" />} vazio={!r.excluido.length}>
            <ListaComparacao itens={r.excluido} cor="border-red-400" />
          </Secao>
          <Secao titulo="O que foi alterado" icone={<PenLine size={18} className="text-amber-600" />} vazio={!r.alterado.length}>
            <ListaComparacao itens={r.alterado} cor="border-amber-400" />
          </Secao>
          <Secao titulo="Novas obrigações" icone={<ListTodo size={18} className="text-brand" />} vazio={!r.novasObrigacoes.length}>
            <ListaComparacao itens={r.novasObrigacoes} cor="border-brand" />
          </Secao>
          <Secao titulo="Alterações fiscais" icone={<Receipt size={18} className="text-brand" />} vazio={!r.alteracoesFiscais.length}>
            <ListaComparacao itens={r.alteracoesFiscais} cor="border-brand" />
          </Secao>
          <Secao titulo="Impactos no ERP" icone={<Cpu size={18} className="text-brand" />} vazio={!r.impactosErp.length}>
            <ListaComparacao itens={r.impactosErp} cor="border-teal" />
          </Secao>
        </div>
      )}
    </div>
  );
}

function Limitacoes({ itens }: { itens: string[] }) {
  if (!itens?.length) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
      <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
        <AlertTriangle size={16} /> Limitações da leitura
      </p>
      <ul className="mt-2 space-y-1 text-sm text-amber-900 list-disc ml-5">
        {itens.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

function AbaResumo({ r }: { r: ResultadoAnalise }) {
  const re = r.resumoExecutivo;
  const id = r.identificacao;
  const perguntas: [string, string, React.ReactNode][] = [
    ['O que aconteceu?', re.oQueAconteceu, <CircleHelp key="a" size={18} />],
    ['O que mudou?', re.oQueMudou, <Repeat key="b" size={18} />],
    ['Quando entra em vigor?', re.quandoEntraEmVigor, <CalendarDays key="c" size={18} />],
    ['Quem será afetado?', re.quemSeraAfetado, <Users key="d" size={18} />],
    ['O que precisamos fazer?', re.oQuePrecisamosFazer, <ListTodo key="e" size={18} />],
    ['Qual o prazo?', re.qualOPrazo, <Hourglass key="f" size={18} />],
    ['Qual o impacto no sistema/ERP?', re.impactoNoErp, <Cpu key="g" size={18} />],
  ];
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        {perguntas.map(([p, resp, icone], i) => (
          <div key={p} className={`card-surface p-5 ${i === 0 ? 'md:col-span-2' : ''}`}>
            <p className="flex items-center gap-2 text-brand font-display font-semibold">
              <span className="w-8 h-8 rounded-lg bg-brand/10 inline-flex items-center justify-center">{icone}</span>
              {p}
            </p>
            <p className="text-sm text-gray-700 mt-2.5 leading-relaxed">{resp || '—'}</p>
          </div>
        ))}
      </div>
      <Secao titulo="Identificação do documento" icone={<FileStack size={18} className="text-brand" />}>
        <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          {[
            ['Título', id.titulo],
            ['Tipo', id.tipoDocumento],
            ['Número', [id.numero, id.versao && `versão ${id.versao}`].filter(Boolean).join(' — ')],
            ['Data', fmtData(id.dataDocumento)],
            ['Órgão responsável', id.orgao],
            ['Publicação', fmtData(id.dataPublicacao)],
            ['Início da vigência', fmtData(id.dataVigencia)],
            ['Assunto principal', r.assuntoPrincipal],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] uppercase tracking-wider text-gray-400">{k}</dt>
              <dd className="text-gray-800 mt-0.5">{v || '—'}</dd>
            </div>
          ))}
        </dl>
        {id.ementa && <p className="text-sm text-gray-600 italic mt-4 border-l-2 border-brand/30 pl-3">{id.ementa}</p>}
      </Secao>
      <Secao titulo="Resumo técnico" icone={<Info size={18} className="text-brand" />}>
        <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{r.resumoTecnico}</p>
      </Secao>
      <Limitacoes itens={r.limitacoes} />
    </div>
  );
}

function AbaTecnica({ r }: { r: ResultadoAnalise }) {
  const COR_TIPO: Record<string, string> = { inclusao: 'bg-green-100 text-green-700', alteracao: 'bg-amber-100 text-amber-700', revogacao: 'bg-red-100 text-red-700', esclarecimento: 'bg-sky-100 text-sky-700' };
  const ROT_TIPO: Record<string, string> = { inclusao: 'Inclusão', alteracao: 'Alteração', revogacao: 'Revogação', esclarecimento: 'Esclarecimento' };
  const COR_GRAV: Record<string, string> = { alta: 'bg-red-100 text-red-700', media: 'bg-amber-100 text-amber-700', baixa: 'bg-gray-100 text-gray-600' };
  return (
    <div className="space-y-4">
      <Secao titulo="Principais alterações" icone={<Repeat size={18} className="text-brand" />} vazio={!r.alteracoes.length}>
        <div className="space-y-3">
          {r.alteracoes.map((a, i) => (
            <div key={i} className="border border-gray-100 rounded-xl px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[10px] font-semibold uppercase rounded px-1.5 py-0.5 ${COR_TIPO[a.tipo] ?? ''}`}>{ROT_TIPO[a.tipo] ?? a.tipo}</span>
                <span className="font-medium text-gray-800 text-sm">{a.titulo}</span>
              </div>
              <p className="text-sm text-gray-700 mt-1.5 leading-relaxed">{a.descricao}</p>
              <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                <SeloNatureza natureza={a.natureza} />
                <RefFonte fonte={a.fonte} />
              </div>
            </div>
          ))}
        </div>
      </Secao>
      <div className="grid md:grid-cols-2 gap-4">
        <Secao titulo="Quem será afetado" icone={<Users size={18} className="text-brand" />} vazio={!r.afetados.length}>
          <ListaItensFonte itens={r.afetados} />
        </Secao>
        <Secao titulo="Obrigações e procedimentos" icone={<ListTodo size={18} className="text-brand" />} vazio={!r.obrigacoes.length}>
          <ListaItensFonte itens={r.obrigacoes} />
        </Secao>
        <Secao titulo="Impactos fiscais e tributários" icone={<Landmark size={18} className="text-brand" />} vazio={!r.impactos.fiscalTributario.length}>
          <ListaItensFonte itens={r.impactos.fiscalTributario} />
        </Secao>
        <Secao titulo="Impactos no ERP / sistema" icone={<Cpu size={18} className="text-brand" />} vazio={!r.impactos.erp.length}>
          <ListaItensFonte itens={r.impactos.erp} />
        </Secao>
        <Secao titulo="NF-e / NFC-e / NFS-e / CT-e" icone={<Receipt size={18} className="text-brand" />} vazio={!r.impactos.documentosFiscais.length}>
          <ListaItensFonte itens={r.impactos.documentosFiscais} />
        </Secao>
        <Secao titulo="SPED e obrigações acessórias" icone={<FileStack size={18} className="text-brand" />} vazio={!r.impactos.obrigacoesAcessorias.length}>
          <ListaItensFonte itens={r.impactos.obrigacoesAcessorias} />
        </Secao>
      </div>
      <Secao titulo="Códigos fiscais envolvidos" icone={<Hash size={18} className="text-brand" />} vazio={!r.codigos.length}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 font-medium">Código</th>
                <th className="py-2 pr-3 font-medium">Descrição</th>
                <th className="py-2 font-medium">Fonte</th>
              </tr>
            </thead>
            <tbody>
              {r.codigos.map((c, i) => (
                <tr key={i} className="border-b border-gray-50 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-500">{c.tipo}</td>
                  <td className="py-2 pr-3 font-mono text-brand whitespace-nowrap">{c.codigo}</td>
                  <td className="py-2 pr-3 text-gray-700">{c.descricao}</td>
                  <td className="py-2">
                    <RefFonte fonte={c.fonte} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>
      <div className="grid md:grid-cols-2 gap-4">
        <Secao titulo="Riscos de não cumprimento" icone={<ShieldAlert size={18} className="text-ruby" />} vazio={!r.riscos.length}>
          <ul className="space-y-2.5">
            {r.riscos.map((x, i) => (
              <li key={i} className="text-sm text-gray-700">
                <span className={`text-[10px] font-semibold uppercase rounded px-1.5 py-0.5 mr-1.5 ${COR_GRAV[x.gravidade] ?? ''}`}>{x.gravidade}</span>
                {x.descricao}
                <span className="inline-flex gap-1.5 ml-1.5 align-middle">
                  <SeloNatureza natureza={x.natureza} />
                  <RefFonte fonte={x.fonte} />
                </span>
              </li>
            ))}
          </ul>
        </Secao>
        <Secao titulo="Providências recomendadas" icone={<Lightbulb size={18} className="text-accent" />} vazio={!r.providencias.length}>
          <ul className="space-y-2.5">
            {r.providencias.map((p, i) => (
              <li key={i} className="text-sm text-gray-700">
                <span className={`text-[10px] font-semibold uppercase rounded px-1.5 py-0.5 mr-1.5 ${COR_GRAV[p.prioridade] ?? ''}`}>{p.prioridade}</span>
                {p.descricao}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-gray-400 mt-3">Providências são sempre recomendação técnica, não texto da norma.</p>
        </Secao>
      </div>
    </div>
  );
}

function AbaBaseLegal({ r }: { r: ResultadoAnalise }) {
  return (
    <Secao titulo="Base legal / fonte" icone={<Landmark size={18} className="text-brand" />} vazio={!r.baseLegal.length}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th className="py-2 pr-3 font-medium">Documento</th>
              <th className="py-2 pr-3 font-medium">Número</th>
              <th className="py-2 pr-3 font-medium">Data</th>
              <th className="py-2 pr-3 font-medium">Órgão</th>
              <th className="py-2 pr-3 font-medium">Dispositivo</th>
              <th className="py-2 pr-3 font-medium">Pág. PDF</th>
              <th className="py-2 font-medium">Trecho de referência</th>
            </tr>
          </thead>
          <tbody>
            {r.baseLegal.map((b, i) => (
              <tr key={i} className="border-b border-gray-50 align-top">
                <td className="py-2.5 pr-3 text-gray-800">{b.documento}</td>
                <td className="py-2.5 pr-3 font-mono text-xs whitespace-nowrap">{b.numero}</td>
                <td className="py-2.5 pr-3 whitespace-nowrap">{fmtData(b.data) || b.data}</td>
                <td className="py-2.5 pr-3">{b.orgao}</td>
                <td className="py-2.5 pr-3 text-brand">{b.dispositivo}</td>
                <td className="py-2.5 pr-3 text-center font-mono">{b.pagina || '—'}</td>
                <td className="py-2.5 text-xs text-gray-600 italic max-w-md">{b.trecho ? `“${b.trecho}”` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Secao>
  );
}

function AbaChecklist({ itens, marcados, status, onSalvar }: { itens: ItemChecklist[]; marcados: number[]; status: StatusAnalise; onSalvar: (b: Record<string, unknown>) => Promise<void> }) {
  const [feitos, setFeitos] = useState<number[]>(marcados);
  const total = itens.length;
  const pct = total ? Math.round((feitos.length / total) * 100) : 0;

  async function alternar(i: number) {
    const novos = feitos.includes(i) ? feitos.filter((x) => x !== i) : [...feitos, i];
    setFeitos(novos);
    const body: Record<string, unknown> = { checklistMarcados: novos };
    if (status === 'ANALISADA' && novos.length > 0) body.status = 'EM_ADEQUACAO';
    if (novos.length === total && total > 0 && status !== 'ARQUIVADA') body.status = 'CONCLUIDA';
    await onSalvar(body);
  }

  const porArea = itens.reduce<Record<string, number[]>>((acc, it, i) => {
    (acc[it.area] ||= []).push(i);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="card-surface p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-display font-semibold text-gray-800">Progresso da adequação</span>
          <span className="font-mono text-brand">
            {feitos.length}/{total} · {pct}%
          </span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-brand to-lime transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Marcar itens muda o status para &quot;Em adequação&quot;; com todos marcados, vira &quot;Adequação concluída&quot;.</p>
      </div>
      {Object.entries(porArea).map(([area, indices]) => (
        <Secao key={area} titulo={area} icone={<ListTodo size={18} className="text-brand" />}>
          <ul className="space-y-2">
            {indices.map((i) => {
              const it = itens[i];
              const feito = feitos.includes(i);
              return (
                <li key={i} className={`flex gap-3 items-start rounded-lg px-3 py-2.5 border ${feito ? 'bg-green-50/50 border-green-100' : 'border-gray-100'}`}>
                  <input type="checkbox" checked={feito} onChange={() => alternar(i)} className="mt-1 w-4 h-4 accent-[#00753A] cursor-pointer" />
                  <div className="flex-1">
                    <p className={`text-sm ${feito ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{it.acao}</p>
                    <div className="flex flex-wrap gap-2 mt-1 items-center">
                      {it.prazo && (
                        <span className="text-[11px] bg-amber-50 text-amber-700 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
                          <Hourglass size={11} /> {it.prazo}
                        </span>
                      )}
                      <RefFonte fonte={it.fonte} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Secao>
      ))}
      <p className="text-xs text-gray-400">
        Status atual: <span className={`rounded-full px-2 py-0.5 ${COR_STATUS[status]}`}>{ROTULO_STATUS[status]}</span>
      </p>
    </div>
  );
}
