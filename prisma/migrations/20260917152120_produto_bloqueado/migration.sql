-- CreateTable
CREATE TABLE "ProdutoBloqueado" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "empresaGrupoId" TEXT,
    "codigo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProdutoBloqueado_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProdutoBloqueado" ADD CONSTRAINT "ProdutoBloqueado_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoBloqueado" ADD CONSTRAINT "ProdutoBloqueado_empresaGrupoId_fkey" FOREIGN KEY ("empresaGrupoId") REFERENCES "AnaliseFiscalCnpjGrupo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
