// Sincroniza a situação real das notas de Saída (NF-e/NFC-e) da tabela
// SF3 do Protheus pro Postgres do Portal (NotaFiscalSituacaoProtheus) —
// segunda fonte pra Análise de Numeração do Conversor SPED
// (sped-numeracao.ts), porque desde 01/2023 denegada/inutilizada
// deixaram de ser obrigatórias no SPED e o Protheus às vezes nem gera
// o C100 delas (achado real, 01/10/2026: nota 186424 da Passarela,
// inutilizada com protocolo Sefaz, nunca apareceu em nenhum SPED).
//
// Por quê: o site publicado (Vercel) não consegue falar direto com o
// SQL Server do Protheus (10.6.0.196, rede local do escritório) — mesma
// barreira já documentada em sync-perfis-protheus.ts. Este script
// PRECISA rodar de dentro da rede do escritório (mesma máquina que já
// tem MSSQL_SERVER configurado), e grava direto no Postgres via Prisma.
//
// A tabela SF3<sufixo> mistura notas de VÁRIAS filiais/empresas que
// compartilham o mesmo sufixo jurídico do Protheus (confirmado: SF3140
// tem filiais 01/04/22... = Matriz/Castanhal/Passarela/Piedade juntas).
// Em vez de pedir um cadastro novo de "código de filial Protheus", cada
// linha é atribuída automaticamente decodificando o CNPJ de dentro da
// própria chave de acesso (posições 7-20) e cruzando contra o CNPJ já
// cadastrado de cada Company/AnaliseFiscalCnpjGrupo — linha cujo CNPJ
// não bate com nenhuma empresa/filial cadastrada é ignorada (não é
// "nosso" dado).
//
// Uso: npx tsx scripts/sync-situacao-notas-protheus.ts
// Mesma Tarefa Agendada do Windows que já roda sync-perfis-protheus.ts
// pode chamar este script em seguida (ou uma tarefa própria).

import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { listarSituacaoNotasSf3 } from '../src/lib/protheus/sf3-situacao';
import { getProtheusPool } from '../src/lib/protheus/db';
import { extrairModeloDaChave, extrairCnpjDaChave, CSTAT_CATEGORIA } from '../src/lib/sf3-situacao-reader';
import { normalizarSerie } from '../src/lib/sped-numeracao';

const prisma = new PrismaClient();

type Alvo = { companyId: string; empresaGrupoId: string | null; nome: string };

type RegistroNovo = {
  companyId: string;
  empresaGrupoId: string | null;
  modelo: string;
  serie: string;
  numero: number;
  cStat: string;
  chave: string | null;
  dataEmissao: string | null;
  dataCancelamento: string | null;
  // Campo transiente, só pra decidir prioridade no dedup abaixo — nunca
  // é gravado no banco (schema não tem essa coluna).
  deletado: boolean;
};

async function main() {
  const empresas = await prisma.company.findMany({
    where: { protheusSufixo: { not: null } },
    select: { id: true, name: true, cnpj: true, protheusSufixo: true },
  });
  const filiais = await prisma.analiseFiscalCnpjGrupo.findMany({
    where: { protheusSufixo: { not: null } },
    select: { id: true, companyId: true, nome: true, cnpj: true, protheusSufixo: true },
  });

  if (empresas.length === 0 && filiais.length === 0) {
    console.log('Nenhuma empresa/filial com sufixo do Protheus configurado — nada a sincronizar.');
    return;
  }

  const alvoPorCnpj = new Map<string, Alvo>();
  for (const e of empresas) {
    alvoPorCnpj.set(e.cnpj.replace(/\D/g, ''), { companyId: e.id, empresaGrupoId: null, nome: e.name });
  }
  for (const f of filiais) {
    alvoPorCnpj.set(f.cnpj.replace(/\D/g, ''), { companyId: f.companyId, empresaGrupoId: f.id, nome: f.nome });
  }

  const todosOsAlvos: Alvo[] = [
    ...empresas.map((e) => ({ companyId: e.id, empresaGrupoId: null, nome: e.name })),
    ...filiais.map((f) => ({ companyId: f.companyId, empresaGrupoId: f.id, nome: f.nome })),
  ];

  const sufixos = Array.from(new Set([...empresas.map((e) => e.protheusSufixo!), ...filiais.map((f) => f.protheusSufixo!)]));

  // Limita aos últimos 3 anos — a SF3 acumula histórico desde a
  // implantação do Protheus (visto dado real de 2018) e pra cruzamento
  // de numeração só interessa período recente (ver comentário em
  // src/lib/protheus/sf3-situacao.ts).
  const tresAnosAtras = new Date();
  tresAnosAtras.setFullYear(tresAnosAtras.getFullYear() - 3);
  const dataMinima = `${tresAnosAtras.getFullYear()}${String(tresAnosAtras.getMonth() + 1).padStart(2, '0')}${String(tresAnosAtras.getDate()).padStart(2, '0')}`;

  const porAlvo = new Map<string, RegistroNovo[]>();
  const chaveAlvo = (companyId: string, empresaGrupoId: string | null) => `${companyId}|${empresaGrupoId ?? ''}`;
  for (const alvo of todosOsAlvos) porAlvo.set(chaveAlvo(alvo.companyId, alvo.empresaGrupoId), []);

  let totalLidoProtheus = 0;
  let semChaveValida = 0;
  let cnpjNaoCadastrado = 0;
  let cStatNaoReconhecido = 0;

  for (const sufixo of sufixos) {
    const t0 = Date.now();
    console.log(`[sufixo ${sufixo}] consultando SF3${sufixo}...`);
    const linhas = await listarSituacaoNotasSf3(sufixo, dataMinima);
    totalLidoProtheus += linhas.length;
    console.log(`[sufixo ${sufixo}] ${linhas.length} linha(s) lida(s) em ${Date.now() - t0}ms`);

    for (const linha of linhas) {
      const cnpj = extrairCnpjDaChave(linha.chave);
      const modelo = extrairModeloDaChave(linha.chave);
      if (!cnpj || !modelo) {
        semChaveValida++;
        continue;
      }
      const alvo = alvoPorCnpj.get(cnpj);
      if (!alvo) {
        cnpjNaoCadastrado++;
        continue;
      }
      const categoria = CSTAT_CATEGORIA[linha.cStat];
      if (!categoria) {
        cStatNaoReconhecido++;
        continue; // código intermediário/desconhecido — não vale a pena guardar
      }
      const numero = parseInt(linha.nfiscal, 10);
      if (!Number.isFinite(numero)) continue;

      porAlvo.get(chaveAlvo(alvo.companyId, alvo.empresaGrupoId))!.push({
        companyId: alvo.companyId,
        empresaGrupoId: alvo.empresaGrupoId,
        modelo,
        serie: normalizarSerie(linha.serie),
        numero,
        cStat: linha.cStat,
        chave: linha.chave || null,
        dataEmissao: linha.dtEmissao || null,
        dataCancelamento: linha.dtCancel || null,
        deletado: linha.deletado,
      });
    }
  }

  console.log(
    `\nTotal lido do Protheus: ${totalLidoProtheus} — ${semChaveValida} sem chave/modelo legível, ${cnpjNaoCadastrado} de CNPJ não cadastrado neste portal, ${cStatNaoReconhecido} com código de retorno não reconhecido (ver CSTAT_CATEGORIA).`
  );

  let falhas = 0;
  for (const alvo of todosOsAlvos) {
    const t0 = Date.now();
    const chave = chaveAlvo(alvo.companyId, alvo.empresaGrupoId);
    const registrosBrutos = porAlvo.get(chave) || [];

    // Mesma nota pode aparecer mais de uma vez (reprocessamento no
    // Protheus) — fica com UMA só por modelo+série+número, preferindo
    // sempre um registro ATIVO sobre um excluído (D_E_L_E_T_='*');
    // excluído só entra quando não existe nenhum ativo equivalente pra
    // aquela nota — achado real (01/10/2026): ~2-7% das notas
    // canceladas/inutilizadas/denegadas só existem como excluído no
    // Protheus, sem registro ativo nenhum, e o usuário pediu pra trazer
    // esses casos mesmo assim em vez de deixar só pro upload manual.
    const dedupMap = new Map<string, RegistroNovo>();
    for (const r of registrosBrutos) {
      const chaveDedup = `${r.modelo}|${r.serie}|${r.numero}`;
      const existente = dedupMap.get(chaveDedup);
      if (!existente || existente.deletado) dedupMap.set(chaveDedup, r);
    }
    const dados = Array.from(dedupMap.values()).map(({ deletado, ...r }) => ({ id: randomUUID(), ...r }));

    try {
      // SF3 acumula anos de escrituração — algumas empresas chegam a
      // dezenas de milhares de notas (Bem Pra Gente: 73.889). Timeout
      // alto (5 min) e um alvo por vez em try/catch: uma empresa falhar
      // (ex: timeout) não derruba a sincronização das demais, mesmo
      // padrão já usado em sync-perfis-protheus.ts.
      await prisma.$transaction(
        async (tx) => {
          await tx.notaFiscalSituacaoProtheus.deleteMany({ where: { companyId: alvo.companyId, empresaGrupoId: alvo.empresaGrupoId } });
          if (dados.length > 0) await tx.notaFiscalSituacaoProtheus.createMany({ data: dados });
        },
        { timeout: 300000, maxWait: 30000 }
      );
      console.log(`[${alvo.nome}] sincronizado: ${dados.length} nota(s) — ${Date.now() - t0}ms`);
    } catch (err) {
      falhas++;
      console.error(`[${alvo.nome}] FALHOU (${dados.length} nota(s) pendente(s)):`, err instanceof Error ? err.message : err);
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
    try {
      const pool = await getProtheusPool();
      await pool.close();
    } catch {
      // já pode estar fechado/nunca ter conectado — sem problema
    }
    process.exit(process.exitCode ?? 0);
  });
