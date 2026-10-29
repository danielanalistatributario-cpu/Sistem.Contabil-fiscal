// Modelos visuais do comunicado (Analisador de Legislação). O conteúdo é
// o mesmo (Comunicado); muda só o layout/paleta. Cada análise guarda o
// modelo escolhido em resultado.modeloVisual; análise nova recebe o
// próximo modelo da lista em relação à última análise da empresa, pra
// os comunicados não saírem sempre com a mesma cara.

export const MODELOS_VISUAIS = [
  { id: 'corporativo', nome: 'Corporativo', descricao: 'Cabeçalho verde, data em destaque e cartões', cores: ['#00753A', '#F6921E'] },
  { id: 'linha-do-tempo', nome: 'Linha do tempo', descricao: 'Datas em sequência no topo, ideal para cronogramas', cores: ['#0F2A3D', '#00A69C'] },
  { id: 'alerta', nome: 'Alerta de prazo', descricao: 'Contagem de dias e checklist em evidência', cores: ['#BE1E2D', '#F6B21E'] },
  { id: 'executivo', nome: 'Executivo', descricao: 'Branco, tipográfico, seções numeradas', cores: ['#111827', '#00753A'] },
  { id: 'mosaico', nome: 'Mosaico', descricao: 'Blocos coloridos lado a lado, estilo infográfico', cores: ['#6D28D9', '#EC297B'] },
] as const;

export type ModeloVisual = (typeof MODELOS_VISUAIS)[number]['id'];

export function ehModeloVisual(v: unknown): v is ModeloVisual {
  return MODELOS_VISUAIS.some((m) => m.id === v);
}

// Próximo modelo depois do último usado (rodízio).
export function proximoModelo(ultimo: unknown): ModeloVisual {
  const i = MODELOS_VISUAIS.findIndex((m) => m.id === ultimo);
  return MODELOS_VISUAIS[(i + 1) % MODELOS_VISUAIS.length].id;
}

// Análises antigas (sem modelo salvo): modelo fixo derivado do id, pra
// também variarem entre si em vez de abrirem todas no Corporativo.
export function modeloDaAnalise(id: string, salvo: unknown): ModeloVisual {
  if (ehModeloVisual(salvo)) return salvo;
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return MODELOS_VISUAIS[h % MODELOS_VISUAIS.length].id;
}

// "01/12/2026" → dias a partir de hoje (negativo = já passou); null se não for data.
export function diasAte(dataBr: string): number | null {
  const m = dataBr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const alvo = Date.UTC(+m[3], +m[2] - 1, +m[1]);
  const h = new Date();
  const hoje = Date.UTC(h.getFullYear(), h.getMonth(), h.getDate());
  return Math.round((alvo - hoje) / 86400000);
}
