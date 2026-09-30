// Carga/atualização da base de Pesquisa de Classificação Tributária do
// Produto (Reforma Tributária, IBS/CBS) — dado OFICIAL e público (Nota
// Técnica 2025.002 v.1.60, planilha "cClassTrib 2026-06-22.xlsx" publicada
// em nfe.fazenda.gov.br; Anexos I/VII/XV da LC 214/2025, NCMs expandidos
// via dfe-portal.svrs.rs.gov.br/DFE/TabelaClassificacaoTributaria), igual
// pra todo tenant.
//
// Lê os CSVs em scripts/data/ (compilados a partir das fontes oficiais,
// linha a linha, cada uma com sua própria URL de origem na coluna `fonte`)
// em vez de ter os dados digitados manualmente neste arquivo — usuário
// pediu explicitamente que a base possa ser atualizada futuramente: pra
// atualizar, baixar a planilha/tabela oficial nova, gerar os 2 CSVs no
// mesmo formato (colunas abaixo) e rodar de novo. Idempotente.
//
// Escopo desta carga (30/09/2026): 164 códigos cClassTrib (tabela
// completa) + 18 CST + NCMs dos Anexos I (Cesta Básica, zero), VII
// (alimentos, redução 60%) e XV (hortícolas/frutas/ovos, zero) — os
// 3 anexos mais relevantes pro cliente (hortifrutigranjeiros). Outros
// anexos (II a XIV, exceto VII/XV) ainda não têm NCM importado — ficam
// pra uma próxima carga; até lá, uma pesquisa por NCM desses outros
// anexos vai cair no aviso de "tributação integral padrão", que é
// tecnicamente incompleto (não indica o enquadramento real quando ele
// existir só nesses outros anexos) — registrar essa limitação, não
// esconder.
//
// Uso: npx tsx scripts/seed-classificacao-tributaria-rtc.ts

import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DATA_DIR = join(__dirname, 'data');

function lerCsv(caminho: string): { header: string[]; rows: string[][] } {
  const raw = readFileSync(caminho, 'utf8').replace(/^﻿/, '');
  const linhas = raw.split(/\r?\n/).filter((l) => l.length > 0);
  const header = linhas[0].split(';');
  const rows = linhas.slice(1).map((l) => l.split(';'));
  return { header, rows };
}

function col(header: string[], rows: string[][], nome: string): string[] {
  const idx = header.indexOf(nome);
  if (idx < 0) throw new Error(`Coluna "${nome}" não encontrada no CSV.`);
  return rows.map((r) => r[idx] ?? '');
}

function vazio(v: string | undefined): string | null {
  const s = (v || '').trim();
  return s || null;
}

function numero(v: string | undefined): number | null {
  const s = (v || '').trim();
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

async function main() {
  // ---- CST + cClassTrib (164 códigos, 18 CST) ----
  const { header: hC, rows: rC } = lerCsv(join(DATA_DIR, 'cclasstrib_oficial_2026-06-22.csv'));
  const idx = (nome: string) => hC.indexOf(nome);

  const cstsMap = new Map<string, { codigo: string; descricao: string; fonte: string }>();
  for (const r of rC) {
    const codigo = r[idx('cst')];
    if (!cstsMap.has(codigo)) {
      cstsMap.set(codigo, { codigo, descricao: r[idx('cst_descricao')], fonte: r[idx('fonte')] });
    }
  }
  for (const c of cstsMap.values()) {
    await prisma.auditorRtcCst.upsert({ where: { codigo: c.codigo }, create: c, update: { descricao: c.descricao, fonte: c.fonte } });
  }
  console.log(`${cstsMap.size} CST(s) carregado(s).`);

  let totalCclasstrib = 0;
  for (const r of rC) {
    const codigo = r[idx('cClassTrib')];
    const dispositivo = vazio(r[idx('lc214_dispositivo')]);
    const pRedIBS = numero(r[idx('pRedIBS')]);
    const pRedCBS = numero(r[idx('pRedCBS')]);
    const dFimVig = vazio(r[idx('dFimVig')]);
    const descricaoLonga = vazio(r[idx('descricao_cclasstrib')]);
    const nome = r[idx('nome_cclasstrib')];

    const obsPartes: string[] = [];
    if (descricaoLonga && descricaoLonga !== nome) obsPartes.push(descricaoLonga);
    if (pRedIBS !== null && pRedCBS !== null && pRedIBS !== pRedCBS) {
      obsPartes.push(`Redução diferente entre IBS (${pRedIBS}%) e CBS (${pRedCBS}%) — campo percentualReducao guarda o valor do IBS.`);
    }
    if (dFimVig) obsPartes.push(`Vigência encerrada em ${dFimVig} (ver fonte pra código substituto).`);

    await prisma.auditorRtcCclasstrib.upsert({
      where: { codigo },
      create: {
        codigo,
        cstCodigo: r[idx('cst')],
        descricao: nome,
        tipoAliquota: vazio(r[idx('tipo_aliquota')]),
        percentualReducao: pRedIBS !== null ? pRedIBS / 100 : null,
        fundamentoLegal: dispositivo ? `LC 214/2025, ${dispositivo}` : 'LC 214/2025',
        fonte: r[idx('fonte')],
        observacao: obsPartes.join(' ') || null,
      },
      update: {
        cstCodigo: r[idx('cst')],
        descricao: nome,
        tipoAliquota: vazio(r[idx('tipo_aliquota')]),
        percentualReducao: pRedIBS !== null ? pRedIBS / 100 : null,
        fundamentoLegal: dispositivo ? `LC 214/2025, ${dispositivo}` : 'LC 214/2025',
        fonte: r[idx('fonte')],
        observacao: obsPartes.join(' ') || null,
      },
    });
    totalCclasstrib++;
  }
  console.log(`${totalCclasstrib} cClassTrib(s) carregado(s).`);

  // ---- NCM dos Anexos I/VII/XV (só linhas PERMITIDO — VEDADO existe só
  // pra registro de exceção na fonte, não vira classificação aqui, senão
  // diria que um NCM explicitamente excluído do anexo tem o benefício) ----
  const { header: hN, rows: rNAll } = lerCsv(join(DATA_DIR, 'anexos_I_VII_XV_ncm.csv'));
  const idxN = (nome: string) => hN.indexOf(nome);
  const rN = rNAll.filter((r) => r[idxN('tipo_permissao')] === 'PERMITIDO' && r[idxN('tipo_codigo')] === 'NCM');
  const vedadosIgnorados = rNAll.length - rN.length;

  // Escopo inteiro vem de uma fonte só (SVRS, Anexos I/VII/XV) — substitui
  // tudo que já existe pra evitar duplicar item a cada carga repetida
  // (o mesmo NCM pode aparecer em mais de um "item" do mesmo anexo com
  // descrição diferente — ex: 19021900 nos itens 15 e 25 do Anexo I —,
  // então não dá pra usar upsert por ncm+cClassTrib sem perder uma das
  // duas linhas).
  const apagados = await prisma.auditorRtcNcmClassificacao.deleteMany({});
  await prisma.auditorRtcNcmClassificacao.createMany({
    data: rN.map((r) => {
      const excecao = vazio(r[idxN('excecao')]);
      const condicao = vazio(r[idxN('condicao')]);
      const obsPartes = [condicao, excecao ? `Exceção: ${excecao}` : null].filter(Boolean);
      return {
        ncm: r[idxN('ncm_nbs')],
        descricaoNcm: r[idxN('descricao_item_anexo')],
        cclasstribCodigo: r[idxN('cClassTrib')],
        anexo: `Anexo ${r[idxN('anexo_lc214')]}`,
        fundamentoLegal: `LC 214/2025, Anexo ${r[idxN('anexo_lc214')]}`,
        fonte: r[idxN('fonte')],
        observacao: obsPartes.join(' — ') || null,
      };
    }),
  });
  console.log(`${apagados.count} classificação(ões) de NCM anterior(es) removida(s); ${rN.length} carregada(s) (${vedadosIgnorados} linha(s) VEDADO da fonte ignorada(s) de propósito).`);
}

main()
  .catch((err) => {
    console.error('Erro na carga:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
