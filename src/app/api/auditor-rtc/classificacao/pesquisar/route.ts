import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { pesquisarClassificacaoTributaria } from '@/lib/auditor-rtc-classificacao';

// Pesquisa de Classificação Tributária do Produto (Reforma Tributária) —
// pedido explícito do usuário: nunca "aproximar sem fundamento" — por isso
// cada resultado sempre carrega fonte/fundamentoLegal, e um NCM não
// encontrado nos Anexos de tratamento diferenciado é dito explicitamente
// como "tributação integral por padrão" (cClassTrib 000001), não fica em
// branco. Lógica da consulta em src/lib/auditor-rtc-classificacao.ts,
// compartilhada com a rota de export em PDF.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'auditorRtc')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const descricao = (searchParams.get('descricao') || '').trim();
  const ncm = (searchParams.get('ncm') || '').trim();
  if (!descricao && !ncm) {
    return NextResponse.json({ error: 'Informe a descrição do produto ou o NCM.' }, { status: 400 });
  }

  const resultado = await pesquisarClassificacaoTributaria(descricao, ncm);
  return NextResponse.json(resultado);
}
