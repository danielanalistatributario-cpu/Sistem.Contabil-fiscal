import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { TES_RULES } from '@/lib/analise-fiscal-tes-registry';
import { TES_RULES_SAIDA } from '@/lib/analise-fiscal-saida-tes-registry';
import { GENERIC_RULES } from '@/lib/analise-fiscal-generic-rules';
import { carregarTesMetadataPorCodigo } from '@/lib/analise-fiscal-config-db';

// Catálogo de regras usado pela tela "Regras da Análise Fiscal" — combina
// os metadados de TES da empresa atual (banco, editável via Configurar
// TES) com as descrições estáticas das regras (fixas no código). Não
// expõe a lógica (`check`) em si, só o texto explicativo de cada regra.
export async function GET() {
  const session = await getSession();
  if (!session || !session.currentCompanyId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccess(session.currentRole, 'analiseFiscalConfig')) {
    return NextResponse.json({ error: 'Sem permissão para este módulo.' }, { status: 403 });
  }

  const tesMetadataPorCodigo = await carregarTesMetadataPorCodigo(session.currentCompanyId);

  const tes = Object.entries(tesMetadataPorCodigo)
    .map(([codigo, meta]) => ({
      codigo,
      grupo: meta.grupo,
      chaveNf: meta.chaveNf,
      permiteProdutos: meta.permiteProdutos,
      validarCfopUf: meta.validarCfopUf !== false,
      regras: (TES_RULES[codigo] || TES_RULES_SAIDA[codigo] || []).map((r) => ({ id: r.id, descricao: r.descricao })),
    }))
    .sort((a, b) => parseInt(a.codigo, 10) - parseInt(b.codigo, 10) || a.codigo.localeCompare(b.codigo));

  const regrasGerais = GENERIC_RULES.map((r) => ({ id: r.id, descricao: r.descricao }));

  return NextResponse.json({ regrasGerais, tes });
}
