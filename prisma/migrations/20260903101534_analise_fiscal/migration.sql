-- CreateTable
CREATE TABLE "AnaliseFiscalApuracao" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodo" TEXT,
    "fileName" TEXT,
    "totalLinhas" INTEGER NOT NULL,
    "totalNotas" INTEGER NOT NULL,
    "totalProdutos" INTEGER NOT NULL,
    "totalTes" INTEGER NOT NULL,
    "totalCfops" INTEGER NOT NULL,
    "qtdTesNovas" INTEGER NOT NULL DEFAULT 0,
    "qtdCfopsNovos" INTEGER NOT NULL DEFAULT 0,
    "qtdNotasSemChave" INTEGER NOT NULL DEFAULT 0,
    "qtdDivergenciaCfopUf" INTEGER NOT NULL DEFAULT 0,
    "qtdDivergenciaIcms" INTEGER NOT NULL DEFAULT 0,
    "qtdDivergenciaPisCofins" INTEGER NOT NULL DEFAULT 0,
    "qtdProdutosIncompativeis" INTEGER NOT NULL DEFAULT 0,
    "totalDivergencias" INTEGER NOT NULL DEFAULT 0,
    "qtdCritico" INTEGER NOT NULL DEFAULT 0,
    "qtdAlto" INTEGER NOT NULL DEFAULT 0,
    "qtdMedio" INTEGER NOT NULL DEFAULT 0,
    "qtdBaixo" INTEGER NOT NULL DEFAULT 0,
    "qtdInformativo" INTEGER NOT NULL DEFAULT 0,
    "tesNovasEncontradas" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnaliseFiscalApuracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnaliseFiscalItem" (
    "id" TEXT NOT NULL,
    "apuracaoId" TEXT NOT NULL,
    "linha" INTEGER NOT NULL,
    "tes" TEXT NOT NULL,
    "tesConhecida" BOOLEAN NOT NULL DEFAULT false,
    "produtoCodigo" TEXT,
    "produtoDescricao" TEXT,
    "cfop" TEXT,
    "uf" TEXT,
    "fornecedor" TEXT,
    "cnpjCpf" TEXT,
    "chaveNf" TEXT,
    "numeroNf" TEXT,
    "total" DOUBLE PRECISION,
    "desconto" DOUBLE PRECISION,
    "frete" DOUBLE PRECISION,
    "despesa" DOUBLE PRECISION,
    "seguro" DOUBLE PRECISION,
    "valorContabil" DOUBLE PRECISION,
    "baseIcms" DOUBLE PRECISION,
    "valorIcms" DOUBLE PRECISION,
    "aliquotaIcms" DOUBLE PRECISION,
    "isento" DOUBLE PRECISION,
    "baseOutros" DOUBLE PRECISION,
    "basePis" DOUBLE PRECISION,
    "valorPis" DOUBLE PRECISION,
    "aliquotaPis" DOUBLE PRECISION,
    "baseCofins" DOUBLE PRECISION,
    "valorCofins" DOUBLE PRECISION,
    "aliquotaCofins" DOUBLE PRECISION,

    CONSTRAINT "AnaliseFiscalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnaliseFiscalDivergencia" (
    "id" TEXT NOT NULL,
    "apuracaoId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "severidade" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "regraEsperada" TEXT NOT NULL,
    "informacaoEncontrada" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "sugestaoCorrecao" TEXT,

    CONSTRAINT "AnaliseFiscalDivergencia_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AnaliseFiscalApuracao" ADD CONSTRAINT "AnaliseFiscalApuracao_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnaliseFiscalItem" ADD CONSTRAINT "AnaliseFiscalItem_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "AnaliseFiscalApuracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnaliseFiscalDivergencia" ADD CONSTRAINT "AnaliseFiscalDivergencia_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "AnaliseFiscalApuracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnaliseFiscalDivergencia" ADD CONSTRAINT "AnaliseFiscalDivergencia_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "AnaliseFiscalItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
