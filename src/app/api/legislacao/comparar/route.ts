import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { compararLegislacoes } from '@/lib/legislacao/ia';
import { lerDocumentoDoForm, respostaStreaming, progressoThrottled, sessaoLegislacao } from '@/lib/legislacao/servidor';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = await sessaoLegislacao();
  if ('erro' in auth) return auth.erro;
  const { session } = auth;

  const form = await req.formData();
  const a = await lerDocumentoDoForm(form, 'A_');
  if ('erro' in a) return Response.json({ error: `Documento A: ${a.erro}` }, { status: 400 });
  const b = await lerDocumentoDoForm(form, 'B_');
  if ('erro' in b) return Response.json({ error: `Documento B: ${b.erro}` }, { status: 400 });

  return respostaStreaming(async (enviar) => {
    enviar({ tipo: 'iniciado' });
    const { resultado, uso } = await compararLegislacoes(a.doc, b.doc, progressoThrottled(enviar));
    const docB = resultado.documentoB;
    const rotulo = (d: { titulo: string; numero: string; versao: string }, nome: string) =>
      [d.numero, d.versao ? `v${d.versao}` : ''].filter(Boolean).join(' ') || d.titulo || nome;

    const salvo = await prisma.legislacaoAnalise.create({
      data: {
        companyId: session.currentCompanyId,
        userId: session.id,
        userName: session.name,
        modo: 'COMPARACAO',
        nomeArquivo: a.doc.nome,
        nomeArquivoB: b.doc.nome,
        tipoDocumento: 'Comparação',
        numero: [docB.numero, docB.versao ? `v${docB.versao}` : ''].filter(Boolean).join(' ') || null,
        dataDocumento: docB.data || null,
        titulo: `${rotulo(resultado.documentoA, a.doc.nome)} × ${rotulo(docB, b.doc.nome)}`,
        resumo: resultado.relacao || null,
        resultado: resultado as object,
        modelo: uso.modelo,
        leituraTexto: a.leituraTexto || b.leituraTexto,
        tokensEntrada: uso.tokensEntrada,
        tokensSaida: uso.tokensSaida,
      },
      select: { id: true },
    });
    enviar({ tipo: 'concluido', id: salvo.id });
  });
}
