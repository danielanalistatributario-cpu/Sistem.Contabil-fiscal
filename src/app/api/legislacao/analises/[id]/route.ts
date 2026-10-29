import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sessaoLegislacao } from '@/lib/legislacao/servidor';
import { STATUS_ANALISE, type Comunicado } from '@/lib/legislacao/tipos';
import { ehModeloVisual } from '@/lib/legislacao/modelos';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await sessaoLegislacao();
  if ('erro' in auth) return auth.erro;
  const analise = await prisma.legislacaoAnalise.findFirst({ where: { id: params.id, companyId: auth.session.currentCompanyId } });
  if (!analise) return NextResponse.json({ error: 'Análise não encontrada.' }, { status: 404 });
  return NextResponse.json({ analise });
}

// Atualiza status, itens do checklist marcados, assinatura do comunicado
// ou o texto do comunicado (editado na tela antes de exportar).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await sessaoLegislacao();
  if ('erro' in auth) return auth.erro;
  const atual = await prisma.legislacaoAnalise.findFirst({ where: { id: params.id, companyId: auth.session.currentCompanyId } });
  if (!atual) return NextResponse.json({ error: 'Análise não encontrada.' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.status === 'string') {
    if (!(STATUS_ANALISE as readonly string[]).includes(body.status)) return NextResponse.json({ error: 'Status inválido.' }, { status: 400 });
    data.status = body.status;
  }
  if (Array.isArray(body.checklistMarcados)) {
    data.checklistMarcados = body.checklistMarcados.filter((n: unknown) => Number.isInteger(n) && (n as number) >= 0);
  }
  if (body.assinaturaId === null || typeof body.assinaturaId === 'string') data.assinaturaId = body.assinaturaId;
  if (body.comunicado && typeof body.comunicado === 'object') {
    const c = body.comunicado as Partial<Comunicado>;
    const lista = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 12) : []);
    const texto = (v: unknown) => String(v ?? '').trim().slice(0, 400);
    const comunicado: Comunicado = {
      titulo: texto(c.titulo),
      subtitulo: texto(c.subtitulo),
      dataDestaqueRotulo: texto(c.dataDestaqueRotulo),
      dataDestaque: texto(c.dataDestaque),
      oQueMudou: lista(c.oQueMudou),
      quemEAfetado: lista(c.quemEAfetado),
      oQueFazer: lista(c.oQueFazer),
      impactoErp: lista(c.impactoErp),
      atencao: lista(c.atencao),
      fonte: texto(c.fonte),
    };
    data.resultado = { ...(atual.resultado as object), comunicado };
  }
  if (ehModeloVisual(body.modeloVisual)) {
    data.resultado = { ...((data.resultado ?? atual.resultado) as object), modeloVisual: body.modeloVisual };
  }

  const analise = await prisma.legislacaoAnalise.update({ where: { id: atual.id }, data });
  return NextResponse.json({ analise });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await sessaoLegislacao();
  if ('erro' in auth) return auth.erro;
  const { count } = await prisma.legislacaoAnalise.deleteMany({ where: { id: params.id, companyId: auth.session.currentCompanyId } });
  if (count === 0) return NextResponse.json({ error: 'Análise não encontrada.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
