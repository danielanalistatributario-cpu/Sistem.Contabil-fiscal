import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, logActivity } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { resolverEmpresaGrupoId, carregarEmpresasGrupo } from '@/lib/analise-fiscal-config-db';
import { lancamentosDoSped, type OrigemSped } from '@/lib/efd-icms/para-apuracao';

const soDigitos = (s: string | null | undefined) => (s || '').replace(/\D/g, '');
const TAMANHO_MAXIMO = 400_000; // o resumo mensal tem poucos KB; isto só barra lixo

function validar(origem: unknown): origem is OrigemSped {
  const o = origem as OrigemSped | null;
  if (!o || o.versao !== 1 || !o.resumo) return false;
  const r = o.resumo;
  return (
    /^\d{6}$/.test(r.ym || '') &&
    !!r.empresa &&
    Array.isArray(r.entradas?.linhas) &&
    Array.isArray(r.saidas?.linhas) &&
    !!r.apuracao &&
    Array.isArray(r.apuracao.ajustes)
  );
}

// Cria uma Apuração Fiscal a partir de um SPED Fiscal importado no navegador: o front-end lê o arquivo,
// monta o resumo mensal e manda só ele (o arquivo não sobe). Os lançamentos do Resumo (002/003/006/007/012)
// e o saldo credor anterior já nascem dos registros E111/E110 e continuam editáveis, como nas demais apurações.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscal')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const texto = await req.text();
  if (texto.length > TAMANHO_MAXIMO) {
    return NextResponse.json({ error: 'Resumo do SPED grande demais.' }, { status: 413 });
  }
  let body: { origem?: unknown } | null = null;
  try {
    body = JSON.parse(texto);
  } catch {
    body = null;
  }
  if (!body || !validar(body.origem)) {
    return NextResponse.json({ error: 'Dados do SPED inválidos. Importe o arquivo novamente.' }, { status: 400 });
  }
  const origem = body.origem;
  const r = origem.resumo;

  const { empresaGrupoId, erro } = await resolverEmpresaGrupoId(
    session.currentCompanyId,
    session.currentEmpresaGrupoId,
    true,
    'Selecione a filial no topo da tela.'
  );
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  const empresasGrupo = await carregarEmpresasGrupo(session.currentCompanyId);
  const empresaSelecionada = empresaGrupoId ? empresasGrupo.find((e) => e.id === empresaGrupoId) || null : null;

  // o SPED é de um CNPJ só — não deixa gerar a apuração da filial A com o arquivo da filial B
  if (empresaSelecionada && soDigitos(empresaSelecionada.cnpj) && soDigitos(r.empresa.cnpj) && soDigitos(empresaSelecionada.cnpj) !== soDigitos(r.empresa.cnpj)) {
    return NextResponse.json(
      { error: `O arquivo é do CNPJ ${r.empresa.cnpj} (${r.empresa.nome}), mas a filial selecionada no topo é ${empresaSelecionada.nome} (CNPJ ${empresaSelecionada.cnpj}). Troque a filial ou importe o SPED correto.` },
      { status: 400 }
    );
  }

  const periodo = `${r.ym.slice(4, 6)}/${r.ym.slice(0, 4)}`;
  const e110 = r.apuracao.e110;
  const lancamentos = lancamentosDoSped(r);

  const apuracao = await prisma.analiseFiscalApuracaoIcms.create({
    data: {
      companyId: session.currentCompanyId,
      periodo,
      saldoCredorAnterior: e110 ? e110.vlSldCredorAnt : 0,
      empresaAnalisadaNome: empresaSelecionada?.nome || r.empresa.nome || null,
      empresaAnalisadaCnpj: empresaSelecionada?.cnpj || r.empresa.cnpj || null,
      empresaAnalisadaUf: empresaSelecionada?.uf || r.empresa.uf || null,
      spedOrigem: JSON.parse(JSON.stringify(origem)),
      lancamentos: { create: lancamentos },
    },
  });

  await logActivity(session.id, 'CRIOU_APURACAO_FISCAL', `Período: ${periodo} (SPED Fiscal: ${r.nomeArquivo})`, session.currentCompanyId);

  return NextResponse.json({ id: apuracao.id });
}
