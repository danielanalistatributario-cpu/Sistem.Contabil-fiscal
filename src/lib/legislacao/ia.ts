import Anthropic from '@anthropic-ai/sdk';
import { SCHEMA_ANALISE, SCHEMA_COMPARACAO, type ResultadoAnalise, type ResultadoComparacao } from './tipos';

// Leitura e análise dos PDFs de legislação pela IA (Claude). Roda só no
// servidor — a chave ANTHROPIC_API_KEY fica nas variáveis de ambiente
// (.env local / Vercel), nunca vai pro navegador.
//
// O PDF vai inteiro pro modelo como bloco `document` (ele lê texto,
// tabelas e páginas escaneadas, e enxerga a numeração das páginas, o que
// permite a rastreabilidade página/trecho). PDF grande demais pro limite
// de upload da Vercel (~4,5MB por requisição) chega como texto extraído
// no navegador, página a página (ver extrairTextoPdf.ts).

export const MODELO_IA = 'claude-opus-5-5';

export type DocumentoEntrada = {
  nome: string;
  pdfBase64?: string;
  paginasTexto?: string[]; // texto de cada página, na ordem (fallback de PDF grande)
};

export type UsoIa = { modelo: string; tokensEntrada: number; tokensSaida: number };

export class ErroIa extends Error {}

const REGRAS_GERAIS = `Você é um analista tributário sênior brasileiro, especialista em ICMS, IPI, PIS/COFINS, IBS/CBS/IS (Reforma Tributária — EC 132/2023, LC 214/2025), documentos fiscais eletrônicos (NF-e, NFC-e, NFS-e, CT-e, MDF-e), SPED (EFD ICMS/IPI, EFD-Contribuições, ECD, ECF, EFD-Reinf) e parametrização fiscal de ERP (em especial TOTVS Protheus: TES, CFOP, CST, cadastro de produtos, regras fiscais).

Sua tarefa é transformar documentos de legislação em análise técnica utilizável por uma empresa — não apenas resumir o PDF.

Regras obrigatórias:
1. Fidelidade: nunca invente números, datas, códigos, artigos ou prazos. Se algo não está no documento, deixe o campo vazio ("" ou 0) ou registre em "limitacoes". Não complete com conhecimento externo como se estivesse no documento.
2. Separe sempre o que está EXPRESSO no documento (natureza "expresso") do que é sua INTERPRETAÇÃO ou recomendação (natureza "interpretacao"). Impactos em ERP, riscos e providências quase sempre são interpretação — marque assim, a não ser que o documento diga literalmente.
3. Rastreabilidade: em cada "fonte", informe a página do PDF (contando a primeira página do arquivo como 1, não a numeração impressa), o dispositivo (artigo, cláusula, item, seção, regra de validação) e um trecho literal curto que fundamente a informação.
4. Datas no formato AAAA-MM-DD nos campos de data; no comunicado use DD/MM/AAAA.
5. Português do Brasil, linguagem técnica e objetiva; no resumo executivo e no comunicado, linguagem simples para gestores.
6. O checklist deve ser específico deste documento (ex: "Incluir o grupo gIBSCBS no XML da NF-e", "Revisar a TES de remessa para conserto"), nunca genérico.
7. Códigos fiscais: liste somente os que aparecem no documento (CST, CFOP, NCM, NBS, cClassTrib, cBenef, campos/grupos do XML, regras de validação, registros do SPED).`;

function blocoDocumento(doc: DocumentoEntrada, titulo: string): Anthropic.Beta.BetaContentBlockParam {
  if (doc.pdfBase64) {
    return {
      type: 'document',
      title: titulo,
      source: { type: 'base64', media_type: 'application/pdf', data: doc.pdfBase64 },
    };
  }
  const paginas = doc.paginasTexto ?? [];
  const texto = paginas.map((t, i) => `=== PÁGINA ${i + 1} ===\n${t.trim()}`).join('\n\n');
  return {
    type: 'document',
    title: `${titulo} (texto extraído do PDF, página a página)`,
    source: { type: 'text', media_type: 'text/plain', data: texto },
  };
}

async function chamarIa(
  system: string,
  conteudo: Anthropic.Beta.BetaContentBlockParam[],
  schema: Record<string, unknown>,
  onProgresso?: (caracteres: number) => void
): Promise<{ json: unknown; uso: UsoIa }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ErroIa('A chave da IA (ANTHROPIC_API_KEY) não está configurada no servidor.');
  }
  const client = new Anthropic();

  let caracteres = 0;
  const stream = client.beta.messages.stream({
    model: MODELO_IA,
    max_tokens: 64000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: conteudo }],
  });
  stream.on('text', (delta) => {
    caracteres += delta.length;
    onProgresso?.(caracteres);
  });

  let msg: Anthropic.Beta.BetaMessage;
  try {
    msg = await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ErroIa('Chave da IA inválida (ANTHROPIC_API_KEY).');
    if (e instanceof Anthropic.RateLimitError) throw new ErroIa('Limite de uso da IA atingido. Tente de novo em alguns minutos.');
    if (e instanceof Anthropic.BadRequestError) throw new ErroIa(`A IA recusou o arquivo: ${e.message}`);
    if (e instanceof Anthropic.APIError) throw new ErroIa(`Erro da IA (${e.status}): ${e.message}`);
    throw e;
  }

  if (msg.stop_reason === 'refusal') throw new ErroIa('A IA se recusou a analisar este documento.');
  if (msg.stop_reason === 'max_tokens') throw new ErroIa('O documento gerou uma análise maior que o limite. Tente um PDF menor (ex: só o capítulo de interesse).');

  const texto = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new ErroIa('A resposta da IA veio incompleta. Tente novamente.');
  }
  return {
    json,
    uso: {
      modelo: msg.model,
      tokensEntrada: (msg.usage.input_tokens ?? 0) + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0),
      tokensSaida: msg.usage.output_tokens ?? 0,
    },
  };
}

export async function analisarLegislacao(doc: DocumentoEntrada, onProgresso?: (caracteres: number) => void) {
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [
    blocoDocumento(doc, doc.nome),
    {
      type: 'text',
      text: `Analise o documento anexado ("${doc.nome}") e preencha todos os campos do formato pedido. Data de hoje: ${hoje} — use-a só para situar prazos (ex: dizer se uma data já passou), nunca como data do documento.${
        doc.pdfBase64 ? '' : ' Atenção: o documento chegou como texto extraído, com marcadores "=== PÁGINA N ===" — use esses números como página da fonte. Tabelas e imagens podem ter se perdido na extração; registre isso em "limitacoes" quando afetar a análise.'
      }`,
    },
  ];
  const { json, uso } = await chamarIa(REGRAS_GERAIS, conteudo, SCHEMA_ANALISE, onProgresso);
  return { resultado: json as ResultadoAnalise, uso };
}

export async function compararLegislacoes(a: DocumentoEntrada, b: DocumentoEntrada, onProgresso?: (caracteres: number) => void) {
  const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [
    blocoDocumento(a, `Documento A — ${a.nome}`),
    blocoDocumento(b, `Documento B — ${b.nome}`),
    {
      type: 'text',
      text: `Compare o Documento A ("${a.nome}") com o Documento B ("${b.nome}"). Considere A como a referência anterior e B como a nova (se pelas datas/versões for o contrário, diga isso em "relacao" e mantenha A/B como foram enviados). Identifique o que foi incluído, excluído e alterado, novos prazos, novas obrigações, alterações fiscais e impactos no ERP. Em "paginaA"/"paginaB" use a página do PDF de cada documento. Ignore diferenças puramente de formatação, numeração de páginas ou histórico de versões, a não ser que mudem regra.${
        !a.pdfBase64 || !b.pdfBase64 ? ' Pelo menos um documento chegou como texto extraído, com marcadores "=== PÁGINA N ===" — use esses números como página.' : ''
      }`,
    },
  ];
  const { json, uso } = await chamarIa(REGRAS_GERAIS, conteudo, SCHEMA_COMPARACAO, onProgresso);
  return { resultado: json as ResultadoComparacao, uso };
}
