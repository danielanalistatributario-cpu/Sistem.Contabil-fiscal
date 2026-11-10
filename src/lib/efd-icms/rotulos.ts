// Rótulos oficiais usados nos relatórios (mesma redação do PVA do SPED).

export const SITUACAO_DOC: Record<string, string> = {
  '00': 'Documento regular',
  '01': 'Escrituração extemporânea de documento regular',
  '02': 'Documento cancelado',
  '03': 'Escrituração extemporânea de documento cancelado',
  '04': 'NF-e, NFC-e ou CT-e denegado',
  '05': 'NF-e, NFC-e ou CT-e com numeração inutilizada',
  '06': 'Documento fiscal complementar',
  '07': 'Escrituração extemporânea de documento complementar',
  '08': 'Documento fiscal emitido com base em Regime Especial ou Norma Específica',
};

// documentos sem valores nos registros analíticos
export const SIT_SEM_VALOR = new Set(['02', '03', '04', '05']);

export const MODELO_DOC: Record<string, string> = {
  '01': 'NF',
  '1B': 'NF Avulsa',
  '02': 'NF Venda a Consumidor',
  '04': 'NF Produtor',
  '06': 'NF/Conta Energia',
  '07': 'NF Serv. Transporte',
  '08': 'CTRC',
  '09': 'CT Aquaviário',
  '10': 'CT Aéreo',
  '11': 'CT Ferroviário',
  '13': 'Bilhete Passagem Rodoviário',
  '14': 'Bilhete Passagem Aquaviário',
  '15': 'Bilhete Passagem Bagagem',
  '17': 'Despacho de Transporte',
  '18': 'Resumo Movimento Diário',
  '20': 'Ordem de Coleta',
  '21': 'NF Serviço de Comunicação',
  '22': 'NF Serviço de Telecomunicação',
  '23': 'GNRE',
  '24': 'Autorização de Carregamento',
  '25': 'Manifesto de Carga',
  '26': 'CT Multimodal',
  '27': 'NF Transp. Ferroviário',
  '28': 'NF/Conta Gás',
  '29': 'NF/Conta Água',
  '55': 'NF-e',
  '57': 'CT-e',
  '59': 'CF-e SAT',
  '60': 'CF-e ECF',
  '63': 'BP-e',
  '65': 'NFC-e',
  '67': 'CT-e OS',
};

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function rotuloMes(ym: string): string {
  const m = parseInt(ym.slice(4, 6), 10);
  return `${MESES[m - 1] ?? ym.slice(4, 6)}/${ym.slice(0, 4)}`;
}
export function rotuloMesCurto(ym: string): string {
  const m = parseInt(ym.slice(4, 6), 10);
  return `${MESES_ABREV[m - 1] ?? ym.slice(4, 6)}/${ym.slice(2, 4)}`;
}

// Rótulos do relatório "Registros Fiscais da Apuração do ICMS - Operações Próprias" (PVA)
export const ROTULOS_E110: { campo: string; rotulo: string }[] = [
  { campo: 'vlTotDebitos', rotulo: 'SAÍDAS E PRESTAÇÕES COM DÉBITO DO IMPOSTO' },
  { campo: 'vlAjDebitos', rotulo: 'VALOR TOTAL DOS AJUSTES A DÉBITO (decorrentes do documento fiscal)' },
  { campo: 'vlTotAjDebitos', rotulo: 'VALOR TOTAL DOS AJUSTES A DÉBITO DO IMPOSTO' },
  { campo: 'vlEstornosCred', rotulo: 'VALOR TOTAL DOS ESTORNOS DE CRÉDITOS' },
  { campo: 'vlTotCreditos', rotulo: 'VALOR TOTAL DOS CRÉDITOS POR ENTRADAS E AQUISIÇÕES COM CRÉDITO DO IMPOSTO' },
  { campo: 'vlAjCreditos', rotulo: 'VALOR TOTAL DOS AJUSTES A CRÉDITO (decorrentes do documento fiscal)' },
  { campo: 'vlTotAjCreditos', rotulo: 'VALOR TOTAL DOS AJUSTES A CRÉDITO DO IMPOSTO' },
  { campo: 'vlEstornosDeb', rotulo: 'VALOR TOTAL DOS ESTORNOS DE DÉBITOS' },
  { campo: 'vlSldCredorAnt', rotulo: 'VALOR TOTAL DO SALDO CREDOR DO PERÍODO ANTERIOR' },
  { campo: 'vlSldApurado', rotulo: 'VALOR DO SALDO DEVEDOR' },
  { campo: 'vlTotDed', rotulo: 'VALOR TOTAL DAS DEDUÇÕES' },
  { campo: 'vlIcmsRecolher', rotulo: 'VALOR TOTAL DO ICMS A RECOLHER' },
  { campo: 'vlSldCredorTransportar', rotulo: 'VALOR TOTAL DO SALDO CREDOR A TRANSPORTAR PARA O PERÍODO SEGUINTE' },
  { campo: 'debEsp', rotulo: 'VALORES RECOLHIDOS OU A RECOLHER, EXTRA-APURAÇÃO' },
];

// Tipo do ajuste = 4º caractere do código (tabela 5.1.1 do Guia Prático da EFD:
// 1º-2º = UF · 3º = tipo de apuração (0 = ICMS próprio) · 4º = tipo do ajuste).
// Corrigido em 09/11/2026: antes lia o 3º caractere e tratava o crédito
// SP020718 (R$ 30,90 em 06/2018) como débito. Confirmado contra o E110 dos
// SPEDs de 2018 (E111 de débito + E111 de crédito = campos do E110).
export const CATEGORIA_AJUSTE: Record<string, string> = {
  '0': 'Outros débitos',
  '1': 'Estorno de créditos',
  '2': 'Outros créditos',
  '3': 'Estorno de débitos',
  '4': 'Deduções do imposto apurado',
  '5': 'Débito especial',
};

export const brl = (n: number | null | undefined): string => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtDataBr = (iso: string | null | undefined): string => (iso ? iso.split('-').reverse().join('/') : '');
export const fmtCnpj = (d: string): string => {
  const n = (d || '').replace(/\D/g, '');
  if (n.length === 14) return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (n.length === 11) return n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return d || '';
};
