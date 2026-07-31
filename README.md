# Portal Fiscal e Contábil — MVP (Fase 0 + Fase 1)

Aplicação web (Next.js + TypeScript + Prisma + SQLite) implementando a **Fase 0**
(fundação: autenticação, permissões, multiempresa, dashboard) e a **Fase 1**
(primeiro módulo de valor) do escopo do projeto:

- ✅ Login, logout, recuperação de senha, alteração de senha
- ✅ Perfis de acesso (Administrador, Gestor, Analista, Usuário, Cliente) com controle por módulo
- ✅ Suporte multiempresa (um usuário pode ter papéis diferentes em empresas diferentes)
- ✅ Dashboard com indicadores, atalhos e histórico de atividades
- ✅ **Conversor de SPED Fiscal para Excel** (importação de TXT, separação por blocos/registros, filtros, exportação genérica **e** exportação no layout exato do modelo "NF-e de Entrada e Saída" fornecido pelo cliente)
- ✅ **Apuração de ICMS Antecipado Especial** (importação de dois relatórios — notas de entrada e pagamentos SEFA —, mapeamento de colunas assistido, cruzamento automático, cálculo por TES/UF/origem do produto, dashboard com gráficos, notas pagas/pendentes com filtros, alertas de divergência e de alíquota não identificada, histórico de apurações, exportação Excel e PDF)
- ✅ **DIFAL — Diferencial de Alíquota** (cálculo automático a partir do relatório de entradas, método "por dentro" — Convênio ICMS 236/2021 —, identificação de notas por CFOP, memória de cálculo por item, resumo por nota fiscal, alertas de inconsistência, histórico de apurações, exportação Excel)
- ✅ **Conciliação Contábil** (compara Balancete x Razão por conta, identifica lançamentos duplicados/sem histórico/fora do padrão, contas sem movimentação, dashboard e relatório exportável — sem uso de IA, só regras determinísticas)
- ✅ **Conciliação Bancária** (Razão da conta Banco × Extrato Bancário, saldo dia a dia, pareamento inteligente incluindo agrupamentos N:1 e 1:N, sugestão de natureza para pendências)
- ✅ **Auditor RTC** (validação em lote de XMLs de NF-e quanto aos grupos IBS/CBS da Reforma Tributária — NT 2025.002 —, processamento local no navegador, regras configuráveis, correlação com eventos de cancelamento)
- ✅ Gestão de usuários e permissões por empresa
- ✅ Registro de logs/atividades

> ⚠️ **Importante sobre este ambiente:** este código foi escrito integralmente,
> mas eu não consegui rodar `npm install` para testá-lo de ponta a ponta aqui,
> porque o ambiente de sandbox onde estou não tinha acesso à internet liberado
> no momento da criação (mesmo domínios normalmente permitidos, como
> registry.npmjs.org, retornaram bloqueio). O código segue os padrões corretos
> do Next.js 14 / Prisma / React, mas **recomendo rodar os passos abaixo e me
> avisar se algum erro aparecer** — corrijo rapidamente.

## Identidade visual (atualização de design)

O portal passou por uma repaginação visual completa, mantendo a paleta de
cores da Fort Fruit:

- **Tipografia**: Space Grotesk (títulos/destaques), Inter (texto/interface) e IBM Plex Mono (valores monetários e códigos de conta) — carregadas via `next/font/google` (precisa de internet na primeira vez que rodar `npm run dev`/`npm run build`, depois fica em cache local).
- **Novo componente de ícones**: `lucide-react`, substituindo os emojis do menu por ícones vetoriais.
- **Elemento de assinatura**: um motivo de arcos sobrepostos (classe `.brand-arcs` em `globals.css`), inspirado no padrão gráfico da marca Fort Fruit, usado no hero do Dashboard e na tela de login — feito em CSS puro, sem depender de imagem.
- **Cards padronizados**: todas as telas agora usam a classe `.card-surface` (sombra suave com leve tom esverdeado, cantos mais arredondados) em vez do estilo genérico anterior.
- Menu lateral reorganizado em grupos (Visão geral / Módulos fiscais / Administração); os links de **Histórico** de cada apuração saíram do menu principal (por pedido do cliente, para deixar o menu mais limpo) e agora aparecem como um link contextual "Histórico" dentro de cada módulo (ICMS, DIFAL, Conciliação).
- Dashboard inicial reformulado com banner de boas-vindas, cards de indicadores com ícones, atalhos rápidos em blocos e histórico de atividades em formato de linha do tempo.

## Pré-requisitos

- Node.js 18 ou superior instalado ([nodejs.org](https://nodejs.org))

## Como rodar localmente

```bash
# 1. Entrar na pasta do projeto
cd portal-fiscal

# 2. Instalar dependências
npm install

# 3. Criar o banco de dados SQLite e as tabelas
npx prisma migrate dev --name init

# 4. Popular com dados de demonstração (usuários, empresas, alíquotas)
npm run seed

# 5. Rodar em modo desenvolvimento
npm run dev
```

Acesse **http://localhost:3000** no navegador.

## Usuários de demonstração (criados pelo seed)

| E-mail                      | Senha         | Perfil          | Empresas                                   |
|------------------------------|---------------|------------------|---------------------------------------------|
| admin@portalfiscal.com       | admin123      | Administrador    | Empresa Demonstração LTDA, Filial Comércio Sul LTDA |
| analista@portalfiscal.com    | analista123   | Analista         | Empresa Demonstração LTDA                   |

Use o admin para testar a troca de empresa (seletor no topo) e a tela de
usuários/permissões. Use o analista para ver o portal com um perfil mais restrito.

## Testando os módulos

Na pasta `exemplos/` deste projeto há arquivos prontos para teste:

- `exemplo-sped-fiscal.txt` — arquivo SPED Fiscal simplificado para testar o conversor
- `exemplo-A-notas-entrada.xlsx` — relatório de notas de entrada (arquivo A) para o módulo de ICMS Antecipado Especial
- `exemplo-B-notas-pagas.xlsx` — relatório de pagamentos SEFA (arquivo B) para o mesmo módulo

No módulo **ICMS Antecipado Especial**, envie os dois arquivos (ou marque "Não houve
pagamento no mês" e envie só o arquivo A), confira o mapeamento de colunas sugerido
automaticamente, informe o período e clique em "Processar cruzamento". Note que os
exemplos incluem propositalmente uma nota com TES não elegível (para mostrar o
contador de "itens desconsiderados") e duas notas com valor pago diferente do
calculado (para mostrar o alerta de divergência).

## Estrutura do projeto

```
src/
  lib/            → conexão com banco (Prisma), autenticação, permissões,
                     parser de SPED e motor de cálculo do ICMS
  middleware.ts   → protege rotas /dashboard
  app/
    login/        → tela de login e recuperação de senha
    reset-senha/  → confirmação de nova senha
    dashboard/    → área autenticada (sidebar + topbar + módulos)
    api/          → rotas de backend (auth, empresas, sped, icms, usuários)
prisma/
  schema.prisma   → modelos de dados (User, Company, Membership, SpedFile, IcmsNota, IcmsRate, ActivityLog)
  seed.ts         → dados de demonstração
```

## Relatório "NF-e de Entrada e Saída" (layout do modelo)

Depois de importar um arquivo SPED Fiscal no módulo Conversor de SPED, um botão
extra permite gerar o Excel já no layout, colunas e formatação do modelo
fornecido pela empresa (arquivo de referência em `exemplos/MODELO_DE_RELATORIO.xlsx`).
Cada linha do relatório é um item de nota fiscal (junção dos registros C100 +
C170 do SPED, com dados complementares de 0000, 0150 e 0200).

**Por pedido do cliente**, as colunas abaixo não existem no SPED puro e ficam
em branco no relatório gerado: `Tes`, `Livro Fiscal`, `BCC`. A coluna `Filial`
foi substituída pelo CNPJ do estabelecimento (registro 0000), conforme
combinado.

**Premissas assumidas** onde o SPED não tem o dado 1:1 com o modelo (ajustáveis
em `src/lib/sped-nfe-report.ts`, todas comentadas no código):
- **Frete / Despesa / Seguro**: o SPED só tem esses valores por documento
  (nota), não por item. O relatório rateia esses valores proporcionalmente ao
  valor de cada item dentro da nota.
- **Base (Isento) / Base (Outros) / Base (N. Trib)**: derivadas do CST de
  ICMS do item (isento: CST 40/41/50; não tributada: CST 30; outros: CST 90) —
  esse agrupamento pode variar de empresa para empresa; ajustar a função
  `classificarBaseIcms` se o critério usado internamente for diferente.
- **Unitário**: calculado como Valor do Item ÷ Quantidade, pois o SPED não
  traz um campo de valor unitário separado.
- **UF da NF**: derivada dos dois primeiros dígitos do código de município
  (IBGE) do participante, já que o registro 0150 não tem um campo de UF direto.

Se qualquer uma dessas premissas não corresponder ao que a equipe fiscal
espera, é só avisar — são fáceis de ajustar.

## DIFAL — Diferencial de Alíquota

Módulo que calcula o DIFAL a partir do relatório de entradas (mesmo layout
"NF-e de Entrada e Saída" usado no Conversor de SPED — arquivo de exemplo em
`exemplos/exemplo-entrada-difal.xlsx`). A metodologia foi **validada
diretamente com planilhas reais fornecidas pela empresa**, batendo o cálculo
item a item:

```
Valor Origem = Valor Total x Alíquota Interestadual
Base ICMS    = (Valor Total - Valor Origem) / (1 - Alíquota Interna do destino)
ICMS Destino = Base ICMS x Alíquota Interna do destino
DIFAL        = ICMS Destino - Valor Origem
```

Isso corresponde ao método **"por dentro"**, do Convênio ICMS 236/2021.

**Regras aplicadas:**
- Notas com CFOP **2551** (ativo imobilizado) ou **2556** (uso e consumo) geram DIFAL. CFOPs iniciados em "1" (operação dentro do mesmo estado) **nunca** geram DIFAL e são sempre ignorados — mesmo compras de uso/consumo ou ativo imobilizado, se forem intraestaduais.
- **Base de cálculo**: `Vlr Total (bruto) − Desconto + Frete + Despesa/IPI`, usando as colunas correspondentes do relatório de entrada quando existirem (se as colunas Desconto/Frete/Despesa não existirem no arquivo, o sistema assume zero para elas sem dar erro).
- Alíquota interestadual: **7%** para fornecedores de MG/PR/RS/RJ/SC/SP, **12%** para as demais UFs, **4%** quando a "Origem" do produto indica mercadoria importada (códigos 1, 2, 6 ou 7).
- Alíquota interna de destino: configurável em **Configurações Fiscais** (menu lateral, acesso Administrador) — já vem com Pará/19% pré-configurado, mas pode ser alterada por empresa.
- **FCP não é calculado** neste módulo, pois a prática atual da empresa não o inclui na apuração.
- Itens sem UF do fornecedor identificada (ou sem valor) são marcados como **inconsistência** e não entram no total — aparecem destacados na tela para revisão manual.
- A **exportação em Excel** segue o layout do relatório "Detalhamento de Classificação de Receita — 1141 Diferencial de Alíquota" já usado internamente (colunas Doc. Fiscal, Descrição, UF, Quant, VLR Un, Frete, VLR IPI + Despesa, Desconto, Vlr Total, Alíq. ICMS, Vlr Origem, BC ICMS, Alíq. PA, ICMS PA, Valor a pagar, com linha de TOTAL A PAGAR ao final).

## Auditor RTC — Validação de XMLs IBS/CBS (Reforma Tributária)

Módulo incorporado a partir de um artifact já validado pelo cliente em outra
conversa (portado fielmente, mantendo toda a lógica de parsing e as regras
de validação). Audita em lote os XMLs de NF-e quanto aos grupos **IBS/CBS**
da Reforma Tributária (conforme NT 2025.002).

**Processamento 100% no navegador**: os arquivos XML são lidos e analisados
inteiramente no lado do cliente (`DOMParser`, sem upload) — só o **resultado
calculado** (não o XML bruto) é enviado ao servidor do portal para ficar
salvo no histórico, mantendo o mesmo princípio de privacidade do artifact
original.

**O que audita, por item da nota:**
- Presença dos grupos `<IBSCBS>`, `<gIBSCBS>`/`<gIBSCBSMono>`, `<gIBSUF>`, `<gIBSMun>`, `<gCBS>` e das tags `CST`, `cClassTrib`, `vBC`, `vIBS`.
- Consistência de cálculo: `vIBS = vIBSUF + vIBSMun`, `vCBS ≈ vBC × pCBS`, e alerta para CST 000 com base de cálculo zerada.
- Regras são **configuráveis** (podem ser desmarcadas), com recálculo instantâneo no navegador, sem precisar reprocessar os XMLs.
- Correlaciona eventos de **cancelamento** (mesmo vindos em arquivo separado do evento) com a NF-e original pela chave de acesso — inclusive quando a NF-e cancelada não está no lote importado (cria um registro "órfão" a partir do evento).
- Campos de **PIS/COFINS são só informativos** (extraídos do XML tal como estão) — nunca influenciam a situação de validação do item, que é calculada exclusivamente pelas regras de IBS/CBS.

Arquivos de exemplo em `exemplos/`: `exemplo-nfe-valida.xml` (sem
pendências), `exemplo-nfe-inconsistente.xml` (um item sem `gIBSMun`, outro
com `vCBS` incompatível com o cálculo), `exemplo-nfe-cancelada.xml`
(cStat 101 no próprio protocolo) e `exemplo-evento-cancelamento.xml` (evento
de cancelamento de uma NF-e que não está no lote — testa a criação do
registro "órfão").



Módulo dedicado para a conciliação da conta Banco — a mais comum e a que o
cliente pediu para priorizar. Reproduz o processo real de um contador no
fechamento: primeiro confere o **saldo dia a dia**, depois pareia os
lançamentos individuais. Arquivos de exemplo em
`exemplos/exemplo-razao-banco.xlsx` e `exemplos/exemplo-extrato-banco.xlsx`
(sintéticos, mas com todos os cenários abaixo representados e validados).

**Como funciona o pareamento** (`src/lib/conciliacao-bancaria.ts`), nesta ordem:
1. **Exato** — mesma data e mesmo valor nos dois lados.
2. **Diferença de competência** — mesmo valor, datas diferentes (até 3 dias) — ex: um pagamento compensado alguns dias depois de emitido.
3. **Agrupamento (N:1 e 1:N)** — testa se um lançamento de um lado corresponde à soma de até 4 lançamentos do outro lado, dentro da janela de 3 dias. Cobre os casos citados pelo cliente: uma venda de R$100 recebida em duas parcelas de R$50, ou vice-versa.
4. **Duplicados** — lançamentos com mesma data e valor repetidos no mesmo lado são sinalizados como possível duplicidade, mesmo que um deles tenha conseguido par.
5. **Pendentes** — o que sobra sem par: se está só no Razão, é tratado como "contabilizado mas não localizado no banco" (ex: cheque não compensado); se está só no Extrato, o sistema sugere a natureza provável por palavra-chave no histórico (tarifa, juros/IOF, PIX/TED, rendimento de aplicação, folha de pagamento etc.) — texto explicando cada divergência, sem uso de IA.

**Saldo dia a dia**: cada arquivo pode trazer uma coluna de saldo corrente
(ex: "SALDO ATUAL" no Razão, "Saldo" no Extrato) — se presente, o sistema
compara o saldo de fechamento de cada dia entre as duas fontes e destaca os
dias com diferença. A ordem cronológica de cada arquivo (ascendente ou
descendente) é **detectada automaticamente**, então funciona tanto com
Razão/Extrato em ordem crescente quanto decrescente.

**Nota sobre os arquivos de teste que o cliente enviou**: ao analisar o
Razão e o Extrato reais fornecidos, percebi que o saldo de abertura batia
exatamente entre os dois (confirmando que a estrutura das colunas foi
entendida corretamente), mas os saldos diários não se reconciliavam — o que
sugere que eram exportações de teste não 100% pareadas, não um problema na
lógica. Por isso, o exemplo incluso foi construído do zero para validar
cada cenário de forma controlada.

## Conciliação Contábil

Módulo enxuto e sem IA (por pedido do cliente), que compara o **Balancete**
(saldos por conta) com o **Razão** (lançamentos individuais) de um mesmo
período — e se adapta ao que for importado. Arquivos de exemplo em
`exemplos/exemplo-balancete.xlsx`, `exemplos/exemplo-razao.xlsx` (várias
contas), `exemplos/exemplo-razao-conta-unica-bradesco.xlsx` (uma única conta,
para testar o modo de análise focada) e `exemplos/exemplo-extrato-bancario.xlsx`.

**Modos de análise (o sistema decide sozinho, pelo que foi importado):**
- **Só Balancete** (Razão não importado): analisa todas as contas do Balancete — sinaliza contas sem movimentação, saldo elevado (comparado à média das demais contas), saldo antigo parado (via histórico de conciliações anteriores) e saldo invertido (se houver coluna de Natureza D/C no Balancete).
- **Conta(s) específica(s)** (Razão importado): analisa **somente** as contas presentes no arquivo do Razão — se você importar o Razão de uma única conta (ex: só o Bradesco), a análise é feita só naquela conta, não no Balancete inteiro. Para cada conta: diferença de saldo/débito/crédito, lançamentos duplicados, sem histórico, fora do padrão, saldo invertido, e lançamentos cujo histórico sugere pertencer a outra categoria de conta (ex: um lançamento de "salário" dentro de uma conta de Fornecedores).
- **Extrato Bancário** (opcional, junto com o Razão de uma conta): compara o saldo calculado com o saldo do extrato e aponta lançamentos do Razão sem correspondência de data+valor no extrato. Só suporta Excel/CSV nesta versão — **OFX ainda não é suportado**.

**Sobre o alerta "lançamento parece pertencer a outra conta":** é um heurístico por palavras-chave no histórico (ex: "salário", "fornecedor", "cliente", "imposto"), não é IA. Só é aplicado quando a própria conta tem uma categoria clara pela descrição — por isso não dispara em contas de movimentação livre como Caixa/Bancos (onde é normal ter lançamentos de várias naturezas).

**Sobre o alerta "saldo invertido":** só funciona se o Balancete tiver uma coluna de Natureza (D/C). Assume a convenção comum de saldo devedor positivo e saldo credor negativo — se o arquivo de vocês usar outra convenção, me avisem para eu ajustar.

**Deixado para uma próxima etapa** (aguardando exemplo de arquivo para implementar certinho, como fizemos com o DIFAL): cruzamento com Contas a Pagar, Contas a Receber, Folha de Pagamento e Visão Gerencial do Protheus — os checkboxes já aparecem na tela, desabilitados, como lembrete.

## Limitações conhecidas deste MVP (a evoluir nas próximas fases)

- **Processamento de SPED é síncrono** — adequado para arquivos de teste/médio
  porte. Para arquivos muito grandes em produção, mover para fila assíncrona
  (Redis/RabbitMQ), conforme já recomendado no documento de escopo.
- **Conversor de SPED é genérico** — separa por bloco/registro e exporta todos
  os campos como colunas numeradas (Campo1, Campo2...), sem nomear
  semanticamente cada campo de cada um dos ~200 registros possíveis do layout
  oficial (isso é um trabalho grande à parte, específico por registro).
- **Regras do ICMS Antecipado Especial são constantes fixas no código**
  (`src/lib/icms-rules.ts`): TES elegíveis, alíquotas por UF (12%/7%) e a regra
  de importação (15%). Para alterar essas regras hoje é preciso editar esse
  arquivo. Se a legislação mudar com frequência, uma evolução futura é mover
  essas constantes para uma tabela editável pelo administrador (semelhante ao
  que fizemos no protótipo anterior deste módulo).
- **Recuperação de senha não envia e-mail** — não há provedor de e-mail
  configurado neste MVP; o link de redefinição é exibido diretamente na tela
  (documentado no código). Antes de produção, integrar um provedor (SES,
  SendGrid, Postmark etc.).
- **Banco de dados é SQLite** (arquivo local `dev.db`) — ótimo para
  desenvolvimento e demonstração. Para produção, trocar `provider` no
  `prisma/schema.prisma` para `postgresql` e ajustar `DATABASE_URL` no `.env`.

## Próximos passos sugeridos

Isso corresponde à Fase 0 + Fase 1 do documento de escopo. As próximas fases
(Sistema de ICMS Antecipado já parcialmente coberto, Calculadoras Tributárias
completas, Conversor de SPED Contribuições, Análise Fiscal, Relatórios, Central
de Documentos, IA) podem ser adicionadas como novos módulos sem alterar esta
estrutura — é exatamente para isso que a arquitetura foi desenhada.
