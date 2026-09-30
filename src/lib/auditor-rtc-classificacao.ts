// Pesquisa de Classificação Tributária do Produto (Reforma Tributária) —
// lógica compartilhada entre a rota JSON (tela) e a rota de export em PDF,
// pra não duplicar a query. Base OFICIAL e pública (Nota Técnica 2025.002,
// LC 214/2025 e Anexos), igual pra todo tenant — ver schema.prisma pra nota
// completa sobre por que não é escopado por companyId.

import { Prisma } from '@prisma/client';
import { prisma } from './db';

function normalizarNcm(v: string): string {
  return v.replace(/\D/g, '');
}

const includeCclasstrib = { include: { cclasstrib: { include: { cst: true } } } } as const;

// Tipo explícito via Prisma.*GetPayload — `Awaited<ReturnType<typeof
// prisma.x.findMany>>` sem args não carrega o `include` de verdade (TS
// resolve pela assinatura genérica, não pela chamada real), o que deixava
// `.cclasstrib` "inexistente" apesar de a query sempre trazer o relation.
type NcmComCclasstrib = Prisma.AuditorRtcNcmClassificacaoGetPayload<typeof includeCclasstrib>;
const includeCst = { include: { cst: true } } as const;
type CclasstribComCst = Prisma.AuditorRtcCclasstribGetPayload<typeof includeCst>;

export async function pesquisarClassificacaoTributaria(descricaoBruta: string, ncmBruto: string) {
  const descricao = descricaoBruta.trim();
  const ncm = ncmBruto.trim() ? normalizarNcm(ncmBruto) : '';

  let porNcm: NcmComCclasstrib[] = [];
  if (ncm) {
    // 1) Exato — o caso mais comum, NCM completo de 8 dígitos.
    porNcm = await prisma.auditorRtcNcmClassificacao.findMany({ where: { ncm }, ...includeCclasstrib });
    // 2) A base guarda NCM completo de 8 dígitos; pesquisar por um nível
    // mais genérico (ex: "1006", capítulo/posição do Arroz) precisa achar
    // os códigos que COMEÇAM com esse prefixo — é o caso de uso do próprio
    // exemplo do pedido ("Arroz, NCM 1006"), que ficava sem resultado
    // porque a tentativa anterior só encurtava o termo buscado em vez de
    // casar contra o começo do NCM armazenado.
    if (porNcm.length === 0) {
      porNcm = await prisma.auditorRtcNcmClassificacao.findMany({ where: { ncm: { startsWith: ncm } }, ...includeCclasstrib, take: 50 });
    }
    // 3) Caso inverso (menos comum, mas seguro manter): a fonte classificou
    // num nível mais amplo do que o NCM completo digitado — encurta o
    // termo buscado até achar correspondência exata.
    if (porNcm.length === 0) {
      for (let len = ncm.length - 1; len >= 2 && porNcm.length === 0; len--) {
        porNcm = await prisma.auditorRtcNcmClassificacao.findMany({ where: { ncm: ncm.slice(0, len) }, ...includeCclasstrib });
      }
    }
  }

  let porDescricao: NcmComCclasstrib[] = [];
  let resultadosCclasstrib: CclasstribComCst[] = [];
  if (descricao) {
    const termos = descricao.toLowerCase().split(/\s+/).filter((t) => t.length >= 3).slice(0, 6);
    if (termos.length > 0) {
      porDescricao = await prisma.auditorRtcNcmClassificacao.findMany({
        where: { OR: termos.map((t) => ({ descricaoNcm: { contains: t, mode: 'insensitive' as const } })) },
        ...includeCclasstrib,
        take: 50,
      });
      resultadosCclasstrib = await prisma.auditorRtcCclasstrib.findMany({
        where: { OR: termos.map((t) => ({ descricao: { contains: t, mode: 'insensitive' as const } })) },
        include: { cst: true },
        take: 30,
      });
    }
  }

  const porId = new Map<string, (typeof porNcm)[number]>();
  for (const r of [...porNcm, ...porDescricao]) porId.set(r.id, r);
  const resultadosNcm = Array.from(porId.values());

  let avisoPadrao: CclasstribComCst | null = null;
  if (ncm && resultadosNcm.length === 0) {
    avisoPadrao = await prisma.auditorRtcCclasstrib.findUnique({ where: { codigo: '000001' }, include: { cst: true } });
  }

  return { ncmPesquisado: ncm || null, descricaoPesquisada: descricao || null, resultadosNcm, resultadosCclasstrib, avisoPadrao };
}

export type ResultadoPesquisaClassificacao = Awaited<ReturnType<typeof pesquisarClassificacaoTributaria>>;
