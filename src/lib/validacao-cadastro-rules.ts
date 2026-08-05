import { normalize } from './icms-rules';

// Status possíveis de ResultadoItem.status: OK | DIVERGENTE | SEM_PERFIL | DUPLICADO

export type ItemCadastro = { codigo: string; descricao?: string | null; perfilAtual?: string | null };
export type PerfilRef = { nome: string; codigos: Set<string> };

export type ResultadoItem = {
  codigo: string;
  descricao: string | null;
  perfilAtual: string | null;
  perfilEncontrado: string | null;
  perfisEncontrados: string | null;
  status: 'OK' | 'DIVERGENTE' | 'SEM_PERFIL' | 'DUPLICADO';
  observacao: string | null;
};

export function compararCadastro(itens: ItemCadastro[], perfis: PerfilRef[]): ResultadoItem[] {
  return itens.map((item) => {
    const encontrados = perfis.filter((p) => p.codigos.has(item.codigo));

    if (encontrados.length === 0) {
      return {
        codigo: item.codigo,
        descricao: item.descricao ?? null,
        perfilAtual: item.perfilAtual ?? null,
        perfilEncontrado: null,
        perfisEncontrados: null,
        status: 'SEM_PERFIL',
        observacao: 'Código não cadastrado em nenhum perfil de referência.',
      };
    }

    if (encontrados.length > 1) {
      return {
        codigo: item.codigo,
        descricao: item.descricao ?? null,
        perfilAtual: item.perfilAtual ?? null,
        perfilEncontrado: null,
        perfisEncontrados: encontrados.map((p) => p.nome).join(', '),
        status: 'DUPLICADO',
        observacao: 'Código cadastrado em mais de um perfil de referência — corrigir o cadastro de perfis.',
      };
    }

    const perfil = encontrados[0].nome;
    // Sem perfilAtual declarado na planilha importada, não há o que comparar
    // — reporta o perfil encontrado no Protheus como OK, sem marcar divergência.
    const divergente = !!item.perfilAtual && normalize(item.perfilAtual) !== normalize(perfil);
    return {
      codigo: item.codigo,
      descricao: item.descricao ?? null,
      perfilAtual: item.perfilAtual ?? null,
      perfilEncontrado: perfil,
      perfisEncontrados: null,
      status: divergente ? 'DIVERGENTE' : 'OK',
      observacao: divergente
        ? `Classificado como "${item.perfilAtual || '(vazio)'}" no cadastro, mas pertence a "${perfil}".`
        : null,
    };
  });
}
