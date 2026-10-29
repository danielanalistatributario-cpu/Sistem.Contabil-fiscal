import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { analisarSemIa, MODELO_LOCAL } from '@/lib/legislacao/analiseLocal';
import { sessaoLegislacao, modeloParaNovaAnalise } from '@/lib/legislacao/servidor';

// Resumo SEM IA: recebe o texto do PDF já extraído no navegador (página a
// página), roda as regras de analiseLocal.ts e salva no mesmo formato da
// análise com IA. Não depende de ANTHROPIC_API_KEY nem tem custo.
export const maxDuration = 30;

const MAX_PAGINAS = 1500;

export async function POST(req: NextRequest) {
  const auth = await sessaoLegislacao();
  if ('erro' in auth) return auth.erro;
  const { session } = auth;

  const body = await req.json().catch(() => null);
  const nome = String(body?.nome || 'documento.pdf').slice(0, 200);
  const paginas = body?.paginas;
  if (!Array.isArray(paginas) || paginas.length === 0 || paginas.length > MAX_PAGINAS || !paginas.every((p: unknown) => typeof p === 'string')) {
    return NextResponse.json({ error: 'Texto do PDF inválido.' }, { status: 400 });
  }
  const totalChars = (paginas as string[]).reduce((s, p) => s + p.trim().length, 0);
  if (totalChars < 200) {
    return NextResponse.json({ error: 'O PDF parece ser escaneado (sem texto selecionável). O resumo sem IA só lê PDFs com texto — a leitura de imagem precisa da análise com IA.' }, { status: 400 });
  }

  const resultado = analisarSemIa(nome, paginas as string[]);
  const id = resultado.identificacao;
  const salvo = await prisma.legislacaoAnalise.create({
    data: {
      companyId: session.currentCompanyId,
      userId: session.id,
      userName: session.name,
      modo: 'ANALISE',
      nomeArquivo: nome,
      tipoDocumento: id.tipoDocumento || null,
      numero: [id.numero, id.versao ? `v${id.versao}` : ''].filter(Boolean).join(' ') || null,
      dataDocumento: id.dataDocumento || id.dataPublicacao || null,
      orgao: id.orgao || null,
      titulo: id.titulo || nome,
      resumo: resultado.assuntoPrincipal || null,
      resultado: { ...resultado, modeloVisual: await modeloParaNovaAnalise(session.currentCompanyId) } as object,
      modelo: MODELO_LOCAL,
      paginas: paginas.length,
      leituraTexto: true,
    },
    select: { id: true },
  });
  return NextResponse.json({ id: salvo.id });
}
