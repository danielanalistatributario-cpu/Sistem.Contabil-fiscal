-- DropIndex
DROP INDEX "AnaliseFiscalProdutoClassificacao_companyId_codigoProduto_key";

-- AlterTable
ALTER TABLE "AnaliseFiscalProdutoClassificacao" ADD COLUMN     "empresaGrupoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AnaliseFiscalProdutoClassificacao_companyId_empresaGrupoId__key" ON "AnaliseFiscalProdutoClassificacao"("companyId", "empresaGrupoId", "codigoProduto");

-- AddForeignKey
ALTER TABLE "AnaliseFiscalProdutoClassificacao" ADD CONSTRAINT "AnaliseFiscalProdutoClassificacao_empresaGrupoId_fkey" FOREIGN KEY ("empresaGrupoId") REFERENCES "AnaliseFiscalCnpjGrupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
