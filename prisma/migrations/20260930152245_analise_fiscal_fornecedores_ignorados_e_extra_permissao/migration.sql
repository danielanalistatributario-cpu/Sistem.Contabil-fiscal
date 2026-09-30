-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "analiseFiscalConfigExtra" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AnaliseFiscalFornecedorIgnorado" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "empresaGrupoId" TEXT,
    "codigoFornecedor" TEXT NOT NULL,
    "nome" TEXT,
    "motivo" TEXT NOT NULL DEFAULT 'Simples Nacional',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnaliseFiscalFornecedorIgnorado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnaliseFiscalFornecedorIgnorado_companyId_empresaGrupoId_co_key" ON "AnaliseFiscalFornecedorIgnorado"("companyId", "empresaGrupoId", "codigoFornecedor");

-- AddForeignKey
ALTER TABLE "AnaliseFiscalFornecedorIgnorado" ADD CONSTRAINT "AnaliseFiscalFornecedorIgnorado_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnaliseFiscalFornecedorIgnorado" ADD CONSTRAINT "AnaliseFiscalFornecedorIgnorado_empresaGrupoId_fkey" FOREIGN KEY ("empresaGrupoId") REFERENCES "AnaliseFiscalCnpjGrupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

