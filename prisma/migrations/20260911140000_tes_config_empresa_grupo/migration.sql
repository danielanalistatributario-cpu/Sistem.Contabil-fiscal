-- DropIndex
DROP INDEX "AnaliseFiscalTesConfig_companyId_codigo_key";

-- AlterTable
ALTER TABLE "AnaliseFiscalTesConfig" ADD COLUMN     "empresaGrupoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AnaliseFiscalTesConfig_companyId_empresaGrupoId_codigo_key" ON "AnaliseFiscalTesConfig"("companyId", "empresaGrupoId", "codigo");

-- AddForeignKey
ALTER TABLE "AnaliseFiscalTesConfig" ADD CONSTRAINT "AnaliseFiscalTesConfig_empresaGrupoId_fkey" FOREIGN KEY ("empresaGrupoId") REFERENCES "AnaliseFiscalCnpjGrupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
