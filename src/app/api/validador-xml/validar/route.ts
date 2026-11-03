import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sessaoValidadorXml } from '@/lib/validador-xml/servidor';
import { saneRegra, saneCampo } from '@/lib/validador-xml/sanear';
import { validarXml, type NormaParaValidar } from '@/lib/validador-xml/motor';
import type { CampoLayout, RegraNorma, ResultadoValidacao } from '@/lib/validador-xml/tipos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_ARQUIVOS = 60;
const MAX_BYTES = 4_000_000;
const MAX_OCORRENCIAS_GRAVADAS = 300;

// Valida os XMLs contra a norma cadastrada e grava o histórico. O XML
// em si NÃO é guardado — só o resultado.
export async function POST(req: NextRequest) {
  const auth = await sessaoValidadorXml();
  if ('erro' in auth) return auth.erro;
  const body = await req.json().catch(() => null);
  const arquivos = Array.isArray(body?.arquivos) ? (body.arquivos as { nome?: unknown; conteudo?: unknown }[]) : [];
  if (arquivos.length === 0) return NextResponse.json({ error: 'Nenhum XML enviado.' }, { status: 400 });
  if (arquivos.length > MAX_ARQUIVOS) return NextResponse.json({ error: `Envie no máximo ${MAX_ARQUIVOS} XMLs por vez.` }, { status: 400 });
  const total = arquivos.reduce((s, a) => s + (typeof a.conteudo === 'string' ? a.conteudo.length : 0), 0);
  if (total > MAX_BYTES) return NextResponse.json({ error: 'Lote grande demais — envie em partes menores.' }, { status: 413 });

  const companyId = auth.session.currentCompanyId;
  const norma = await prisma.normaXml.findFirst({ where: { id: String(body?.normaId ?? ''), companyId } });
  if (!norma) return NextResponse.json({ error: 'Norma não encontrada.' }, { status: 404 });
  if (norma.situacao !== 'ATIVA') return NextResponse.json({ error: 'Esta norma está inativa.' }, { status: 400 });

  const paraValidar: NormaParaValidar = {
    numero: norma.numero,
    versao: norma.versao,
    modelos: norma.modelos ? norma.modelos.split(',').filter(Boolean) : [],
    homologacaoEm: norma.homologacaoEm,
    producaoEm: norma.producaoEm,
    campos: (norma.campos as unknown[]).map(saneCampo).filter((c): c is CampoLayout => !!c),
    regras: (norma.regras as unknown[]).map(saneRegra).filter((r): r is RegraNorma => !!r),
  };
  const ignorarVigencia = body?.ignorarVigencia === true;
  const rotulo = `${norma.numero} v${norma.versao}`;

  const resultados: (ResultadoValidacao & { id: string })[] = [];
  for (const a of arquivos) {
    const nome = String(a.nome ?? 'arquivo.xml').slice(0, 200);
    let r: ResultadoValidacao;
    try {
      r = validarXml(paraValidar, nome, typeof a.conteudo === 'string' ? a.conteudo : '', { ignorarVigencia });
    } catch (e) {
      r = {
        arquivo: nome,
        erro: `Falha ao validar: ${e instanceof Error ? e.message : 'erro inesperado'}`,
        chave: null,
        numero: null,
        serie: null,
        modelo: null,
        emissao: null,
        tpAmb: null,
        emitente: { doc: null, nome: null },
        destinatario: { doc: null, nome: null },
        contagens: { conformes: 0, alertas: 0, divergencias: 0, ausentes: 0, indevidos: 0, naoValidaveis: 0, regrasNaoAplicaveis: 0 },
        conformidade: null,
        veredito: 'ERRO',
        ocorrencias: [],
        regras: [],
      };
    }
    const gravado = await prisma.validacaoXml.create({
      data: {
        companyId,
        normaId: norma.id,
        userId: auth.session.id,
        userName: auth.session.name,
        normaRotulo: rotulo,
        arquivoNome: nome,
        chave: r.chave,
        numeroNf: r.numero,
        serie: r.serie,
        modelo: r.modelo,
        dataEmissao: r.emissao,
        tpAmb: r.tpAmb,
        emitenteDoc: r.emitente.doc,
        emitenteNome: r.emitente.nome,
        destinatarioDoc: r.destinatario.doc,
        destinatarioNome: r.destinatario.nome,
        ignorouVigencia: ignorarVigencia,
        veredito: r.veredito,
        conformidade: r.conformidade,
        qtdConformes: r.contagens.conformes,
        qtdAlertas: r.contagens.alertas,
        qtdDivergencias: r.contagens.divergencias,
        qtdAusentes: r.contagens.ausentes,
        qtdIndevidos: r.contagens.indevidos,
        qtdNaoValidaveis: r.contagens.naoValidaveis,
        erro: r.erro,
        ocorrencias: r.ocorrencias.slice(0, MAX_OCORRENCIAS_GRAVADAS) as object[],
        regras: r.regras as object[],
      },
      select: { id: true },
    });
    resultados.push({ ...r, id: gravado.id });
  }
  return NextResponse.json({ normaRotulo: rotulo, resultados });
}
