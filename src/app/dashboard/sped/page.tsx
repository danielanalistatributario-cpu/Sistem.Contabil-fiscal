'use client';

import { useState, useMemo, useRef, useEffect, type ReactNode } from 'react';
import * as XLSX from 'xlsx';
import { ImportHero, ImportTrustNote } from '@/components/ImportHero';
import { BLOCO_DESCRICOES, parseSpedFiscal, type TipoSped, type SpedLine, type NotaSaida } from '@/lib/sped-parser';
import { buildRelatorioNFeRows } from '@/lib/sped-nfe-report';
import { gerarRelatorioNFeExcel } from '@/lib/sped-nfe-excel';
import { mapearSpedParaItensTributo } from '@/lib/sped-excel-tributos';
import { mapearFreteContribuicoesParaItensTributo } from '@/lib/sped-frete-contribuicoes';
import { mapearC175ParaItensTributo } from '@/lib/sped-c175-contribuicoes';
import { gerarExcelTributos, COLUNAS_PLANILHA_TRIBUTOS, COLUNAS_PLANILHA_TRIBUTOS_PADRAO, COLUNAS_PLANILHA_TRIBUTOS_EXTRAS } from '@/lib/analise-fiscal-excel-tributos';
import { analisarNumeracaoSaida, extrairFaixasNumeracao, COD_MOD_LABELS, STATUS_SF3_LABELS } from '@/lib/sped-numeracao';
import { lerSituacaoNotasSf3, construirMapaSf3, CSTAT_LABELS, type NotaSf3 } from '@/lib/sf3-situacao-reader';

type NotaRetornoDiferente = {
  modelo: string;
  modeloLabel: string;
  serie: string;
  numero: number;
  cStat: string;
  chave: string | null;
  dataEmissao: string | null;
  dataCancelamento: string | null;
};

type UploadResult = {
  spedFileId: string;
  fileName: string;
  competencia: string | null;
  competenciaInicio: string | null;
  competenciaFim: string | null;
  nomeEmpresa: string | null;
  cnpjEmpresa: string | null;
  totalLinhas: number;
  porBloco: Record<string, number>;
  porRegistro: Record<string, number>;
  tipoSped: TipoSped;
  linhas: SpedLine[];
  notasSaida: NotaSaida[];
  notasSaidaCriticadas: NotaSaida[];
};

const TIPO_SPED_LABELS: Record<TipoSped, string> = {
  icms_ipi: 'EFD ICMS/IPI',
  contribuicoes: 'EFD Contribuições (PIS/COFINS)',
  desconhecido: 'Não identificado',
};

// Formata uma data AAAAMMDD (formato de F3_EMISSAO/dataEmissao vindo do
// Protheus — já convertido a partir do DDMMAAAA do SPED em
// sped-parser.ts) pra exibição DD/MM/AAAA.
function fmtDataYyyymmdd(v: string | null): string {
  if (!v || v.length !== 8) return '—';
  return `${v.slice(6, 8)}/${v.slice(4, 6)}/${v.slice(0, 4)}`;
}

// Botão de filtro (chip) dos cards de análise — ativo = preenchido.
function BotaoFiltro({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-3 py-1 rounded-full border whitespace-nowrap transition-colors ${
        ativo ? 'bg-brand text-white border-brand' : 'bg-white border-gray-300 text-gray-600 hover:border-brand'
      }`}
    >
      {children}
    </button>
  );
}

export default function SpedPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [filtroRegistro, setFiltroRegistro] = useState<string>('TODOS');
  const [filtroBloco, setFiltroBloco] = useState<string>('TODOS');
  const [gerandoRelatorioModelo, setGerandoRelatorioModelo] = useState(false);
  const [erroRelatorioModelo, setErroRelatorioModelo] = useState<string | null>(null);
  const [gerandoExcelTributos, setGerandoExcelTributos] = useState(false);
  const [erroExcelTributos, setErroExcelTributos] = useState<string | null>(null);
  // Colunas escolhidas pro export da Planilha ICMS/PIS/COFINS (layout
  // original por padrão; as "adicionais do SPED" — CNPJ/CPF, Fornecedor etc.
  // — começam desmarcadas). A escolha fica lembrada neste navegador.
  const [colunasTributos, setColunasTributos] = useState<string[]>(COLUNAS_PLANILHA_TRIBUTOS_PADRAO);
  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem('sped-colunas-tributos') || 'null');
      if (Array.isArray(salvo)) {
        const validas = salvo.filter((c: unknown): c is string => typeof c === 'string' && COLUNAS_PLANILHA_TRIBUTOS.includes(c));
        if (validas.length > 0) setColunasTributos(validas);
      }
    } catch {
      // sem localStorage (janela privada etc.) — segue com todas marcadas
    }
  }, []);
  function alterarColunasTributos(novas: string[]) {
    setColunasTributos(novas);
    try {
      localStorage.setItem('sped-colunas-tributos', JSON.stringify(novas));
    } catch {
      // ignora
    }
  }
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Segunda fonte opcional pra Análise de Numeração — planilha "SF3" do
  // Protheus (ou equivalente), usada só pra reclassificar números "Não
  // localizados" quando o SPED não trouxe a situação real (ver
  // sped-numeracao.ts). Nada aqui depende do arquivo SPED já ter sido
  // importado — pode selecionar os dois em qualquer ordem.
  const [sf3File, setSf3File] = useState<File | null>(null);
  const [sf3Notas, setSf3Notas] = useState<NotaSf3[]>([]);
  const [erroSf3, setErroSf3] = useState<string | null>(null);
  const [lendoSf3, setLendoSf3] = useState(false);
  const sf3InputRef = useRef<HTMLInputElement>(null);

  // Mesma segunda fonte, só que sincronizada automaticamente do Protheus
  // (tabela SF3, ver scripts/sync-situacao-notas-protheus.ts) — carregada
  // sozinha, sem precisar de upload nenhum, assim que o SPED é importado.
  // Quando o usuário também anexa a planilha manual, as duas se somam (a
  // manual tem prioridade em caso de conflito — ver mapaSf3 abaixo).
  const [sf3NotasProtheus, setSf3NotasProtheus] = useState<NotaSf3[]>([]);
  const [sf3UltimaSincronizacao, setSf3UltimaSincronizacao] = useState<string | null>(null);
  // Cobertura da sincronização (AAAAMMDD do início da janela): sem ela,
  // "Não encontrado no SF3" seria afirmado sobre períodos que nunca
  // foram sincronizados.
  const [sf3Sincronizado, setSf3Sincronizado] = useState(false);
  const [sf3Desde, setSf3Desde] = useState<string | null>(null);

  // Só busca depois do SPED importado, e só o intervalo mín-máx de
  // número que o próprio arquivo definiu (extrairFaixasNumeracao) — a
  // sincronização guarda até 3 anos de histórico, mas a busca pra uma
  // análise de um mês não deve trazer os outros anos inteiros (pedido
  // explícito do usuário). Manda o CNPJ do registro 0000 do próprio
  // arquivo pra rota resolver a empresa/filial certa — esta tela não
  // tem seletor de "Filial" próprio, e o seletor global do Topbar pode
  // estar numa filial diferente da do arquivo importado (achado real,
  // 01/10/2026: usuário com Matriz selecionada importou SPED da
  // Passarela, e o cruzamento buscava no lugar errado).
  useEffect(() => {
    if (!result) {
      setSf3NotasProtheus([]);
      setSf3UltimaSincronizacao(null);
      setSf3Sincronizado(false);
      setSf3Desde(null);
      return;
    }
    const faixas = extrairFaixasNumeracao(result.notasSaida);
    if (faixas.length === 0) return;
    (async () => {
      const res = await fetch('/api/sped/situacao-notas-protheus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faixas, cnpjEmpresa: result.cnpjEmpresa }),
      });
      if (res.ok) {
        const data = await res.json();
        setSf3NotasProtheus(data.notas || []);
        setSf3UltimaSincronizacao(data.ultimaSincronizacao || null);
        setSf3Sincronizado(!!data.sincronizado);
        setSf3Desde(data.desde || null);
      }
    })();
  }, [result]);

  // Relatório à parte, pedido explícito do usuário: toda nota (NF-e ou
  // NFC-e) com "Retorno SEFA" (F3_CODRSEF/cStat) diferente de 100
  // (Autorizado), direto da SF3, dentro da COMPETÊNCIA do arquivo
  // (data de emissão, não intervalo de número) — diferente da Análise
  // de Numeração, que só mostra números "não localizados" no SPED.
  const [notasRetornoDiferente, setNotasRetornoDiferente] = useState<NotaRetornoDiferente[]>([]);
  useEffect(() => {
    if (!result || !result.competenciaInicio || !result.competenciaFim) {
      setNotasRetornoDiferente([]);
      return;
    }
    (async () => {
      const res = await fetch('/api/sped/notas-retorno-diferente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competenciaInicio: result.competenciaInicio,
          competenciaFim: result.competenciaFim,
          cnpjEmpresa: result.cnpjEmpresa,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotasRetornoDiferente(data.notas || []);
      }
    })();
  }, [result]);

  async function handleSelecionarSf3(f: File | null) {
    setSf3File(f);
    setErroSf3(null);
    setSf3Notas([]);
    if (!f) return;
    setLendoSf3(true);
    try {
      const buffer = await f.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }) as unknown[][];
      const leitura = lerSituacaoNotasSf3(aoa);
      if (leitura.erro) {
        setErroSf3(leitura.erro);
        return;
      }
      if (leitura.notas.length === 0) {
        setErroSf3('Nenhuma linha válida encontrada na planilha.');
        return;
      }
      setSf3Notas(leitura.notas);
    } catch {
      setErroSf3('Não foi possível ler o arquivo. Verifique se é um .xlsx/.csv válido.');
    } finally {
      setLendoSf3(false);
    }
  }

  function baixarBlob(buffer: Uint8Array, nomeArquivo: string) {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // Leitura, cálculo e montagem do .xlsx rodam inteiramente aqui no
  // navegador — um EFD Contribuições real já passou dos ~4,5MB que a
  // Vercel aceita de corpo de requisição, então o arquivo nunca é
  // enviado ao servidor (nem o resultado calculado, que fica ainda
  // maior em JSON). A rota chamada depois só registra a atividade.
  async function handleGerarRelatorioModelo() {
    if (!file) return;
    setGerandoRelatorioModelo(true);
    setErroRelatorioModelo(null);

    try {
      const texto = await file.text();
      const rows = buildRelatorioNFeRows(texto);
      if (rows.length === 0) {
        setErroRelatorioModelo('Nenhum item de nota fiscal (registros C100/C170) foi encontrado no arquivo.');
        return;
      }
      const buffer = await gerarRelatorioNFeExcel(rows);
      baixarBlob(buffer, `NFe_Entrada_Saida_${file.name.replace(/\.[^.]+$/, '')}.xlsx`);

      fetch('/api/sped/relatorio-nfe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, totalLinhas: rows.length }),
      }).catch(() => {});
    } catch {
      setErroRelatorioModelo('Falha ao gerar o relatório.');
    } finally {
      setGerandoRelatorioModelo(false);
    }
  }

  async function handleGerarExcelTributos() {
    if (!file) return;
    setGerandoExcelTributos(true);
    setErroExcelTributos(null);

    try {
      const texto = await file.text();
      const rows = buildRelatorioNFeRows(texto);
      // Fretes (CT-e: D100/D101/D105) do EFD Contribuições também têm crédito
      // de PIS/COFINS (ex: CST 53) e entram na planilha, depois dos itens.
      const fretes = mapearFreteContribuicoesParaItensTributo(texto);
      // NFC-e analítica (C175) sem C170 — também carrega PIS/COFINS (ex: CST 01).
      const analiticos = mapearC175ParaItensTributo(texto);
      if (rows.length === 0 && fretes.length === 0 && analiticos.length === 0) {
        setErroExcelTributos('Nenhum item de nota fiscal (registros C100/C170, C175 ou D100/D101/D105) foi encontrado no arquivo.');
        return;
      }
      const itens = [...mapearSpedParaItensTributo(rows), ...analiticos, ...fretes];
      const buffer = await gerarExcelTributos(itens, 'ICMS-PIS-COFINS', colunasTributos);
      baixarBlob(buffer, `ICMS_PIS_COFINS_SPED_${file.name.replace(/\.[^.]+$/, '')}.xlsx`);

      fetch('/api/sped/excel-tributos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, totalLinhas: itens.length }),
      }).catch(() => {});
    } catch {
      setErroExcelTributos('Falha ao gerar a planilha.');
    } finally {
      setGerandoExcelTributos(false);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const texto = await file.text();
      if (!texto.trim()) {
        setError('Arquivo vazio ou ilegível.');
        return;
      }
      const resumo = parseSpedFiscal(texto);

      const res = await fetch('/api/sped/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          competencia: resumo.competencia,
          nomeEmpresa: resumo.nomeEmpresa,
          totalLinhas: resumo.totalLinhas,
          porBloco: resumo.porBloco,
          porRegistro: resumo.porRegistro,
          tipoSped: resumo.tipoSped,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        setError((data && data.error) || `Falha ao registrar o arquivo (status ${res.status}).`);
        return;
      }
      setResult({
        spedFileId: data.spedFileId,
        fileName: file.name,
        competencia: resumo.competencia,
        competenciaInicio: resumo.competenciaInicio,
        competenciaFim: resumo.competenciaFim,
        nomeEmpresa: resumo.nomeEmpresa,
        cnpjEmpresa: resumo.cnpjEmpresa,
        totalLinhas: resumo.totalLinhas,
        porBloco: resumo.porBloco,
        porRegistro: resumo.porRegistro,
        tipoSped: resumo.tipoSped,
        linhas: resumo.linhas,
        notasSaida: resumo.notasSaida,
        notasSaidaCriticadas: resumo.notasSaidaCriticadas,
      });
    } catch {
      setError('Falha ao processar o arquivo.');
    } finally {
      setLoading(false);
    }
  }

  const linhasFiltradas = useMemo(() => {
    if (!result) return [];
    return result.linhas.filter((l) => {
      if (filtroBloco !== 'TODOS' && l.bloco !== filtroBloco) return false;
      if (filtroRegistro !== 'TODOS' && l.registro !== filtroRegistro) return false;
      return true;
    });
  }, [result, filtroBloco, filtroRegistro]);

  // sf3NotasProtheus (sincronizado) primeiro, sf3Notas (upload manual)
  // depois — construirMapaSf3 sobrescreve por chave repetida, então o
  // upload manual vence em caso de conflito (dado mais recente/específico
  // que o usuário trouxe de propósito).
  // A SF3 só conta como "consultada" (e portanto pode dizer "Não encontrado
  // no SF3") quando há planilha manual, ou sincronização automática cuja
  // janela cobre o início da competência do arquivo.
  const sf3Consultada = useMemo(() => {
    if (sf3Notas.length > 0) return true;
    if (!sf3Sincronizado || !sf3Desde || !result) return false;
    return !result.competenciaInicio || sf3Desde <= result.competenciaInicio;
  }, [sf3Notas, sf3Sincronizado, sf3Desde, result]);

  const mapaSf3 = useMemo(() => {
    const combinado = [...sf3NotasProtheus, ...sf3Notas];
    return combinado.length > 0 ? construirMapaSf3(combinado) : undefined;
  }, [sf3NotasProtheus, sf3Notas]);

  const gruposNumeracao = useMemo(() => {
    if (!result) return [];
    return analisarNumeracaoSaida(result.notasSaida, mapaSf3, sf3Consultada);
  }, [result, mapaSf3, sf3Consultada]);

  function handleExportExcel() {
    if (!result) return;
    const workbook = XLSX.utils.book_new();

    // Uma aba por bloco, com os registros daquele bloco
    const blocos = Array.from(new Set(result.linhas.map((l) => l.bloco))).sort();
    blocos.forEach((bloco) => {
      const linhasBloco = result.linhas.filter((l) => l.bloco === bloco);
      const maxCampos = Math.max(...linhasBloco.map((l) => l.campos.length), 0);
      // Coluna Operação (Entrada/Saída, lida do IND_OPER do documento) só nas
      // abas de bloco que têm documentos com essa informação (A, C, D) —
      // nos demais (0, 1, 9, M...) seria uma coluna vazia.
      const temOperacao = linhasBloco.some((l) => l.operacao);
      const temSituacao = linhasBloco.some((l) => l.situacaoDocumento);
      const rows = linhasBloco.map((l) => {
        const row: Record<string, string | number> = { Linha: l.linhaOriginal, Registro: l.registro };
        if (temOperacao) row['Operação'] = l.operacao;
        if (temSituacao) row['Situação'] = l.situacaoDocumento;
        for (let i = 0; i < maxCampos; i++) row[`Campo${i + 1}`] = l.campos[i] ?? '';
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, ws, `Bloco ${bloco}`.slice(0, 31));
    });

    // Aba de notas de Saída canceladas/inutilizadas/denegadas, só quando
    // o arquivo tiver alguma — evita aba vazia na maioria dos arquivos.
    if (result.notasSaidaCriticadas.length > 0) {
      const wsCriticas = XLSX.utils.json_to_sheet(
        result.notasSaidaCriticadas.map((n) => ({
          Linha: n.linhaOriginal,
          Situação: n.situacao,
          'Cód. Situação': n.codSit,
          Série: n.serie,
          Número: n.numero,
          'Chave NF-e': n.chave,
          'Data Emissão': n.dataEmissao,
          Valor: n.valor,
        }))
      );
      XLSX.utils.book_append_sheet(workbook, wsCriticas, 'Saída Cancel-Inutil-Deneg');
    }

    // Abas de análise de numeração da Saída, só quando houver alguma
    // série lida — resumo por série + lista dos números faltantes.
    if (gruposNumeracao.length > 0) {
      const wsNumResumo = XLSX.utils.json_to_sheet(
        gruposNumeracao.map((g) => ({
          Modelo: g.modeloLabel,
          Série: g.serie,
          'Nº Mínimo': g.numeroMinimo,
          'Nº Máximo': g.numeroMaximo,
          'Total Esperado': g.totalEsperado,
          Autorizadas: g.qtdAutorizadas,
          Canceladas: g.qtdCanceladas,
          Inutilizadas: g.qtdInutilizadas,
          Denegadas: g.qtdDenegadas,
          'Quebra de Sequencial/Faltantes': g.qtdNaoLocalizadas,
          'Resolvidas pela Planilha Protheus': g.qtdResolvidasPorSf3,
        }))
      );
      XLSX.utils.book_append_sheet(workbook, wsNumResumo, 'Numeração Saída - Resumo');

      const faltantesLinhas = gruposNumeracao.flatMap((g) =>
        g.faltantes.map((f) => ({
          Modelo: g.modeloLabel,
          Série: g.serie,
          Número: f.numero,
          Situação: f.categoria,
          Fonte: f.fonte === 'SF3' ? 'Planilha Protheus' : 'SPED (quebra de sequencial/faltante)',
          'No SF3?': STATUS_SF3_LABELS[f.statusSf3],
          'CFOP (SF3)': f.cfopsSf3 || '',
          'Retorno SEFA (SF3)': f.cStatSf3 || '',
          Chave: f.chave || '',
        }))
      );
      if (faltantesLinhas.length > 0) {
        const wsFaltantes = XLSX.utils.json_to_sheet(faltantesLinhas);
        XLSX.utils.book_append_sheet(workbook, wsFaltantes, 'Numeração Saída - Faltantes');
      }
    }

    // Aba de notas com Retorno SEFA diferente de 100 no período, só
    // quando houver alguma.
    if (notasRetornoDiferente.length > 0) {
      const wsRetorno = XLSX.utils.json_to_sheet(
        notasRetornoDiferente.map((n) => ({
          Modelo: n.modeloLabel,
          Série: n.serie,
          Número: n.numero,
          'Retorno SEFA': n.cStat,
          Descrição: CSTAT_LABELS[n.cStat] || '',
          'Chave NF-e': n.chave || '',
          'Data Emissão': n.dataEmissao || '',
          'Data Cancelamento': n.dataCancelamento || '',
        }))
      );
      XLSX.utils.book_append_sheet(workbook, wsRetorno, 'Retorno SEFA Diferente 100');
    }

    // Aba resumo
    const resumoRows = Object.entries(result.porBloco).map(([bloco, qtd]) => ({
      Bloco: bloco,
      Descrição: BLOCO_DESCRICOES[bloco] || 'N/A',
      'Qtd. Registros': qtd,
    }));
    const wsResumo = XLSX.utils.json_to_sheet(resumoRows);
    XLSX.utils.book_append_sheet(workbook, wsResumo, 'Resumo');

    XLSX.writeFile(workbook, `sped-fiscal-${result.fileName.replace(/\.[^.]+$/, '')}.xlsx`);
  }

  // Exports dedicados das duas análises (pedido explícito do usuário) —
  // Excel gerado no navegador, igual ao resto do Conversor SPED; PDF via
  // rota de servidor com pdfkit (os dados computados aqui são enviados
  // prontos, a rota só desenha — mesmo padrão de outras exportações em
  // PDF do sistema).
  // Notas de Saída canceladas/inutilizadas/denegadas, ordenadas por
  // modelo → série → número, com o rótulo do modelo (NF-e/NFC-e) — base
  // da tabela do card e dos exports dedicados em PDF/Excel.
  const criticasOrdenadas = useMemo(() => {
    if (!result) return [];
    return result.notasSaidaCriticadas
      .map((n) => ({ ...n, modeloLabel: COD_MOD_LABELS[n.modelo] || (n.modelo ? `Modelo ${n.modelo}` : '—') }))
      .sort(
        (a, b) =>
          a.modelo.localeCompare(b.modelo) ||
          (parseInt(a.serie, 10) || 0) - (parseInt(b.serie, 10) || 0) ||
          (parseInt(a.numero, 10) || 0) - (parseInt(b.numero, 10) || 0)
      );
  }, [result]);

  // Filtros em botão dos três cards (pedido do usuário) — os exports em
  // PDF/Excel respeitam o filtro aplicado: exporta o que está na tela.
  const [filtroCritSituacao, setFiltroCritSituacao] = useState('TODAS');
  const [filtroCritGrupo, setFiltroCritGrupo] = useState('TODOS');
  const [filtroNumGrupo, setFiltroNumGrupo] = useState('TODOS');
  const [filtroNumSituacao, setFiltroNumSituacao] = useState('TODAS');
  const [filtroNumSf3, setFiltroNumSf3] = useState('TODOS');
  const [filtroRetModelo, setFiltroRetModelo] = useState('TODOS');
  const [filtroRetCstat, setFiltroRetCstat] = useState('TODOS');

  // Novo arquivo importado: volta todos os filtros pro padrão.
  useEffect(() => {
    setFiltroCritSituacao('TODAS');
    setFiltroCritGrupo('TODOS');
    setFiltroNumGrupo('TODOS');
    setFiltroNumSituacao('TODAS');
    setFiltroRetModelo('TODOS');
    setFiltroRetCstat('TODOS');
  }, [result]);

  const criticasFiltradas = useMemo(
    () =>
      criticasOrdenadas.filter(
        (n) =>
          (filtroCritSituacao === 'TODAS' || n.situacao === filtroCritSituacao) &&
          (filtroCritGrupo === 'TODOS' || `${n.modelo}|${n.serie}` === filtroCritGrupo)
      ),
    [criticasOrdenadas, filtroCritSituacao, filtroCritGrupo]
  );

  // Opções dos botões vêm da lista completa (não da filtrada), pra um
  // botão não sumir depois de clicado.
  const opcoesCritSituacao = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of criticasOrdenadas) m.set(n.situacao, (m.get(n.situacao) || 0) + 1);
    return Array.from(m.entries());
  }, [criticasOrdenadas]);
  const opcoesCritGrupo = useMemo(() => {
    const m = new Map<string, { label: string; qtd: number }>();
    for (const n of criticasOrdenadas) {
      const k = `${n.modelo}|${n.serie}`;
      if (!m.has(k)) m.set(k, { label: `${n.modeloLabel} · Série ${n.serie}`, qtd: 0 });
      m.get(k)!.qtd++;
    }
    return Array.from(m.entries());
  }, [criticasOrdenadas]);

  const resumoCriticas = useMemo(() => {
    const mapa = new Map<string, { modeloLabel: string; serie: string; porSituacao: Map<string, number>; total: number }>();
    for (const n of criticasFiltradas) {
      const chave = `${n.modelo}|${n.serie}`;
      if (!mapa.has(chave)) mapa.set(chave, { modeloLabel: n.modeloLabel, serie: n.serie, porSituacao: new Map(), total: 0 });
      const g = mapa.get(chave)!;
      g.total++;
      g.porSituacao.set(n.situacao, (g.porSituacao.get(n.situacao) || 0) + 1);
    }
    return Array.from(mapa.values());
  }, [criticasFiltradas]);

  // Análise de Numeração: filtra por modelo+série (esconde grupos) e por
  // situação (esconde itens da lista de cada grupo — os contadores do
  // grupo continuam mostrando o total real).
  const opcoesNumGrupo = useMemo(
    () => gruposNumeracao.map((g) => [`${g.modelo}|${g.serie}`, `${g.modeloLabel} · Série ${g.serie}`] as const),
    [gruposNumeracao]
  );
  const opcoesNumSituacao = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of gruposNumeracao) for (const f of g.faltantes) m.set(f.categoria, (m.get(f.categoria) || 0) + 1);
    return Array.from(m.entries());
  }, [gruposNumeracao]);
  const gruposNumeracaoFiltrados = useMemo(
    () =>
      gruposNumeracao
        .filter((g) => filtroNumGrupo === 'TODOS' || `${g.modelo}|${g.serie}` === filtroNumGrupo)
        .map((g) => ({
          ...g,
          faltantes: g.faltantes.filter(
            (f) => (filtroNumSituacao === 'TODAS' || f.categoria === filtroNumSituacao) && (filtroNumSf3 === 'TODOS' || f.statusSf3 === filtroNumSf3)
          ),
        })),
    [gruposNumeracao, filtroNumGrupo, filtroNumSituacao, filtroNumSf3]
  );

  // Retorno SEFA ≠ 100: filtra por modelo e por código de retorno.
  const opcoesRetModelo = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notasRetornoDiferente) m.set(n.modeloLabel, (m.get(n.modeloLabel) || 0) + 1);
    return Array.from(m.entries());
  }, [notasRetornoDiferente]);
  const opcoesRetCstat = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notasRetornoDiferente) m.set(n.cStat, (m.get(n.cStat) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [notasRetornoDiferente]);
  const notasRetornoFiltradas = useMemo(
    () =>
      notasRetornoDiferente.filter(
        (n) => (filtroRetModelo === 'TODOS' || n.modeloLabel === filtroRetModelo) && (filtroRetCstat === 'TODOS' || n.cStat === filtroRetCstat)
      ),
    [notasRetornoDiferente, filtroRetModelo, filtroRetCstat]
  );

  function handleExportCriticasExcel() {
    if (!result) return;
    const workbook = XLSX.utils.book_new();
    const linhasResumo = resumoCriticas.flatMap((g) =>
      Array.from(g.porSituacao.entries()).map(([situacao, qtd]) => ({
        Modelo: g.modeloLabel,
        Série: g.serie,
        Situação: situacao,
        Quantidade: qtd,
      }))
    );
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(linhasResumo), 'Resumo');
    // Uma aba por modelo + série (ex: "NF-e Série 001", "NFC-e Série 005").
    for (const g of resumoCriticas) {
      const linhas = criticasFiltradas
        .filter((n) => n.modeloLabel === g.modeloLabel && n.serie === g.serie)
        .map((n) => ({
          Modelo: n.modeloLabel,
          Série: n.serie,
          Número: n.numero,
          Situação: n.situacao,
          'Cód. Situação': n.codSit,
          'Chave NF-e': n.chave,
          'Data Emissão': n.dataEmissao,
          Valor: n.valor,
        }));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(linhas), `${g.modeloLabel} Série ${g.serie}`.slice(0, 31));
    }
    XLSX.writeFile(workbook, `Notas_Saida_Canceladas_Inutilizadas_Denegadas_${result.fileName.replace(/\.[^.]+$/, '')}.xlsx`);
  }

  async function handleExportCriticasPdf() {
    if (!result) return;
    const res = await fetch('/api/sped/notas-criticadas/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notas: criticasFiltradas.map((n) => ({
          modeloLabel: n.modeloLabel,
          serie: n.serie,
          numero: n.numero,
          situacao: n.situacao,
          chave: n.chave,
          dataEmissao: n.dataEmissao,
          valor: n.valor,
        })),
        fileName: result.fileName,
        nomeEmpresa: result.nomeEmpresa,
        competencia: result.competencia,
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    window.open(window.URL.createObjectURL(blob), '_blank');
  }

  function handleExportNumeracaoExcel() {
    if (!result) return;
    const workbook = XLSX.utils.book_new();
    const wsResumo = XLSX.utils.json_to_sheet(
      gruposNumeracaoFiltrados.map((g) => ({
        Modelo: g.modeloLabel,
        Série: g.serie,
        'Nº Mínimo': g.numeroMinimo,
        'Nº Máximo': g.numeroMaximo,
        'Total Esperado': g.totalEsperado,
        Autorizadas: g.qtdAutorizadas,
        Canceladas: g.qtdCanceladas,
        Inutilizadas: g.qtdInutilizadas,
        Denegadas: g.qtdDenegadas,
        'Quebra de Sequencial/Faltantes': g.qtdNaoLocalizadas,
        'Resolvidas pela Planilha/Protheus': g.qtdResolvidasPorSf3,
      }))
    );
    XLSX.utils.book_append_sheet(workbook, wsResumo, 'Resumo');
    const faltantesLinhas = gruposNumeracaoFiltrados.flatMap((g) =>
      g.faltantes.map((f) => ({
        Modelo: g.modeloLabel,
        Série: g.serie,
        Número: f.numero,
        Situação: f.categoria,
        Fonte: f.fonte === 'SF3' ? 'Planilha/Protheus' : 'SPED',
        'No SF3?': STATUS_SF3_LABELS[f.statusSf3],
        'CFOP (SF3)': f.cfopsSf3 || '',
        'Retorno SEFA (SF3)': f.cStatSf3 || '',
        Chave: f.chave || '',
      }))
    );
    if (faltantesLinhas.length > 0) {
      const wsFaltantes = XLSX.utils.json_to_sheet(faltantesLinhas);
      XLSX.utils.book_append_sheet(workbook, wsFaltantes, 'Quebra Sequencial-Faltantes');
    }
    XLSX.writeFile(workbook, `Analise_Numeracao_${result.fileName.replace(/\.[^.]+$/, '')}.xlsx`);
  }

  async function handleExportNumeracaoPdf() {
    if (!result) return;
    const res = await fetch('/api/sped/numeracao/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grupos: gruposNumeracaoFiltrados, fileName: result.fileName, nomeEmpresa: result.nomeEmpresa, competencia: result.competencia }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  function handleExportRetornoDiferenteExcel() {
    if (!result) return;
    const ws = XLSX.utils.json_to_sheet(
      notasRetornoFiltradas.map((n) => ({
        Modelo: n.modeloLabel,
        Série: n.serie,
        Número: n.numero,
        'Retorno SEFA': n.cStat,
        Descrição: CSTAT_LABELS[n.cStat] || '',
        'Chave NF-e': n.chave || '',
        'Data Emissão': n.dataEmissao || '',
        'Data Cancelamento': n.dataCancelamento || '',
      }))
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, ws, 'Retorno SEFA Diferente 100');
    XLSX.writeFile(workbook, `Retorno_SEFA_Diferente_100_${result.fileName.replace(/\.[^.]+$/, '')}.xlsx`);
  }

  async function handleExportRetornoDiferentePdf() {
    if (!result) return;
    const res = await fetch('/api/sped/notas-retorno-diferente/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notas: notasRetornoFiltradas,
        fileName: result.fileName,
        nomeEmpresa: result.nomeEmpresa,
        competenciaInicio: result.competenciaInicio,
        competenciaFim: result.competenciaFim,
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  // Deriva as opções dos filtros do resumo por bloco/registro (sempre
  // completo, conta o arquivo inteiro) em vez de escanear result.linhas
  // (pode vir cortada em arquivos grandes — ver linhasTruncadas).
  const registrosDisponiveis = result ? Object.keys(result.porRegistro).sort() : [];
  const blocosDisponiveis = result ? Object.keys(result.porBloco).sort() : [];

  return (
    <div className="space-y-6">
      {!result && (
        <ImportHero
          eyebrow="EFD ICMS/IPI e EFD Contribuições"
          titleParts={['Auditor', 'SPED Fiscal', { text: 'ICMS/PIS/COFINS', accent: true }]}
          description="Envie o arquivo .txt do SPED Fiscal (EFD ICMS/IPI) ou do SPED Contribuições (EFD PIS/COFINS) e audite: notas de Saída canceladas, inutilizadas ou denegadas, quebras de sequencial na numeração e retorno da SEFA — além do resumo por blocos/registros, pronto para exportar em Excel, inclusive no layout exato do seu modelo, cabeçalho (C100), itens (C170), participantes (0150) e produtos (0200) já cruzados, linha por item. O tipo de arquivo é identificado automaticamente."
          badges={['Processamento local, sem envio a servidor', 'Layout idêntico ao modelo enviado']}
        />
      )}

      {!result && (
        <div>
          <h1 className="sr-only">Auditor SPED Fiscal ICMS/PIS/COFINS</h1>
          <form onSubmit={handleUpload}>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`card-surface border-2 border-dashed cursor-pointer text-center px-6 py-14 transition-all duration-200 ${
                dragging ? 'border-brand bg-brand/5' : file ? 'border-lime bg-lime/5' : 'border-gray-200'
              }`}
            >
              <p className="font-display text-lg font-semibold text-gray-800">Arraste o arquivo SPED aqui</p>
              <p className="text-sm text-gray-500 mt-1.5">Arquivo texto (.txt) do EFD ICMS/IPI ou do EFD Contribuições, exportado pelo PVA</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                className="mt-5 bg-brand text-white rounded-xl px-5 py-2.5 text-sm font-medium shadow-card hover:shadow-card-hover transition-all"
              >
                Selecionar arquivo
              </button>
              {file && <p className="mt-4 text-xs font-mono text-brand bg-brand/5 inline-block px-3 py-1 rounded-full">📄 {file.name}</p>}
            </div>
            <div className="flex items-center justify-between mt-4">
              <ImportTrustNote text="O arquivo é lido e convertido inteiramente no seu navegador — nenhum dado fiscal sai da sua máquina." />
              <button
                type="submit"
                disabled={!file || loading}
                className="bg-brand text-white rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-40 shadow-card hover:shadow-card-hover transition-all shrink-0 ml-4"
              >
                {loading ? 'Processando...' : 'Importar arquivo'}
              </button>
            </div>
          </form>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-semibold text-brand">Auditor SPED Fiscal ICMS/PIS/COFINS</h1>
              <p className="text-gray-500 text-sm mt-1">Resumo do arquivo importado — filtre, confira e exporte.</p>
            </div>
            <button
              onClick={() => { setResult(null); setFile(null); handleSelecionarSf3(null); if (sf3InputRef.current) sf3InputRef.current.value = ''; }}
              className="text-sm text-brand underline whitespace-nowrap"
            >
              + Novo arquivo
            </button>
          </div>

          <div className="card-surface p-5 grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-gray-400 uppercase">Arquivo</p>
              <p className="text-sm font-medium text-gray-800">{result.fileName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase">Tipo de SPED</p>
              <p className="text-sm font-medium text-gray-800">{TIPO_SPED_LABELS[result.tipoSped]}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase">Empresa (Reg. 0000)</p>
              <p className="text-sm font-medium text-gray-800">{result.nomeEmpresa || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase">Competência</p>
              <p className="text-sm font-medium text-gray-800">{result.competencia || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase">Total de linhas</p>

              <p className="text-sm font-medium text-gray-800">{result.totalLinhas}</p>
            </div>
          </div>

          {result.tipoSped === 'desconhecido' && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              Não foi possível identificar se este arquivo é um EFD ICMS/IPI ou um EFD Contribuições (nenhum dos
              registros de abertura de bloco esperados foi encontrado). O resumo por bloco/registro abaixo ainda é
              confiável, mas os relatórios detalhados (Nota Fiscal, Planilha ICMS/PIS/COFINS) podem trazer campos
              como Empresa/CNPJ incorretos.
            </p>
          )}

          {result.notasSaidaCriticadas.length > 0 ? (
            <div className="card-surface p-5 border border-red-300 bg-red-50/40">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h2 className="font-semibold text-red-700">
                  ⚠ {result.notasSaidaCriticadas.length} nota(s) de Saída cancelada(s)/inutilizada(s)/denegada(s)
                </h2>
                <div className="flex items-center gap-2">
                  <button onClick={handleExportCriticasPdf} className="border border-accent text-accent rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap">
                    Exportar PDF
                  </button>
                  <button onClick={handleExportCriticasExcel} className="bg-accent text-white rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap">
                    Exportar Excel
                  </button>
                </div>
                <p className="text-xs text-gray-500 basis-full">
                  Lido do COD_SIT (registro C100) — o PDF e o Excel separam por modelo e série; também vai na aba
                  &quot;Saída Cancel-Inutil-Deneg&quot; do Excel completo.
                </p>
              </div>
              <div className="space-y-2 mb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500 w-20">Situação:</span>
                  <BotaoFiltro ativo={filtroCritSituacao === 'TODAS'} onClick={() => setFiltroCritSituacao('TODAS')}>
                    Todas ({criticasOrdenadas.length})
                  </BotaoFiltro>
                  {opcoesCritSituacao.map(([situacao, qtd]) => (
                    <BotaoFiltro key={situacao} ativo={filtroCritSituacao === situacao} onClick={() => setFiltroCritSituacao(situacao)}>
                      {situacao} ({qtd})
                    </BotaoFiltro>
                  ))}
                </div>
                {opcoesCritGrupo.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500 w-20">Modelo/série:</span>
                    <BotaoFiltro ativo={filtroCritGrupo === 'TODOS'} onClick={() => setFiltroCritGrupo('TODOS')}>
                      Todos
                    </BotaoFiltro>
                    {opcoesCritGrupo.map(([chave, { label, qtd }]) => (
                      <BotaoFiltro key={chave} ativo={filtroCritGrupo === chave} onClick={() => setFiltroCritGrupo(chave)}>
                        {label} ({qtd})
                      </BotaoFiltro>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-gray-400">
                  Mostrando {criticasFiltradas.length} de {criticasOrdenadas.length} — o PDF e o Excel exportam o que está filtrado.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {resumoCriticas.map((g) => (
                  <div key={`${g.modeloLabel}-${g.serie}`} className="text-xs bg-white border border-red-100 rounded-lg px-3 py-1.5">
                    <span className="font-medium text-gray-800">{g.modeloLabel} · Série {g.serie}</span>
                    <span className="text-gray-500"> — {g.total} nota(s): </span>
                    <span className="text-red-700">
                      {Array.from(g.porSituacao.entries()).map(([s, q]) => `${s} ${q}`).join(' · ')}
                    </span>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto max-h-72 overflow-y-auto border border-red-100 rounded-lg bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-red-100 sticky top-0 z-10">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-red-700">Modelo</th>
                      <th className="text-left px-3 py-2 font-medium text-red-700">Situação</th>
                      <th className="text-left px-3 py-2 font-medium text-red-700">Série</th>
                      <th className="text-left px-3 py-2 font-medium text-red-700">Número</th>
                      <th className="text-left px-3 py-2 font-medium text-red-700">Chave NF-e</th>
                      <th className="text-left px-3 py-2 font-medium text-red-700">Emissão</th>
                      <th className="text-left px-3 py-2 font-medium text-red-700">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {criticasFiltradas.map((n, idx) => (
                      <tr key={`${n.linhaOriginal}-${idx}`} className="border-t border-red-50">
                        <td className="px-3 py-1.5 whitespace-nowrap">{n.modeloLabel}</td>
                        <td className="px-3 py-1.5">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 whitespace-nowrap">
                            {n.situacao}
                          </span>
                        </td>
                        <td className="px-3 py-1.5">{n.serie}</td>
                        <td className="px-3 py-1.5 font-mono">{n.numero}</td>
                        <td className="px-3 py-1.5 font-mono text-[11px] break-all">{n.chave || '—'}</td>
                        <td className="px-3 py-1.5">{n.dataEmissao}</td>
                        <td className="px-3 py-1.5">{n.valor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-xs text-teal bg-teal/5 border border-teal/20 rounded-lg px-3 py-2">
              Nenhuma nota de Saída cancelada, inutilizada ou denegada encontrada no arquivo (COD_SIT do C100).
            </p>
          )}

          {gruposNumeracao.length > 0 && (
            <div className="card-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h2 className="font-semibold text-brand">Análise de Numeração — Saída</h2>
                <div className="flex items-center gap-2">
                  <button onClick={handleExportNumeracaoPdf} className="border border-accent text-accent rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap">
                    Exportar PDF
                  </button>
                  <button onClick={handleExportNumeracaoExcel} className="bg-accent text-white rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap">
                    Exportar Excel
                  </button>
                </div>
                <p className="text-xs text-gray-500 max-w-xl basis-full">
                  Um grupo por modelo + série — compara o intervalo mínimo–máximo de número encontrado contra o que
                  realmente apareceu no arquivo. &quot;Quebra de sequencial/Faltante&quot; é um número que não está em
                  nenhum C100 deste SPED — pode existir na Sefaz sem ter sido escriturado aqui, ou nunca ter sido
                  emitido; o arquivo sozinho não distingue os dois casos.
                </p>
              </div>

              {sf3NotasProtheus.length > 0 ? (
                <p className="text-xs text-teal bg-teal/5 border border-teal/20 rounded-lg px-3 py-2 mb-3">
                  Situação de {sf3NotasProtheus.length} nota(s) do Protheus cruzada(s) automaticamente, só no
                  intervalo de número deste arquivo
                  {sf3UltimaSincronizacao && ` (sincronização mais recente usada: ${new Date(sf3UltimaSincronizacao).toLocaleString('pt-BR')})`} —
                  sem precisar de upload.
                </p>
              ) : (
                <p className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 mb-3">
                  Nenhuma sincronização automática do Protheus encontrada pra esta filial — use o upload manual
                  abaixo, ou peça pra configurar a sincronização (script de sincronização da tabela SF3).
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 mb-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Segunda fonte manual (opcional) — planilha de situação de notas (ex: SF3 do Protheus)
                  </label>
                  <input
                    ref={sf3InputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => handleSelecionarSf3(e.target.files?.[0] || null)}
                    disabled={lendoSf3}
                    className="text-sm"
                  />
                </div>
                <p className="text-[11px] text-gray-400 flex-1 min-w-[220px]">
                  Algumas notas (ex: inutilizadas) deixaram de ser obrigatórias no SPED a partir de 01/2023 e o
                  Protheus pode não gerar o C100 delas — se você anexar aqui a planilha com a coluna &quot;Retorno
                  SEFA&quot; (cStat), o sistema cruza os números de quebra de sequencial/faltantes com ela antes de
                  desistir, e informa em cada um se está na SF3 e em qual CFOP (coluna &quot;Cod. Fiscal&quot;) — ou &quot;Não
                  encontrado no SF3&quot;.
                </p>
                {lendoSf3 && <span className="text-xs text-gray-500">Lendo...</span>}
              </div>
              {erroSf3 && <p className="text-sm text-red-600 mb-4">{erroSf3}</p>}
              {sf3File && sf3Notas.length > 0 && !erroSf3 && (
                <p className="text-xs text-teal mb-4">
                  {sf3Notas.length} nota(s) lida(s) de &quot;{sf3File.name}&quot; — cruzando com os números não
                  localizados abaixo.
                </p>
              )}

              <div className="space-y-2 mb-4">
                {opcoesNumGrupo.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500 w-20">Modelo/série:</span>
                    <BotaoFiltro ativo={filtroNumGrupo === 'TODOS'} onClick={() => setFiltroNumGrupo('TODOS')}>
                      Todos
                    </BotaoFiltro>
                    {opcoesNumGrupo.map(([chave, label]) => (
                      <BotaoFiltro key={chave} ativo={filtroNumGrupo === chave} onClick={() => setFiltroNumGrupo(chave)}>
                        {label}
                      </BotaoFiltro>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500 w-20">Situação:</span>
                  <BotaoFiltro ativo={filtroNumSituacao === 'TODAS'} onClick={() => setFiltroNumSituacao('TODAS')}>
                    Todas
                  </BotaoFiltro>
                  {opcoesNumSituacao.map(([categoria, qtd]) => (
                    <BotaoFiltro key={categoria} ativo={filtroNumSituacao === categoria} onClick={() => setFiltroNumSituacao(categoria)}>
                      {categoria} ({qtd})
                    </BotaoFiltro>
                  ))}
                </div>
                {gruposNumeracao.some((g) => g.faltantes.some((f) => f.statusSf3 !== 'nao_consultado')) && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500 w-20">No SF3:</span>
                    <BotaoFiltro ativo={filtroNumSf3 === 'TODOS'} onClick={() => setFiltroNumSf3('TODOS')}>
                      Todos
                    </BotaoFiltro>
                    {(['encontrado', 'nao_encontrado'] as const).map((st) => (
                      <BotaoFiltro key={st} ativo={filtroNumSf3 === st} onClick={() => setFiltroNumSf3(st)}>
                        {STATUS_SF3_LABELS[st]} ({gruposNumeracao.reduce((acc, g) => acc + g.faltantes.filter((f) => f.statusSf3 === st).length, 0)})
                      </BotaoFiltro>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-gray-400">
                  O filtro de situação age na lista de números de cada grupo (os quadros de contagem continuam
                  mostrando o total). O PDF e o Excel exportam o que está filtrado.
                </p>
              </div>

              <div className="space-y-4">
                {gruposNumeracaoFiltrados.map((g) => (
                  <div key={`${g.modelo}-${g.serie}`} className="border border-gray-100 rounded-lg p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <p className="text-sm font-medium text-gray-800">
                        {g.modeloLabel} · Série {g.serie}{' '}
                        <span className="text-gray-400 font-normal">
                          — nº {g.numeroMinimo} a {g.numeroMaximo} ({g.totalEsperado} esperado{g.totalEsperado === 1 ? '' : 's'})
                        </span>
                      </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <div className="rounded-lg px-3 py-2 bg-green-50 border border-green-100">
                        <p className="text-[10px] uppercase text-green-700">Autorizadas</p>
                        <p className="text-lg font-bold text-green-700">{g.qtdAutorizadas}</p>
                      </div>
                      <div className="rounded-lg px-3 py-2 bg-gray-50 border border-gray-200">
                        <p className="text-[10px] uppercase text-gray-500">Canceladas</p>
                        <p className="text-lg font-bold text-gray-700">{g.qtdCanceladas}</p>
                      </div>
                      <div className="rounded-lg px-3 py-2 bg-amber-50 border border-amber-100">
                        <p className="text-[10px] uppercase text-amber-700">Inutilizadas</p>
                        <p className="text-lg font-bold text-amber-700">{g.qtdInutilizadas}</p>
                      </div>
                      <div className="rounded-lg px-3 py-2 bg-orange-50 border border-orange-100">
                        <p className="text-[10px] uppercase text-orange-700">Denegadas</p>
                        <p className="text-lg font-bold text-orange-700">{g.qtdDenegadas}</p>
                      </div>
                      <div className={`rounded-lg px-3 py-2 border ${g.qtdNaoLocalizadas > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                        <p className={`text-[10px] uppercase ${g.qtdNaoLocalizadas > 0 ? 'text-red-700' : 'text-gray-500'}`}>Quebra de sequencial/Faltantes</p>
                        <p className={`text-lg font-bold ${g.qtdNaoLocalizadas > 0 ? 'text-red-700' : 'text-gray-700'}`}>{g.qtdNaoLocalizadas}</p>
                      </div>
                    </div>

                    {g.qtdResolvidasPorSf3 > 0 && (
                      <p className="text-xs text-teal bg-teal/5 border border-teal/20 rounded-lg px-3 py-2 mt-3">
                        {g.qtdResolvidasPorSf3} número(s) que o SPED não trazia foram explicados pela planilha
                        Protheus (contados acima na categoria certa, não mais em &quot;Quebra de sequencial/Faltantes&quot;).
                      </p>
                    )}

                    {g.intervaloGrandeDemais && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                        Intervalo entre o menor e o maior número ({g.totalEsperado.toLocaleString('pt-BR')} posições) é
                        grande demais pra listar um a um — confira se o número da nota foi lido corretamente nesta
                        série antes de confiar nas contagens acima.
                      </p>
                    )}

                    {!g.intervaloGrandeDemais && g.faltantes.length > 0 && (
                      <div className="mt-3 overflow-x-auto max-h-48 overflow-y-auto border border-gray-100 rounded-lg">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="text-left px-3 py-1.5 font-medium text-gray-600">Número</th>
                              <th className="text-left px-3 py-1.5 font-medium text-gray-600">Situação</th>
                              <th className="text-left px-3 py-1.5 font-medium text-gray-600">Fonte</th>
                              <th className="text-left px-3 py-1.5 font-medium text-gray-600">No SF3?</th>
                              <th className="text-left px-3 py-1.5 font-medium text-gray-600">CFOP (SF3)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.faltantes.slice(0, 200).map((f) => (
                              <tr key={f.numero} className="border-t border-gray-50">
                                <td className="px-3 py-1 font-mono text-gray-700">{f.numero}</td>
                                <td className="px-3 py-1">
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${
                                    f.categoria === 'Quebra de sequencial/Faltante' ? 'bg-red-100 text-red-700' :
                                    f.categoria === 'Autorizada' ? 'bg-green-100 text-green-700' :
                                    f.categoria === 'Cancelada' ? 'bg-gray-200 text-gray-700' :
                                    f.categoria === 'Inutilizada' ? 'bg-amber-100 text-amber-700' :
                                    'bg-orange-100 text-orange-700'
                                  }`}>
                                    {f.categoria}
                                  </span>
                                </td>
                                <td className="px-3 py-1 text-gray-400">{f.fonte === 'SF3' ? 'Planilha Protheus' : '—'}</td>
                                <td className="px-3 py-1 whitespace-nowrap">
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                                    f.statusSf3 === 'encontrado' ? 'bg-green-100 text-green-700' :
                                    f.statusSf3 === 'nao_encontrado' ? 'bg-red-100 text-red-700' :
                                    'bg-gray-100 text-gray-400'
                                  }`}>
                                    {STATUS_SF3_LABELS[f.statusSf3]}
                                  </span>
                                </td>
                                <td className="px-3 py-1 font-mono text-gray-700">{f.cfopsSf3 ? f.cfopsSf3.split(',').join(', ') : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {g.faltantes.length > 200 && (
                          <p className="text-[11px] text-gray-400 text-center py-1.5">
                            Mostrando os 200 primeiros de {g.faltantes.length} — exporte para Excel para ver todos.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.competenciaInicio && result.competenciaFim && (
            <div className="card-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h2 className="font-semibold text-brand">
                  Notas com Retorno SEFA diferente de 100 {notasRetornoDiferente.length > 0 && `(${notasRetornoDiferente.length})`}
                </h2>
                <div className="flex items-center gap-2">
                  <button onClick={handleExportRetornoDiferentePdf} className="border border-accent text-accent rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap">
                    Exportar PDF
                  </button>
                  <button onClick={handleExportRetornoDiferenteExcel} className="bg-accent text-white rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap">
                    Exportar Excel
                  </button>
                </div>
                <p className="text-xs text-gray-500 max-w-xl basis-full">
                  Direto da coluna &quot;Retorno SEFA&quot; (cStat) da SF3 do Protheus — toda nota (NF-e ou NFC-e)
                  cujo código de retorno não é 100 (Autorizado), dentro da competência deste arquivo
                  ({fmtDataYyyymmdd(result.competenciaInicio)} a {fmtDataYyyymmdd(result.competenciaFim)}). Não
                  depende do que apareceu no SPED — é a situação registrada direto na Sefaz.
                </p>
              </div>

              {notasRetornoDiferente.length === 0 ? (
                <p className="text-xs text-teal bg-teal/5 border border-teal/20 rounded-lg px-3 py-2">
                  Nenhuma nota com Retorno SEFA diferente de 100 encontrada no período (ou a sincronização do
                  Protheus pra esta empresa ainda não rodou).
                </p>
              ) : (
                <>
                <div className="space-y-2 mb-3">
                  {opcoesRetModelo.length > 1 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-gray-500 w-20">Modelo:</span>
                      <BotaoFiltro ativo={filtroRetModelo === 'TODOS'} onClick={() => setFiltroRetModelo('TODOS')}>
                        Todos ({notasRetornoDiferente.length})
                      </BotaoFiltro>
                      {opcoesRetModelo.map(([modeloLabel, qtd]) => (
                        <BotaoFiltro key={modeloLabel} ativo={filtroRetModelo === modeloLabel} onClick={() => setFiltroRetModelo(modeloLabel)}>
                          {modeloLabel} ({qtd})
                        </BotaoFiltro>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500 w-20">Retorno:</span>
                    <BotaoFiltro ativo={filtroRetCstat === 'TODOS'} onClick={() => setFiltroRetCstat('TODOS')}>
                      Todos
                    </BotaoFiltro>
                    {opcoesRetCstat.map(([cStat, qtd]) => (
                      <BotaoFiltro key={cStat} ativo={filtroRetCstat === cStat} onClick={() => setFiltroRetCstat(cStat)}>
                        {cStat} — {CSTAT_LABELS[cStat] || 'Código ' + cStat} ({qtd})
                      </BotaoFiltro>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Mostrando {notasRetornoFiltradas.length} de {notasRetornoDiferente.length} — o PDF e o Excel exportam o que está filtrado.
                  </p>
                </div>
                <div className="overflow-x-auto max-h-96 overflow-y-auto border border-gray-100 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Modelo</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Série</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Número</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Retorno SEFA</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Chave NF-e</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Emissão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notasRetornoFiltradas.map((n, idx) => (
                        <tr key={`${n.modelo}-${n.serie}-${n.numero}-${idx}`} className="border-t border-gray-50">
                          <td className="px-3 py-1.5">{n.modeloLabel}</td>
                          <td className="px-3 py-1.5">{n.serie}</td>
                          <td className="px-3 py-1.5 font-mono">{n.numero}</td>
                          <td className="px-3 py-1.5">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 whitespace-nowrap" title={CSTAT_LABELS[n.cStat] || ''}>
                              {n.cStat} — {CSTAT_LABELS[n.cStat] || 'Código ' + n.cStat}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-[11px] break-all">{n.chave || '—'}</td>
                          <td className="px-3 py-1.5">{fmtDataYyyymmdd(n.dataEmissao)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </div>
          )}

          <div className="card-surface p-5 border border-accent/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-brand">Relatório "NF-e de Entrada e Saída" (layout do modelo)</h2>
                <p className="text-xs text-gray-500 mt-1 max-w-xl">
                  Gera o Excel já organizado por item de nota fiscal (a partir dos registros C100/C170), no
                  layout, colunas e formatação do modelo enviado pela empresa — pronto para análise, sem ajustes
                  manuais.
                </p>
              </div>
              <button
                onClick={handleGerarRelatorioModelo}
                disabled={gerandoRelatorioModelo}
                className="bg-accent text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 whitespace-nowrap"
              >
                {gerandoRelatorioModelo ? 'Gerando...' : 'Gerar relatório (layout do modelo)'}
              </button>
            </div>
            {erroRelatorioModelo && <p className="text-sm text-red-600 mt-3">{erroRelatorioModelo}</p>}
          </div>

          <div className="card-surface p-5 border border-accent/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-brand">Planilha ICMS/PIS/COFINS por nota e produto</h2>
                <p className="text-xs text-gray-500 mt-1 max-w-xl">
                  Mesmo layout da planilha de conferência da Análise e Apuração Fiscal (15 colunas, com filtro
                  automático), extraído dos registros C100/C170/C190 do SPED (e, no EFD Contribuições, também de C175 e dos fretes D100/D101/D105). Campo que o SPED não trouxer
                  (ex: TES — não existe no layout do SPED — ou CST PIS/COFINS quando o arquivo não os declarou)
                  aparece como "—", sem inventar valor.
                </p>
              </div>
              <button
                onClick={handleGerarExcelTributos}
                disabled={gerandoExcelTributos}
                className="bg-accent text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 whitespace-nowrap"
              >
                {gerandoExcelTributos ? 'Gerando...' : 'Exportar Planilha ICMS/PIS/COFINS'}
              </button>
            </div>
            <div className="mt-4 border-t border-gray-100 pt-3">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-medium text-gray-600">
                  Colunas a exportar ({colunasTributos.length} de {COLUNAS_PLANILHA_TRIBUTOS.length}):
                </span>
                <button
                  type="button"
                  onClick={() => alterarColunasTributos(COLUNAS_PLANILHA_TRIBUTOS)}
                  className="text-[11px] text-accent underline"
                >
                  Marcar todas
                </button>
                <button
                  type="button"
                  onClick={() => alterarColunasTributos(COLUNAS_PLANILHA_TRIBUTOS_PADRAO)}
                  className="text-[11px] text-accent underline"
                >
                  Layout padrão
                </button>
                <button type="button" onClick={() => alterarColunasTributos([])} className="text-[11px] text-gray-500 underline">
                  Limpar
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {COLUNAS_PLANILHA_TRIBUTOS.map((col) => {
                  const marcada = colunasTributos.includes(col);
                  const adicional = COLUNAS_PLANILHA_TRIBUTOS_EXTRAS.includes(col);
                  return (
                    <label
                      key={col}
                      className={`flex items-center gap-1.5 text-xs rounded-full border px-3 py-1 cursor-pointer select-none ${
                        marcada ? 'bg-brand text-white border-brand' : adicional ? 'bg-lime/10 text-gray-600 border-lime/60' : 'bg-white text-gray-600 border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={marcada}
                        onChange={() =>
                          alterarColunasTributos(
                            marcada
                              ? colunasTributos.filter((c) => c !== col)
                              : COLUNAS_PLANILHA_TRIBUTOS.filter((c) => c === col || colunasTributos.includes(c))
                          )
                        }
                      />
                      {col}
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                Colunas com contorno verde-claro são adicionais, lidas direto do SPED (ex: CNPJ/CPF, Fornecedor/Cliente,
                CFOP, Chave NF-e) — saem só se você marcar.
              </p>
              {colunasTributos.length === 0 && (
                <p className="text-[11px] text-amber-700 mt-2">Nenhuma coluna marcada — a exportação trará o layout padrão.</p>
              )}
            </div>
            {erroExcelTributos && <p className="text-sm text-red-600 mt-3">{erroExcelTributos}</p>}
          </div>

          <div className="card-surface p-5">
            <h2 className="font-semibold text-brand mb-3">Resumo por bloco</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {Object.entries(result.porBloco).map(([bloco, qtd]) => (
                <div key={bloco} className="border border-gray-100 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Bloco {bloco}</p>
                  <p className="text-lg font-bold text-gray-800">{qtd}</p>
                  <p className="text-[11px] text-gray-400 leading-tight">{BLOCO_DESCRICOES[bloco] || ''}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="font-semibold text-brand">Registros ({linhasFiltradas.length})</h2>
              <div className="flex gap-2">
                <select
                  value={filtroBloco}
                  onChange={(e) => {
                    setFiltroBloco(e.target.value);
                    setFiltroRegistro('TODOS');
                  }}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                >
                  <option value="TODOS">Todos os blocos</option>
                  {blocosDisponiveis.map((b) => (
                    <option key={b} value={b}>
                      Bloco {b}
                    </option>
                  ))}
                </select>
                <select
                  value={filtroRegistro}
                  onChange={(e) => setFiltroRegistro(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                >
                  <option value="TODOS">Todos os registros</option>
                  {registrosDisponiveis
                    .filter((r) => filtroBloco === 'TODOS' || r.startsWith(filtroBloco))
                    .map((r) => (
                      <option key={r} value={r}>
                        {r} ({result.porRegistro[r]})
                      </option>
                    ))}
                </select>
                <button
                  onClick={handleExportExcel}
                  className="bg-accent text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:opacity-90"
                >
                  Exportar para Excel
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-96 overflow-y-auto border border-gray-100 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Linha</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Registro</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Operação</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Situação</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Campos</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasFiltradas.slice(0, 300).map((l) => (
                    <tr key={l.linhaOriginal} className="border-t border-gray-50">
                      <td className="px-3 py-1.5 text-gray-400">{l.linhaOriginal}</td>
                      <td className="px-3 py-1.5 font-medium text-brand">{l.registro}</td>
                      <td className="px-3 py-1.5 text-gray-600">{l.operacao}</td>
                      <td className="px-3 py-1.5 text-gray-600">{l.situacaoDocumento}</td>
                      <td className="px-3 py-1.5 text-gray-600 truncate max-w-xl">{l.campos.join(' | ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {linhasFiltradas.length > 300 && (
                <p className="text-xs text-gray-400 text-center py-2">
                  Mostrando as primeiras 300 de {linhasFiltradas.length} linhas — exporte para Excel para ver todas.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
