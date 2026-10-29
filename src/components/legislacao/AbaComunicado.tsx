'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Download, FileDown, MessageCircle, Mail, Pencil, Save, X, UserCog, Star, Trash2, Copy } from 'lucide-react';
import ComunicadoVisual from './ComunicadoVisual';
import { ASSINATURA_PADRAO, type Comunicado } from '@/lib/legislacao/tipos';
import { textoComunicado, type Assinatura } from '@/lib/legislacao/formatar';

type AssinaturaDb = { id: string; nome: string; cargo: string; setor: string | null; padrao: boolean };

const SECOES_LISTA: { chave: keyof Comunicado; rotulo: string }[] = [
  { chave: 'oQueMudou', rotulo: 'O que mudou? (um item por linha)' },
  { chave: 'quemEAfetado', rotulo: 'Quem é afetado? (um item por linha)' },
  { chave: 'oQueFazer', rotulo: 'O que precisamos fazer? (um item por linha)' },
  { chave: 'impactoErp', rotulo: 'Impacto no ERP (um item por linha)' },
  { chave: 'atencao', rotulo: 'Atenção (um item por linha)' },
];

function nomeArquivo(titulo: string, ext: string) {
  return `Comunicado - ${titulo}`.replace(/[\\/:*?"<>|]/g, '-').slice(0, 110) + ext;
}

function baixar(url: string, nome: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
}

export default function AbaComunicado({
  analiseId,
  comunicado,
  tipoDocumento,
  assinaturaIdInicial,
  onComunicadoSalvo,
}: {
  analiseId: string;
  comunicado: Comunicado;
  tipoDocumento: string;
  assinaturaIdInicial: string | null;
  onComunicadoSalvo: (c: Comunicado) => void;
}) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.6);
  const [altura, setAltura] = useState(0);

  const [assinaturas, setAssinaturas] = useState<AssinaturaDb[]>([]);
  const [assinaturaId, setAssinaturaId] = useState<string | null>(assinaturaIdInicial);
  const [gerenciarAssinaturas, setGerenciarAssinaturas] = useState(false);
  const [nova, setNova] = useState({ nome: '', cargo: '', setor: '' });

  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<Comunicado>(comunicado);
  const [salvando, setSalvando] = useState(false);
  const [exportando, setExportando] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const carregarAssinaturas = async () => {
    const res = await fetch('/api/legislacao/assinaturas');
    if (res.ok) setAssinaturas((await res.json()).assinaturas);
  };
  useEffect(() => {
    carregarAssinaturas();
  }, []);

  const exibido = editando ? rascunho : comunicado;
  const assinaturaDb = assinaturas.find((a) => a.id === assinaturaId) ?? assinaturas.find((a) => a.padrao);
  const assinatura: Assinatura = assinaturaDb ?? ASSINATURA_PADRAO;
  const dataGeracao = new Date().toLocaleDateString('pt-BR');

  // Prévia em escala, cabendo na largura da tela.
  useLayoutEffect(() => {
    const ajustar = () => {
      if (!caixaRef.current || !nodeRef.current) return;
      const e = Math.min(1, caixaRef.current.clientWidth / 1080);
      setEscala(e);
      setAltura(nodeRef.current.offsetHeight * e);
    };
    ajustar();
    const ro = new ResizeObserver(ajustar);
    if (caixaRef.current) ro.observe(caixaRef.current);
    if (nodeRef.current) ro.observe(nodeRef.current);
    return () => ro.disconnect();
  }, []);

  async function escolherAssinatura(id: string) {
    setAssinaturaId(id || null);
    await fetch(`/api/legislacao/analises/${analiseId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assinaturaId: id || null }) });
  }

  async function criarAssinatura() {
    if (!nova.nome.trim() || !nova.cargo.trim()) return;
    const res = await fetch('/api/legislacao/assinaturas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...nova, padrao: assinaturas.length === 0 }) });
    if (res.ok) {
      setNova({ nome: '', cargo: '', setor: '' });
      carregarAssinaturas();
    }
  }

  async function salvarComunicado() {
    setSalvando(true);
    const res = await fetch(`/api/legislacao/analises/${analiseId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comunicado: rascunho }) });
    setSalvando(false);
    if (res.ok) {
      onComunicadoSalvo((await res.json()).analise.resultado.comunicado);
      setEditando(false);
    } else alert('Não foi possível salvar o comunicado.');
  }

  async function gerarPng(): Promise<string> {
    const { toPng } = await import('html-to-image');
    return toPng(nodeRef.current!, { pixelRatio: 2, backgroundColor: '#F4F7F5', cacheBust: true });
  }

  async function exportarPng() {
    setExportando('png');
    try {
      baixar(await gerarPng(), nomeArquivo(exibido.titulo, '.png'));
    } finally {
      setExportando(null);
    }
  }

  async function exportarPdf() {
    setExportando('pdf');
    try {
      const png = await gerarPng();
      const { jsPDF } = await import('jspdf');
      const larguraPx = nodeRef.current!.offsetWidth;
      const alturaPx = nodeRef.current!.offsetHeight;
      // Página única do tamanho exato do comunicado (largura de A4).
      const larguraMm = 210;
      const alturaMm = (alturaPx / larguraPx) * larguraMm;
      const pdf = new jsPDF({ orientation: alturaMm >= larguraMm ? 'portrait' : 'landscape', unit: 'mm', format: [larguraMm, alturaMm] });
      pdf.addImage(png, 'PNG', 0, 0, larguraMm, alturaMm);
      pdf.save(nomeArquivo(exibido.titulo, '.pdf'));
    } finally {
      setExportando(null);
    }
  }

  async function copiarTexto(formato: 'whatsapp' | 'email') {
    const texto = textoComunicado(exibido, assinatura, formato);
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(formato);
      setTimeout(() => setCopiado(null), 2500);
    } catch {
      baixar(URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' })), nomeArquivo(exibido.titulo, '.txt'));
    }
  }

  return (
    <div className="space-y-4">
      <div className="card-surface p-4 flex flex-wrap items-center gap-2">
        <button onClick={exportarPng} disabled={!!exportando || editando} className="inline-flex items-center gap-1.5 bg-brand text-white text-sm rounded-lg px-3.5 py-2 disabled:opacity-50">
          <Download size={15} /> {exportando === 'png' ? 'Gerando…' : 'Imagem PNG'}
        </button>
        <button onClick={exportarPdf} disabled={!!exportando || editando} className="inline-flex items-center gap-1.5 bg-brand text-white text-sm rounded-lg px-3.5 py-2 disabled:opacity-50">
          <FileDown size={15} /> {exportando === 'pdf' ? 'Gerando…' : 'PDF do comunicado'}
        </button>
        <button onClick={() => copiarTexto('whatsapp')} className="inline-flex items-center gap-1.5 border border-gray-300 text-sm rounded-lg px-3.5 py-2">
          <MessageCircle size={15} className="text-green-600" /> {copiado === 'whatsapp' ? 'Copiado!' : 'Copiar texto WhatsApp'}
        </button>
        <button onClick={() => copiarTexto('email')} className="inline-flex items-center gap-1.5 border border-gray-300 text-sm rounded-lg px-3.5 py-2">
          <Mail size={15} className="text-sky-600" /> {copiado === 'email' ? 'Copiado!' : 'Copiar texto e-mail/Teams'}
        </button>
        <span className="flex-1" />
        {!editando ? (
          <button
            onClick={() => {
              setRascunho(comunicado);
              setEditando(true);
            }}
            className="inline-flex items-center gap-1.5 border border-gray-300 text-sm rounded-lg px-3.5 py-2"
          >
            <Pencil size={15} /> Editar textos
          </button>
        ) : (
          <>
            <button onClick={salvarComunicado} disabled={salvando} className="inline-flex items-center gap-1.5 bg-accent text-white text-sm rounded-lg px-3.5 py-2 disabled:opacity-50">
              <Save size={15} /> {salvando ? 'Salvando…' : 'Salvar'}
            </button>
            <button onClick={() => setEditando(false)} className="inline-flex items-center gap-1.5 border border-gray-300 text-sm rounded-lg px-3.5 py-2">
              <X size={15} /> Cancelar
            </button>
          </>
        )}
      </div>

      <div className="card-surface p-4 flex flex-wrap items-center gap-3 text-sm">
        <UserCog size={17} className="text-brand" />
        <span className="text-gray-600">Assinatura do rodapé:</span>
        <select value={assinaturaDb?.id ?? ''} onChange={(e) => escolherAssinatura(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5">
          {assinaturas.length === 0 && <option value="">{ASSINATURA_PADRAO.nome} — {ASSINATURA_PADRAO.cargo}</option>}
          {assinaturas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome} — {a.cargo}
              {a.setor ? ` (${a.setor})` : ''}
              {a.padrao ? ' ★' : ''}
            </option>
          ))}
        </select>
        <button onClick={() => setGerenciarAssinaturas((v) => !v)} className="text-brand underline text-xs">
          {gerenciarAssinaturas ? 'Fechar' : 'Gerenciar nomes, cargos e setores'}
        </button>
      </div>

      {gerenciarAssinaturas && (
        <div className="card-surface p-4 space-y-3">
          {assinaturas.map((a) => (
            <div key={a.id} className="flex items-center gap-3 text-sm border-b border-gray-50 pb-2">
              <span className="flex-1">
                <strong>{a.nome}</strong> · {a.cargo}
                {a.setor ? ` · ${a.setor}` : ''}
              </span>
              <button
                onClick={async () => {
                  await fetch('/api/legislacao/assinaturas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }) });
                  carregarAssinaturas();
                }}
                className={a.padrao ? 'text-accent' : 'text-gray-300 hover:text-accent'}
                title="Usar como padrão"
              >
                <Star size={16} fill={a.padrao ? 'currentColor' : 'none'} />
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Remover a assinatura de ${a.nome}?`)) return;
                  await fetch(`/api/legislacao/assinaturas?id=${a.id}`, { method: 'DELETE' });
                  carregarAssinaturas();
                }}
                className="text-gray-300 hover:text-red-600"
                title="Remover"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <div className="grid sm:grid-cols-4 gap-2">
            <input placeholder="Nome" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
            <input placeholder="Cargo" value={nova.cargo} onChange={(e) => setNova({ ...nova, cargo: e.target.value })} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
            <input placeholder="Setor (opcional)" value={nova.setor} onChange={(e) => setNova({ ...nova, setor: e.target.value })} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
            <button onClick={criarAssinatura} className="bg-brand text-white rounded-lg text-sm px-3 py-1.5">
              Adicionar
            </button>
          </div>
          {assinaturas.length === 0 && <p className="text-xs text-gray-400">Sem assinatura cadastrada, o comunicado sai com &quot;{ASSINATURA_PADRAO.nome} — {ASSINATURA_PADRAO.cargo}&quot;.</p>}
        </div>
      )}

      {editando && (
        <div className="card-surface p-4 grid md:grid-cols-2 gap-3 text-sm">
          {(['titulo', 'subtitulo', 'dataDestaqueRotulo', 'dataDestaque', 'fonte'] as const).map((k) => (
            <label key={k} className={k === 'subtitulo' || k === 'fonte' ? 'md:col-span-2' : ''}>
              <span className="text-xs text-gray-500">{{ titulo: 'Título', subtitulo: 'Frase de apoio', dataDestaqueRotulo: 'Rótulo da data em destaque', dataDestaque: 'Data em destaque', fonte: 'Fonte' }[k]}</span>
              <input value={rascunho[k]} onChange={(e) => setRascunho({ ...rascunho, [k]: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 mt-0.5" />
            </label>
          ))}
          {SECOES_LISTA.map(({ chave, rotulo }) => (
            <label key={chave}>
              <span className="text-xs text-gray-500">{rotulo}</span>
              <textarea
                rows={4}
                value={(rascunho[chave] as string[]).join('\n')}
                onChange={(e) => setRascunho({ ...rascunho, [chave]: e.target.value.split('\n') })}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 mt-0.5"
              />
            </label>
          ))}
        </div>
      )}

      <div ref={caixaRef} className="w-full rounded-2xl overflow-hidden shadow-card" style={{ height: altura || undefined }}>
        <div style={{ transform: `scale(${escala})`, transformOrigin: 'top left', width: 1080 }}>
          <ComunicadoVisual
            ref={nodeRef}
            comunicado={{ ...exibido, ...Object.fromEntries(SECOES_LISTA.map(({ chave }) => [chave, (exibido[chave] as string[]).filter((s) => s.trim())])) }}
            assinatura={assinatura}
            tipoDocumento={tipoDocumento}
            dataGeracao={dataGeracao}
          />
        </div>
      </div>
      <p className="text-xs text-gray-400 flex items-center gap-1">
        <Copy size={12} /> O PNG sai em 2160px de largura, nítido para WhatsApp, Teams, e-mail e apresentações.
      </p>
    </div>
  );
}
