import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { TES_RULES, TES_METADATA } from '@/lib/analise-fiscal-tes-registry';
import { TES_RULES_SAIDA, TES_METADATA_SAIDA_DEFAULT } from '@/lib/analise-fiscal-saida-tes-registry';
import { GENERIC_RULES } from '@/lib/analise-fiscal-generic-rules';
import { carregarTesMetadataPorCodigo } from '@/lib/analise-fiscal-config-db';

const CODIGOS_ENTRADA = new Set(Object.keys(TES_METADATA));
const CODIGOS_SAIDA = new Set(TES_METADATA_SAIDA_DEFAULT.flatMap((g) => g.codigos));

// Catálogo de regras usado pela tela "Regras da Análise e Apuração Fiscal"
// — combina os metadados de TES da empresa atual (banco, editável via
// Configurar TES) com as descrições estáticas das regras (fixas no
// código). Não expõe a lógica (`check`) em si, só o texto explicativo de
// cada regra. Separado em entrada/saída pra bater com a estrutura da tela
// — um código sem cadastro nos dois registros default (ex.: TES nova
// criada manualmente pelo admin) é classificado por convenção: começa
// com "9" cai em saída (padrão de venda no Protheus), o resto em entrada.
export async function GET() {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscalConfig')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const tesMetadataPorCodigo = await carregarTesMetadataPorCodigo(session.currentCompanyId);

  const todasTes = Object.entries(tesMetadataPorCodigo)
    .map(([codigo, meta]) => ({
      codigo,
      grupo: meta.grupo,
      chaveNf: meta.chaveNf,
      permiteProdutos: meta.permiteProdutos,
      validarCfopUf: meta.validarCfopUf !== false,
      regras: (TES_RULES[codigo] || TES_RULES_SAIDA[codigo] || []).map((r) => ({ id: r.id, descricao: r.descricao })),
    }))
    .sort((a, b) => parseInt(a.codigo, 10) - parseInt(b.codigo, 10) || a.codigo.localeCompare(b.codigo));

  const tesEntrada = todasTes.filter((t) => CODIGOS_ENTRADA.has(t.codigo) || (!CODIGOS_SAIDA.has(t.codigo) && !t.codigo.startsWith('9')));
  const tesSaida = todasTes.filter((t) => CODIGOS_SAIDA.has(t.codigo) || (!CODIGOS_ENTRADA.has(t.codigo) && t.codigo.startsWith('9')));

  const regrasGerais = GENERIC_RULES.map((r) => ({ id: r.id, descricao: r.descricao }));

  return NextResponse.json({ regrasGerais, entrada: { tes: tesEntrada }, saida: { tes: tesSaida } });
}
