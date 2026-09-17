// Sincroniza os Perfis de Produto do Protheus (tabela F24, por empresa) pro
// Postgres do próprio Portal (PerfilProduto/PerfilProdutoItem) — pra cada
// Company com protheusSufixo preenchido (escopo "geral", empresaGrupoId
// null) E pra cada AnaliseFiscalCnpjGrupo (filial do grupo, seletor
// "Filial" no Topbar) com protheusSufixo preenchido (escopo por filial) —
// mesmo padrão dual-scope já usado em AnaliseFiscalProdutoClassificacao.
// Uma empresa (Grupo 14 no Protheus = Matriz/Castanhal/Piedade/Passarela,
// todas com sufixo 240) sincroniza uma cópia própria por filial cadastrada,
// mesmo repetindo o mesmo dado — mais simples que tentar compartilhar.
//
// Por quê: o site publicado (Vercel) não consegue falar direto com o SQL
// Server do Protheus (10.6.0.196, IP de rede local do escritório) — não tem
// como contornar isso em código, é uma barreira de rede. A "Validação de
// Cadastro" (Exportar Perfis + a auditoria) por isso passou a ler sempre do
// Postgres, nunca mais do Protheus ao vivo — ver
// src/lib/validacao-cadastro-perfil-sync.ts.
//
// Este script PRECISA rodar de dentro da rede do escritório (mesma máquina
// que já tem MSSQL_SERVER configurado e alcança o Protheus) — ele grava
// direto no Postgres via Prisma (DATABASE_URL do .env), sem precisar de
// nenhuma rota HTTP nem chave de API nova.
//
// Uso: npx tsx scripts/sync-perfis-protheus.ts
// Agendar via Tarefa Agendada do Windows (ex: a cada 30-60 min) rodando esse
// comando na pasta do projeto.

import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { listarPerfisComProdutos, type LinhaPerfilProduto } from '../src/lib/protheus/perfil-produto';
import { getProtheusPool } from '../src/lib/protheus/db';

const prisma = new PrismaClient();

async function sincronizarEscopo(
  companyId: string,
  empresaGrupoId: string | null,
  nome: string,
  sufixo: string
) {
  const t0 = Date.now();
  console.log(`[${nome}] consultando Protheus (sufixo ${sufixo})...`);

  const linhas = await listarPerfisComProdutos(sufixo);
  console.log(`[${nome}] ${linhas.length} vínculo(s) perfil-produto lido(s) do Protheus em ${Date.now() - t0}ms`);

  const porPerfil = new Map<string, LinhaPerfilProduto[]>();
  for (const linha of linhas) {
    if (!porPerfil.has(linha.perfilCodigo)) porPerfil.set(linha.perfilCodigo, []);
    porPerfil.get(linha.perfilCodigo)!.push(linha);
  }

  // createMany em vez de create() aninhado em loop — pra um volume de
  // milhares de linhas, N criações sequenciais dentro de uma transação
  // interativa estoura o timeout padrão do Prisma (5s). Mesmo padrão já
  // usado neste projeto pra outras importações em lote (ids gerados via
  // randomUUID, ver [[analise-apuracao-fiscal-modulo]]).
  const perfisData = Array.from(porPerfil.keys()).map((perfilCodigo) => ({
    id: randomUUID(),
    companyId,
    empresaGrupoId,
    nome: perfilCodigo,
  }));
  const perfilIdPorCodigo = new Map(perfisData.map((p) => [p.nome, p.id]));

  const itensData = linhas.map((i) => ({
    id: randomUUID(),
    perfilId: perfilIdPorCodigo.get(i.perfilCodigo)!,
    codigo: i.produtoCodigo,
    descricao: i.produtoDescricao,
    produtoTipo: i.produtoTipo,
    produtoGrupo: i.produtoGrupo,
    aplicaATodos: i.aplicaATodos,
  }));

  await prisma.$transaction(
    async (tx) => {
      // Cascade em PerfilProdutoItem já apaga os filhos junto.
      await tx.perfilProduto.deleteMany({ where: { companyId, empresaGrupoId } });
      await tx.perfilProduto.createMany({ data: perfisData });
      await tx.perfilProdutoItem.createMany({ data: itensData });
      if (empresaGrupoId) {
        await tx.analiseFiscalCnpjGrupo.update({
          where: { id: empresaGrupoId },
          data: { protheusPerfisUltimaSincronizacao: new Date() },
        });
      } else {
        await tx.company.update({
          where: { id: companyId },
          data: { protheusPerfisUltimaSincronizacao: new Date() },
        });
      }
    },
    { timeout: 30000 }
  );

  console.log(`[${nome}] sincronizado: ${porPerfil.size} perfil(is), ${linhas.length} vínculo(s) — ${Date.now() - t0}ms total`);
}

async function main() {
  const empresas = await prisma.company.findMany({
    where: { protheusSufixo: { not: null } },
    select: { id: true, name: true, protheusSufixo: true },
  });
  const filiais = await prisma.analiseFiscalCnpjGrupo.findMany({
    where: { protheusSufixo: { not: null } },
    select: { id: true, companyId: true, nome: true, protheusSufixo: true },
  });

  if (empresas.length === 0 && filiais.length === 0) {
    console.log('Nenhuma empresa/filial com sufixo do Protheus configurado — nada a sincronizar.');
    return;
  }

  let falhas = 0;
  for (const empresa of empresas) {
    try {
      await sincronizarEscopo(empresa.id, null, empresa.name, empresa.protheusSufixo!);
    } catch (err) {
      falhas++;
      console.error(`[${empresa.name}] FALHOU:`, err instanceof Error ? err.message : err);
    }
  }
  for (const filial of filiais) {
    try {
      await sincronizarEscopo(filial.companyId, filial.id, filial.nome, filial.protheusSufixo!);
    } catch (err) {
      falhas++;
      console.error(`[${filial.nome}] FALHOU:`, err instanceof Error ? err.message : err);
    }
  }

  if (falhas > 0) {
    console.error(`\n${falhas} empresa(s)/filial(is) falharam na sincronização.`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('Erro fatal na sincronização:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // O pool de conexão do Protheus (mssql) fica aberto em cache (getProtheusPool
    // usa globalThis) e não deixa o processo terminar sozinho — como este script
    // roda uma vez e sai (chamado pela Tarefa Agendada), fecha explicitamente.
    try {
      const pool = await getProtheusPool();
      await pool.close();
    } catch {
      // já pode estar fechado/nunca ter conectado — sem problema
    }
    process.exit(process.exitCode ?? 0);
  });
