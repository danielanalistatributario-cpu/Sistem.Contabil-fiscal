-- DropIndex
DROP INDEX "PerfilProduto_companyId_nome_key";

-- AlterTable
ALTER TABLE "AnaliseFiscalCnpjGrupo" ADD COLUMN     "protheusPerfisUltimaSincronizacao" TIMESTAMP(3),
ADD COLUMN     "protheusSufixo" TEXT;

-- AlterTable
ALTER TABLE "PerfilProduto" ADD COLUMN     "empresaGrupoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PerfilProduto_companyId_empresaGrupoId_nome_key" ON "PerfilProduto"("companyId", "empresaGrupoId", "nome");

-- AddForeignKey
ALTER TABLE "PerfilProduto" ADD CONSTRAINT "PerfilProduto_empresaGrupoId_fkey" FOREIGN KEY ("empresaGrupoId") REFERENCES "AnaliseFiscalCnpjGrupo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
