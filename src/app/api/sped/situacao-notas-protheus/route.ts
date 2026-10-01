import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { CSTAT_CATEGORIA, type SituacaoSf3 } from '@/lib/sf3-situacao-reader';
import { normalizarSerie } from '@/lib/sped-numeracao';

// Devolve a situação de notas já sincronizada do Protheus (tabela SF3,
// ver scripts/sync-situacao-notas-protheus.ts) — segunda fonte
// automática da Análise de Numeração do Conversor SPED, no mesmo
// formato que a leitura manual da planilha (NotaSf3), pra reaproveitar
// construirMapaSf3() sem duplicar lógica no front-end. Lista vazia
// (não erro) quando a empresa/filial não tem sufixo Protheus configurado
// ou a sincronização nunca rodou — o Conversor cai de volta pro upload
// manual normalmente.
//
// Recebe `faixas` (modelo+série+intervalo mín-máx, extraídas do próprio
// arquivo SPED via extrairFaixasNumeracao em sped-numeracao.ts) e só
// busca os números dentro desses intervalos — pedido explícito do
// usuário: a sincronização guarda até 3 anos de histórico, mas a busca
// pra uma análise de um mês não deve trazer os outros anos inteiros
// (uma filial chegou a ter quase 160 mil notas sincronizadas).
const MAX_FAIXAS = 50;

type FaixaRecebida = { modelo: unknown; serie: unknown; numeroMinimo: unknown; numeroMaximo: unknown };

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'sped')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const faixasBrutas = Array.isArray(body?.faixas) ? (body.faixas as FaixaRecebida[]) : [];
  if (faixasBrutas.length === 0) {
    return NextResponse.json({ notas: [], ultimaSincronizacao: null });
  }
  if (faixasBrutas.length > MAX_FAIXAS) {
    return NextResponse.json({ error: `No máximo ${MAX_FAIXAS} faixas por consulta.` }, { status: 400 });
  }

  const faixas = faixasBrutas
    .map((f) => ({
      modelo: String(f.modelo ?? '').trim(),
      serie: normalizarSerie(String(f.serie ?? '')),
      numeroMinimo: Number(f.numeroMinimo),
      numeroMaximo: Number(f.numeroMaximo),
    }))
    .filter(
      (f) =>
        f.modelo &&
        Number.isSafeInteger(f.numeroMinimo) &&
        Number.isSafeInteger(f.numeroMaximo) &&
        f.numeroMinimo >= 0 &&
        f.numeroMaximo >= f.numeroMinimo
    );
  if (faixas.length === 0) {
    return NextResponse.json({ notas: [], ultimaSincronizacao: null });
  }

  const linhas = await prisma.notaFiscalSituacaoProtheus.findMany({
    where: {
      companyId: session.currentCompanyId,
      empresaGrupoId: session.currentEmpresaGrupoId,
      OR: faixas.map((f) => ({
        modelo: f.modelo,
        serie: f.serie,
        numero: { gte: f.numeroMinimo, lte: f.numeroMaximo },
      })),
    },
  });

  const notas = linhas.map((l) => ({
    modelo: l.modelo,
    serie: l.serie,
    numero: l.numero,
    cStat: l.cStat,
    categoria: (CSTAT_CATEGORIA[l.cStat] || null) as SituacaoSf3 | null,
    chave: l.chave,
    observacao: null as string | null,
  }));

  const ultimaSincronizacao = linhas.reduce<Date | null>((max, l) => (!max || l.atualizadoEm > max ? l.atualizadoEm : max), null);

  return NextResponse.json({ notas, ultimaSincronizacao });
}
