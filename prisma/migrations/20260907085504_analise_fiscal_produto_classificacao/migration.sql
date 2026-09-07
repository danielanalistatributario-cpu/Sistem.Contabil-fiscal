-- AlterTable
ALTER TABLE "AnaliseFiscalTesConfig" ADD COLUMN     "naturezaOperacao" TEXT NOT NULL DEFAULT 'LIVRE';

-- CreateTable
CREATE TABLE "AnaliseFiscalProdutoClassificacao" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "codigoProduto" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "classificacao" TEXT NOT NULL,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnaliseFiscalProdutoClassificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnaliseFiscalProdutoClassificacao_companyId_codigoProduto_key" ON "AnaliseFiscalProdutoClassificacao"("companyId", "codigoProduto");

-- AddForeignKey
ALTER TABLE "AnaliseFiscalProdutoClassificacao" ADD CONSTRAINT "AnaliseFiscalProdutoClassificacao_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
