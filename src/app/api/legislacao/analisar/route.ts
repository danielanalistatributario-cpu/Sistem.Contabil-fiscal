import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { analisarLegislacao } from '@/lib/legislacao/ia';
import { lerDocumentoDoForm, respostaStreaming, progressoThrottled, sessaoLegislacao, modeloParaNovaAnalise } from '@/lib/legislacao/servidor';

// A leitura de um PDF longo pela IA pode passar de 1 minuto.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = await sessaoLegislacao();
  if ('erro' in auth) return auth.erro;
  const { session } = auth;

  const form = await req.formData();
  const lido = await lerDocumentoDoForm(form);
  if ('erro' in lido) return Response.json({ error: lido.erro }, { status: 400 });

  return respostaStreaming(async (enviar) => {
    enviar({ tipo: 'iniciado', paginas: lido.paginas, leituraTexto: lido.leituraTexto });
    const { resultado, uso } = await analisarLegislacao(lido.doc, progressoThrottled(enviar));
    const id = resultado.identificacao;

    const salvo = await prisma.legislacaoAnalise.create({
      data: {
        companyId: session.currentCompanyId,
        userId: session.id,
        userName: session.name,
        modo: 'ANALISE',
        nomeArquivo: lido.doc.nome,
        tipoDocumento: id.tipoDocumento || null,
        numero: [id.numero, id.versao ? `v${id.versao}` : ''].filter(Boolean).join(' ') || null,
        dataDocumento: id.dataDocumento || id.dataPublicacao || null,
        orgao: id.orgao || null,
        titulo: id.titulo || resultado.comunicado.titulo || lido.doc.nome,
        resumo: resultado.assuntoPrincipal || null,
        resultado: { ...resultado, modeloVisual: await modeloParaNovaAnalise(session.currentCompanyId) } as object,
        modelo: uso.modelo,
        paginas: lido.paginas,
        leituraTexto: lido.leituraTexto,
        tokensEntrada: uso.tokensEntrada,
        tokensSaida: uso.tokensSaida,
      },
      select: { id: true },
    });
    enviar({ tipo: 'concluido', id: salvo.id });
  });
}
