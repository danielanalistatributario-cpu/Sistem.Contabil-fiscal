'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import * as XLSX from 'xlsx';
import { lerProdutosClassificacao } from '@/lib/analise-fiscal-produtos-import';

type NaturezaOperacao = 'LIVRE' | 'ISENTA' | 'TRIBUTADA' | 'TRANSFERENCIA';

type TesRow = {
  id: string;
  codigo: string;
  grupo: string;
  chaveNf: 'obrigatoria' | 'proibida' | 'livre';
  permiteProdutos: boolean;
  validarCfopUf: boolean;
  naturezaOperacao: NaturezaOperacao;
  naturezaOperacaoPisCofins: NaturezaOperacao;
};

type CnpjRow = { id: string; nome: string; cnpj: string; uf: string | null; aliquotaInterna: number | null };

type ProdutoRow = {
  id: string;
  codigoProduto: string;
  descricao: string;
  classificacao: 'ISENTO' | 'TRIBUTADO';
  classificacaoPisCofins: 'ISENTO' | 'TRIBUTADO' | null;
  ncm: string | null;
  observacao: string | null;
  aliquotaBeneficioInterna: number | null;
  aliquotaBeneficioInterestadual: number | null;
};

const CHAVE_NF_OPTIONS: TesRow['chaveNf'][] = ['obrigatoria', 'proibida', 'livre'];
const CHAVE_NF_LABELS: Record<TesRow['chaveNf'], string> = {
  obrigatoria: 'Obrigatória',
  proibida: 'Proibida',
  livre: 'Livre',
};

const NATUREZA_OPERACAO_OPTIONS: NaturezaOperacao[] = ['LIVRE', 'ISENTA', 'TRIBUTADA', 'TRANSFERENCIA'];
const NATUREZA_OPERACAO_LABELS: Record<NaturezaOperacao, string> = {
  LIVRE: 'Livre (sem cruzamento)',
  ISENTA: 'Isenta',
  TRIBUTADA: 'Tributada',
  TRANSFERENCIA: 'Transferência',
};

export default function AnaliseFiscalConfigPage() {
  const [tes, setTes] = useState<TesRow[]>([]);
  const [cnpjs, setCnpjs] = useState<CnpjRow[]>([]);
  const [erroTes, setErroTes] = useState<string | null>(null);
  const [erroCnpj, setErroCnpj] = useState<string | null>(null);

  const [novoCodigo, setNovoCodigo] = useState('');
  const [novoGrupo, setNovoGrupo] = useState('');
  const [novaChaveNf, setNovaChaveNf] = useState<TesRow['chaveNf']>('obrigatoria');
  const [novoPermiteProdutos, setNovoPermiteProdutos] = useState(true);
  const [novoValidarCfopUf, setNovoValidarCfopUf] = useState(true);
  const [novaNaturezaOperacao, setNovaNaturezaOperacao] = useState<NaturezaOperacao>('LIVRE');
  const [novaNaturezaOperacaoPisCofins, setNovaNaturezaOperacaoPisCofins] = useState<NaturezaOperacao>('LIVRE');

  const [novoNomeCnpj, setNovoNomeCnpj] = useState('');
  const [novoCnpj, setNovoCnpj] = useState('');
  const [novaUfCnpj, setNovaUfCnpj] = useState('');
  const [novaAliquotaCnpj, setNovaAliquotaCnpj] = useState('');

  const [produtos, setProdutos] = useState<ProdutoRow[]>([]);
  const [erroProduto, setErroProduto] = useState<string | null>(null);
  const [novoCodigoProduto, setNovoCodigoProduto] = useState('');
  const [novaDescricaoProduto, setNovaDescricaoProduto] = useState('');
  const [novaClassificacaoProduto, setNovaClassificacaoProduto] = useState<'ISENTO' | 'TRIBUTADO'>('TRIBUTADO');
  const [novaObservacaoProduto, setNovaObservacaoProduto] = useState('');
  const [novoNcmProduto, setNovoNcmProduto] = useState('');
  const [importando, setImportando] = useState(false);
  const [resultadoImportacao, setResultadoImportacao] = useState<string | null>(null);
  const [buscaProduto, setBuscaProduto] = useState('');
  const inputImportarRef = useRef<HTMLInputElement>(null);

  // Filial ativa é lida do seletor "Filial" no topo da aplicação (Topbar)
  // — esta tela não tem mais seletores próprios pra TES nem Produtos.
  const [currentEmpresaGrupoId, setCurrentEmpresaGrupoId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setCurrentEmpresaGrupoId(data.user?.currentEmpresaGrupoId ?? null);
      }
    })();
  }, []);

  // Só empresas com UF preenchida contam pra segregação — mesmo filtro
  // que o seletor "Filial" do Topbar já usa (carregarEmpresasGrupo no
  // backend).
  const empresasComUf = cnpjs.filter((c) => c.uf);

  // Filtro client-side por código ou descrição — a lista já vem inteira
  // da empresa selecionada (pode ter centenas/milhares de produtos), não
  // precisa de ida ao servidor pra buscar.
  const termoBusca = buscaProduto.trim().toLowerCase();
  const produtosFiltrados = termoBusca
    ? produtos.filter(
        (p) => p.codigoProduto.toLowerCase().includes(termoBusca) || p.descricao.toLowerCase().includes(termoBusca)
      )
    : produtos;

  const carregarTes = useCallback(async () => {
    const res = await fetch('/api/analise-fiscal/config/tes');
    if (res.ok) {
      const data = await res.json();
      setTes(data.tes);
    }
  }, []);

  const carregarCnpjs = useCallback(async () => {
    const res = await fetch('/api/analise-fiscal/config/cnpjs-grupo');
    if (res.ok) {
      const data = await res.json();
      setCnpjs(data.cnpjs);
    }
  }, []);

  const carregarProdutos = useCallback(async () => {
    const res = await fetch('/api/analise-fiscal/config/produtos');
    if (res.ok) {
      const data = await res.json();
      setProdutos(data.produtos);
    }
  }, []);

  useEffect(() => {
    carregarCnpjs();
  }, [carregarCnpjs]);

  // Cadastro de TES e Produtos 100% independente por empresa (não é
  // "geral + exceções") — recarrega sempre que a filial ativa (seletor
  // "Filial" no Topbar) muda. Sem filial (tenant sem empresa do grupo
  // cadastrada), devolve o cadastro geral, igual ao comportamento de
  // antes desta segregação existir.
  useEffect(() => {
    carregarTes();
  }, [carregarTes, currentEmpresaGrupoId]);

  useEffect(() => {
    carregarProdutos();
    setBuscaProduto('');
  }, [carregarProdutos, currentEmpresaGrupoId]);

  async function handleAddTes(e: React.FormEvent) {
    e.preventDefault();
    setErroTes(null);
    const res = await fetch('/api/analise-fiscal/config/tes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo: novoCodigo,
        grupo: novoGrupo,
        chaveNf: novaChaveNf,
        permiteProdutos: novoPermiteProdutos,
        validarCfopUf: novoValidarCfopUf,
        naturezaOperacao: novaNaturezaOperacao,
        naturezaOperacaoPisCofins: novaNaturezaOperacaoPisCofins,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErroTes(data.error || 'Erro ao cadastrar TES.');
      return;
    }
    setNovoCodigo('');
    setNovoGrupo('');
    setNovaChaveNf('obrigatoria');
    setNovoPermiteProdutos(true);
    setNovoValidarCfopUf(true);
    setNovaNaturezaOperacao('LIVRE');
    setNovaNaturezaOperacaoPisCofins('LIVRE');
    carregarTes();
  }

  async function handleEditTes(id: string, campo: 'grupo' | 'chaveNf' | 'permiteProdutos' | 'validarCfopUf' | 'naturezaOperacao' | 'naturezaOperacaoPisCofins', valor: string | boolean) {
    await fetch(`/api/analise-fiscal/config/tes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [campo]: valor }),
    });
    carregarTes();
  }

  async function handleRemoveTes(id: string, codigo: string) {
    if (!confirm(`Excluir a TES ${codigo}? Ela voltará a aparecer como "TES nova" na próxima apuração.`)) return;
    await fetch(`/api/analise-fiscal/config/tes/${id}`, { method: 'DELETE' });
    carregarTes();
  }

  async function handleAddCnpj(e: React.FormEvent) {
    e.preventDefault();
    setErroCnpj(null);
    const res = await fetch('/api/analise-fiscal/config/cnpjs-grupo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: novoNomeCnpj,
        cnpj: novoCnpj,
        uf: novaUfCnpj || undefined,
        aliquotaInterna: novaAliquotaCnpj ? parseFloat(novaAliquotaCnpj) / 100 : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErroCnpj(data.error || 'Erro ao cadastrar CNPJ.');
      return;
    }
    setNovoNomeCnpj('');
    setNovoCnpj('');
    setNovaUfCnpj('');
    setNovaAliquotaCnpj('');
    carregarCnpjs();
  }

  async function handleEditCnpj(id: string, campo: 'uf' | 'aliquotaInterna', valor: string) {
    const payload = campo === 'aliquotaInterna'
      ? { aliquotaInterna: valor ? parseFloat(valor) / 100 : null }
      : { uf: valor || null };
    await fetch(`/api/analise-fiscal/config/cnpjs-grupo/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    carregarCnpjs();
  }

  async function handleRemoveCnpj(id: string, nome: string) {
    if (!confirm(`Remover "${nome}" da lista de CNPJs do grupo?`)) return;
    await fetch(`/api/analise-fiscal/config/cnpjs-grupo/${id}`, { method: 'DELETE' });
    carregarCnpjs();
  }

  async function handleAddProduto(e: React.FormEvent) {
    e.preventDefault();
    setErroProduto(null);
    const res = await fetch('/api/analise-fiscal/config/produtos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigoProduto: novoCodigoProduto,
        descricao: novaDescricaoProduto,
        classificacao: novaClassificacaoProduto,
        observacao: novaObservacaoProduto || undefined,
        ncm: novoNcmProduto || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErroProduto(data.error || 'Erro ao cadastrar produto.');
      return;
    }
    setNovoCodigoProduto('');
    setNovaDescricaoProduto('');
    setNovaClassificacaoProduto('TRIBUTADO');
    setNovaObservacaoProduto('');
    setNovoNcmProduto('');
    carregarProdutos();
  }

  async function handleEditProduto(
    id: string,
    campo: 'classificacao' | 'classificacaoPisCofins' | 'observacao' | 'ncm' | 'aliquotaBeneficioInterna' | 'aliquotaBeneficioInterestadual',
    valor: string
  ) {
    const ehAliquota = campo === 'aliquotaBeneficioInterna' || campo === 'aliquotaBeneficioInterestadual';
    const ehOpcionalTexto = campo === 'classificacaoPisCofins' || campo === 'ncm';
    const payload = ehAliquota
      ? { [campo]: valor ? parseFloat(valor) / 100 : null }
      : { [campo]: ehOpcionalTexto && !valor ? null : valor };
    await fetch(`/api/analise-fiscal/config/produtos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    carregarProdutos();
  }

  async function handleRemoveProduto(id: string, descricao: string) {
    if (!confirm(`Remover "${descricao}" da lista de produtos classificados?`)) return;
    await fetch(`/api/analise-fiscal/config/produtos/${id}`, { method: 'DELETE' });
    carregarProdutos();
  }

  async function handleImportarProdutos(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (empresasComUf.length > 0 && !currentEmpresaGrupoId) {
      setErroProduto('Selecione a filial no topo da tela para importar os produtos.');
      if (inputImportarRef.current) inputImportarRef.current.value = '';
      return;
    }
    setErroProduto(null);
    setResultadoImportacao(null);
    setImportando(true);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }) as unknown[][];
      const leitura = lerProdutosClassificacao(aoa);
      if (leitura.erro) {
        setErroProduto(leitura.erro);
        setImportando(false);
        if (inputImportarRef.current) inputImportarRef.current.value = '';
        return;
      }
      if (leitura.produtos.length === 0) {
        setErroProduto('Nenhuma linha válida encontrada na planilha.');
        setImportando(false);
        if (inputImportarRef.current) inputImportarRef.current.value = '';
        return;
      }

      const res = await fetch('/api/analise-fiscal/config/produtos/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produtos: leitura.produtos }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErroProduto(data.error || 'Erro ao importar produtos.');
        setImportando(false);
        if (inputImportarRef.current) inputImportarRef.current.value = '';
        return;
      }

      const partes = [`${data.criados} cadastrado(s)`, `${data.atualizados} atualizado(s)`];
      if (data.invalidos > 0) partes.push(`${data.invalidos} linha(s) inválida(s) ignorada(s)`);
      if (leitura.ignoradas.length > 0) partes.push(`${leitura.ignoradas.length} linha(s) sem código/descrição/classificação ignorada(s) na leitura`);
      setResultadoImportacao(partes.join(' · '));
      carregarProdutos();
    } catch (err) {
      setErroProduto('Não foi possível ler o arquivo. Verifique se é um .xlsx/.csv válido.');
      console.error(err);
    } finally {
      setImportando(false);
      if (inputImportarRef.current) inputImportarRef.current.value = '';
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/analise-fiscal" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors mb-2 w-fit">
          <ArrowLeft size={15} />
          Voltar
        </Link>
        <h1 className="text-2xl font-display font-semibold text-brand">Configurar Análise Fiscal</h1>
        <p className="text-gray-500 text-sm mt-1">
          Listas de referência usadas pelo motor de regras — cadastre uma TES nova para que ela pare de aparecer como
          &quot;TES nova&quot; e ganhe as checagens de Chave NF e produto. A lógica de regras profundas (cálculo de
          imposto, alíquota etc.) continua sendo implementada por código, não por aqui — para consultar o que cada
          regra valida, veja{' '}
          <Link href="/dashboard/analise-fiscal/regras" className="text-brand underline">Regras da Análise e Apuração Fiscal</Link>.
        </p>
      </div>

      <div className="card-surface p-5 space-y-4">
        <h2 className="font-display font-semibold text-brand">TES cadastradas</h2>
        {empresasComUf.length > 0 && (
          <p className="text-xs text-gray-500">
            Cadastro de TES 100% independente por empresa — o mesmo código pode significar coisas diferentes entre
            filiais (ex: uma TES de devolução numa empresa e de baixa de estoque noutra), então cada empresa tem sua
            própria lista completa, sem herdar nada de outra. A empresa é a selecionada no seletor &quot;Filial&quot;
            no topo da tela.
          </p>
        )}

        {empresasComUf.length > 0 && !currentEmpresaGrupoId ? (
          <p className="text-sm text-gray-400 text-center py-6 bg-gray-50 border border-gray-100 rounded-lg">
            Selecione a filial no topo da tela para ver ou cadastrar as TES dela.
          </p>
        ) : (
          <>
        <form onSubmit={handleAddTes} className="flex flex-wrap items-end gap-3 border-b border-gray-100 pb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Código</label>
            <input
              value={novoCodigo}
              onChange={(e) => setNovoCodigo(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-24"
              placeholder="ex: 146"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Grupo / rótulo</label>
            <input
              value={novoGrupo}
              onChange={(e) => setNovoGrupo(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-56"
              placeholder="ex: Serviços retenção IR/CSRF"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Chave NF</label>
            <select
              value={novaChaveNf}
              onChange={(e) => setNovaChaveNf(e.target.value as TesRow['chaveNf'])}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            >
              {CHAVE_NF_OPTIONS.map((c) => (
                <option key={c} value={c}>{CHAVE_NF_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 pb-2">
            <input type="checkbox" checked={novoPermiteProdutos} onChange={(e) => setNovoPermiteProdutos(e.target.checked)} />
            Permite produtos
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 pb-2">
            <input type="checkbox" checked={novoValidarCfopUf} onChange={(e) => setNovoValidarCfopUf(e.target.checked)} />
            Valida CFOP×UF
          </label>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Natureza da operação (ICMS)</label>
            <select
              value={novaNaturezaOperacao}
              onChange={(e) => setNovaNaturezaOperacao(e.target.value as NaturezaOperacao)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            >
              {NATUREZA_OPERACAO_OPTIONS.map((n) => (
                <option key={n} value={n}>{NATUREZA_OPERACAO_LABELS[n]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Natureza PIS/COFINS</label>
            <select
              value={novaNaturezaOperacaoPisCofins}
              onChange={(e) => setNovaNaturezaOperacaoPisCofins(e.target.value as NaturezaOperacao)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            >
              {NATUREZA_OPERACAO_OPTIONS.map((n) => (
                <option key={n} value={n}>{NATUREZA_OPERACAO_LABELS[n]}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium">
            + Cadastrar TES
          </button>
          {erroTes && <p className="text-sm text-red-600 w-full">{erroTes}</p>}
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="py-2 pr-3">Código</th>
                <th className="py-2 pr-3">Grupo / rótulo</th>
                <th className="py-2 pr-3">Chave NF</th>
                <th className="py-2 pr-3">Permite produtos</th>
                <th className="py-2 pr-3">Valida CFOP×UF</th>
                <th className="py-2 pr-3">Natureza da operação (ICMS)</th>
                <th className="py-2 pr-3">Natureza PIS/COFINS</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {tes.map((t) => (
                <tr key={t.id} className="border-b border-gray-50">
                  <td className="py-2 pr-3 font-mono">{t.codigo}</td>
                  <td className="py-2 pr-3">
                    <input
                      defaultValue={t.grupo}
                      onBlur={(e) => e.target.value !== t.grupo && handleEditTes(t.id, 'grupo', e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-56"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      value={t.chaveNf}
                      onChange={(e) => handleEditTes(t.id, 'chaveNf', e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
                    >
                      {CHAVE_NF_OPTIONS.map((c) => (
                        <option key={c} value={c}>{CHAVE_NF_LABELS[c]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={t.permiteProdutos}
                      onChange={(e) => handleEditTes(t.id, 'permiteProdutos', e.target.checked)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={t.validarCfopUf}
                      onChange={(e) => handleEditTes(t.id, 'validarCfopUf', e.target.checked)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      value={t.naturezaOperacao}
                      onChange={(e) => handleEditTes(t.id, 'naturezaOperacao', e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
                    >
                      {NATUREZA_OPERACAO_OPTIONS.map((n) => (
                        <option key={n} value={n}>{NATUREZA_OPERACAO_LABELS[n]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      value={t.naturezaOperacaoPisCofins}
                      onChange={(e) => handleEditTes(t.id, 'naturezaOperacaoPisCofins', e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
                    >
                      {NATUREZA_OPERACAO_OPTIONS.map((n) => (
                        <option key={n} value={n}>{NATUREZA_OPERACAO_LABELS[n]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <button onClick={() => handleRemoveTes(t.id, t.codigo)} className="text-xs text-red-500 underline">
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tes.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Carregando...</p>}
        </div>
          </>
        )}
      </div>

      <div className="card-surface p-5 space-y-4">
        <h2 className="font-display font-semibold text-brand">Empresas / CNPJs do grupo</h2>
        <p className="text-xs text-gray-500">
          Duas funções: (1) valida o fornecedor/remetente da TES 138 (transferência entre filiais) — enquanto a lista
          estiver vazia, essa checagem fica desligada; (2) alimenta o seletor &quot;Empresa a ser analisada&quot; nas
          telas de Análise de Entradas/Saídas — só empresas com UF preenchida aparecem lá. Alíquota interna é
          opcional: sem ela, a análise dessa empresa usa a alíquota padrão da empresa (Configurações Fiscais).
        </p>

        <form onSubmit={handleAddCnpj} className="flex flex-wrap items-end gap-3 border-b border-gray-100 pb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nome</label>
            <input
              value={novoNomeCnpj}
              onChange={(e) => setNovoNomeCnpj(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-56"
              placeholder="ex: Fortfruit Castanhal"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">CNPJ</label>
            <input
              value={novoCnpj}
              onChange={(e) => setNovoCnpj(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-48"
              placeholder="00.000.000/0000-00"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">UF</label>
            <input
              value={novaUfCnpj}
              onChange={(e) => setNovaUfCnpj(e.target.value.toUpperCase())}
              maxLength={2}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-16"
              placeholder="PA"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Alíquota interna (%)</label>
            <input
              type="number"
              step="0.01"
              value={novaAliquotaCnpj}
              onChange={(e) => setNovaAliquotaCnpj(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-24"
              placeholder="opcional"
            />
          </div>
          <button type="submit" className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium">
            + Adicionar empresa
          </button>
          {erroCnpj && <p className="text-sm text-red-600 w-full">{erroCnpj}</p>}
        </form>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="py-2 pr-3">Nome</th>
              <th className="py-2 pr-3">CNPJ</th>
              <th className="py-2 pr-3">UF</th>
              <th className="py-2 pr-3">Alíquota interna</th>
              <th className="py-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {cnpjs.map((c) => (
              <tr key={c.id} className="border-b border-gray-50">
                <td className="py-2 pr-3">{c.nome}</td>
                <td className="py-2 pr-3 font-mono">{c.cnpj}</td>
                <td className="py-2 pr-3">
                  <input
                    defaultValue={c.uf || ''}
                    onBlur={(e) => {
                      const v = e.target.value.toUpperCase();
                      if (v !== (c.uf || '')) handleEditCnpj(c.id, 'uf', v);
                    }}
                    maxLength={2}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-14 uppercase"
                    placeholder="—"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={c.aliquotaInterna != null ? (c.aliquotaInterna * 100).toString() : ''}
                    onBlur={(e) => {
                      const atual = c.aliquotaInterna != null ? (c.aliquotaInterna * 100).toString() : '';
                      if (e.target.value !== atual) handleEditCnpj(c.id, 'aliquotaInterna', e.target.value);
                    }}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-20"
                    placeholder="padrão"
                  />
                </td>
                <td className="py-2 pr-3">
                  <button onClick={() => handleRemoveCnpj(c.id, c.nome)} className="text-xs text-red-500 underline">
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {cnpjs.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Nenhuma empresa cadastrada ainda.</p>}
      </div>

      <div className="card-surface p-5 space-y-4">
        <h2 className="font-display font-semibold text-brand">Produtos com classificação tributária</h2>
        <p className="text-xs text-gray-500">
          Cadastre aqui produtos cuja classificação (isento ou tributado) precisa ser conferida contra a TES lançada
          — ex: um produto tributado que apareceu numa TES marcada como &quot;Isenta&quot; (ver coluna &quot;Natureza
          da operação&quot; na tabela de TES acima). Enquanto um produto não estiver cadastrado aqui, essa checagem
          não roda pra ele. {empresasComUf.length > 0 && 'O cadastro é segregado por empresa — cada empresa tem sua própria lista, totalmente independente das demais, e a análise usa automaticamente a lista da filial selecionada no topo da tela.'}{' '}
          As colunas de benefício (opcionais) são pra produtos com redução de base de cálculo/alíquota reduzida
          (ex: Convênio ICMS) — quando preenchidas as duas, a alíquota de ICMS esperada passa a ser essa, em vez da
          alíquota interna padrão/tabela interestadual, só pra esse produto.
        </p>

        {empresasComUf.length > 0 && !currentEmpresaGrupoId ? (
          <p className="text-sm text-gray-400 text-center py-6 bg-gray-50 border border-gray-100 rounded-lg">
            Selecione a filial no topo da tela para ver, cadastrar ou importar os produtos dela.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Importar planilha (muitos produtos de uma vez)</label>
                <input
                  ref={inputImportarRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImportarProdutos}
                  disabled={importando}
                  className="text-sm"
                />
              </div>
              <p className="text-[11px] text-gray-400 flex-1 min-w-[220px]">
                Colunas esperadas: <strong>Código do Produto</strong>, <strong>Descrição</strong> e{' '}
                <strong>Classificação</strong> (Isento ou Tributado) — nomes parecidos são reconhecidos automaticamente.
                Produto já cadastrado (pra essa empresa) é atualizado; produto novo é criado.
              </p>
              {importando && <span className="text-xs text-gray-500">Importando...</span>}
            </div>
            {resultadoImportacao && <p className="text-xs text-teal">{resultadoImportacao}</p>}

            <div>
              <label className="block text-xs text-gray-500 mb-1">Pesquisar produto cadastrado (código ou descrição)</label>
              <input
                value={buscaProduto}
                onChange={(e) => setBuscaProduto(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-72"
                placeholder="ex: 229.009 ou MORANGO"
              />
            </div>

            <form onSubmit={handleAddProduto} className="flex flex-wrap items-end gap-3 border-b border-gray-100 pb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Código do produto</label>
                <input
                  value={novoCodigoProduto}
                  onChange={(e) => setNovoCodigoProduto(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-32"
                  placeholder="ex: 229.009"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Descrição</label>
                <input
                  value={novaDescricaoProduto}
                  onChange={(e) => setNovaDescricaoProduto(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-56"
                  placeholder="ex: MORANGO"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Classificação</label>
                <select
                  value={novaClassificacaoProduto}
                  onChange={(e) => setNovaClassificacaoProduto(e.target.value as 'ISENTO' | 'TRIBUTADO')}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                >
                  <option value="TRIBUTADO">Tributado</option>
                  <option value="ISENTO">Isento</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">NCM (opcional)</label>
                <input
                  value={novoNcmProduto}
                  onChange={(e) => setNovoNcmProduto(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-28"
                  placeholder="ex: 0803.10.10"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Observação (opcional)</label>
                <input
                  value={novaObservacaoProduto}
                  onChange={(e) => setNovaObservacaoProduto(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-56"
                  placeholder="ex: Convênio ICMS..."
                />
              </div>
              <button type="submit" className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium">
                + Cadastrar produto
              </button>
              {erroProduto && <p className="text-sm text-red-600 w-full">{erroProduto}</p>}
            </form>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="py-2 pr-3">Código</th>
                  <th className="py-2 pr-3">Descrição</th>
                  <th className="py-2 pr-3">Classificação ICMS</th>
                  <th className="py-2 pr-3">Classificação PIS/COFINS</th>
                  <th className="py-2 pr-3">NCM</th>
                  <th className="py-2 pr-3">Observação</th>
                  <th className="py-2 pr-3">Benefício interna (%)</th>
                  <th className="py-2 pr-3">Benefício interestadual (%)</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {produtosFiltrados.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50">
                    <td className="py-2 pr-3 font-mono">{p.codigoProduto}</td>
                    <td className="py-2 pr-3">{p.descricao}</td>
                    <td className="py-2 pr-3">
                      <select
                        value={p.classificacao}
                        onChange={(e) => handleEditProduto(p.id, 'classificacao', e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
                      >
                        <option value="TRIBUTADO">Tributado</option>
                        <option value="ISENTO">Isento</option>
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={p.classificacaoPisCofins || ''}
                        onChange={(e) => handleEditProduto(p.id, 'classificacaoPisCofins', e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
                      >
                        <option value="">— não classificado —</option>
                        <option value="TRIBUTADO">Tributado</option>
                        <option value="ISENTO">Isento</option>
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        defaultValue={p.ncm || ''}
                        onBlur={(e) => e.target.value !== (p.ncm || '') && handleEditProduto(p.id, 'ncm', e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-24 font-mono"
                        placeholder="—"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        defaultValue={p.observacao || ''}
                        onBlur={(e) => e.target.value !== (p.observacao || '') && handleEditProduto(p.id, 'observacao', e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-48"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={p.aliquotaBeneficioInterna != null ? (p.aliquotaBeneficioInterna * 100).toString() : ''}
                        onBlur={(e) => {
                          const atual = p.aliquotaBeneficioInterna != null ? (p.aliquotaBeneficioInterna * 100).toString() : '';
                          if (e.target.value !== atual) handleEditProduto(p.id, 'aliquotaBeneficioInterna', e.target.value);
                        }}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-20"
                        placeholder="—"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={p.aliquotaBeneficioInterestadual != null ? (p.aliquotaBeneficioInterestadual * 100).toString() : ''}
                        onBlur={(e) => {
                          const atual = p.aliquotaBeneficioInterestadual != null ? (p.aliquotaBeneficioInterestadual * 100).toString() : '';
                          if (e.target.value !== atual) handleEditProduto(p.id, 'aliquotaBeneficioInterestadual', e.target.value);
                        }}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-20"
                        placeholder="—"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <button onClick={() => handleRemoveProduto(p.id, p.descricao)} className="text-xs text-red-500 underline">
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {produtos.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Nenhum produto cadastrado ainda.</p>}
            {produtos.length > 0 && produtosFiltrados.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">Nenhum produto encontrado para &quot;{buscaProduto}&quot;.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
