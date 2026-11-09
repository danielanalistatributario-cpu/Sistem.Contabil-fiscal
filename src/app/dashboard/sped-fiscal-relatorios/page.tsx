'use client';

import { useMemo, useState } from 'react';
import { ImportHero } from '@/components/ImportHero';
import Importacao, { MAX_ARQUIVOS } from '@/components/sped-fiscal/Importacao';
import Painel, { type Analise } from '@/components/sped-fiscal/Painel';
import { lerEfdIcms } from '@/lib/efd-icms/parser';
import { marcarDuplicados, montarResumoMensal, validarConjunto } from '@/lib/efd-icms/consolidar';
import type { ArquivoEfd, ResumoMensal } from '@/lib/efd-icms/tipos';

const esperar = () => new Promise<void>((r) => setTimeout(r, 0));

export default function SpedFiscalRelatoriosPage() {
  const [arquivos, setArquivos] = useState<ArquivoEfd[]>([]);
  const [lendo, setLendo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const conjunto = useMemo(() => validarConjunto(arquivos), [arquivos]);

  async function adicionar(files: File[]) {
    setErro(null);
    const txt = files.filter((f) => /\.txt$/i.test(f.name));
    if (txt.length < files.length) setErro('Só arquivos .txt do SPED Fiscal foram considerados.');
    const novos: ArquivoEfd[] = [];
    for (const f of txt) {
      if (arquivos.some((a) => a.nomeArquivo === f.name && a.tamanho === f.size) || novos.some((a) => a.nomeArquivo === f.name)) continue;
      if (arquivos.length + novos.length >= MAX_ARQUIVOS) {
        setErro(`Máximo de ${MAX_ARQUIVOS} arquivos (janeiro a dezembro). Remova algum para adicionar outro.`);
        break;
      }
      setLendo(`Lendo ${f.name}…`);
      await esperar();
      try {
        // o SPED é gravado em Windows-1252 (acentos); depois do |9999| vem a assinatura digital em binário
        const texto = new TextDecoder('windows-1252').decode(await f.arrayBuffer());
        const arq = lerEfdIcms(texto, f.name);
        arq.tamanho = f.size;
        novos.push(arq);
      } catch {
        setErro(`Não foi possível ler "${f.name}".`);
      }
    }
    setLendo(null);
    if (novos.length) setArquivos((a) => [...a, ...novos]);
  }

  function processar() {
    setMensagem(null);
    const usados = conjunto.usados;
    marcarDuplicados(usados);
    const resumos = usados.map(montarResumoMensal);
    setAnalise({ resumos, arquivos: usados, conjunto });
  }

  async function salvar() {
    if (!analise) return;
    setSalvando(true);
    setMensagem(null);
    try {
      const res = await fetch('/api/sped-fiscal-relatorios/resumos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumos: analise.resumos }),
      });
      const corpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(corpo?.error || `Falha ao salvar (${res.status}).`);
      setMensagem(`Resumo de ${corpo.salvos} mês(es) salvo. Você poderá reabrir em "Análises salvas" sem reimportar os arquivos.`);
    } catch (e) {
      setMensagem(null);
      setErro(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  }

  function abrirSalvo(resumos: ResumoMensal[]) {
    if (resumos.length === 0) return;
    setMensagem(null);
    setAnalise({ resumos, arquivos: null, conjunto: null });
  }

  return (
    <div className="space-y-6">
      <ImportHero
        eyebrow="EFD ICMS/IPI"
        titleParts={['Relatórios do', { text: 'SPED Fiscal', accent: true }]}
        description="Importe 1 arquivo para a análise do mês ou até 12 para a análise anual: entradas, saídas e apuração do ICMS como no PVA, com consolidação, filtros, gráficos e exportação em PDF e Excel."
        badges={['Valores direto dos registros do SPED', 'Sem estimativas', 'Conferência com o E110', 'PDF e Excel']}
      />
      {erro && analise && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
      {analise ? (
        <Painel analise={analise} onSalvar={salvar} salvando={salvando} mensagem={mensagem} onVoltar={() => setAnalise(null)} />
      ) : (
        <Importacao
          arquivos={arquivos}
          conjunto={conjunto}
          lendo={lendo}
          erro={erro}
          onAdicionar={adicionar}
          onRemover={(a) => setArquivos((x) => x.filter((y) => y !== a))}
          onProcessar={processar}
          onAbrirSalvo={abrirSalvo}
        />
      )}
    </div>
  );
}
