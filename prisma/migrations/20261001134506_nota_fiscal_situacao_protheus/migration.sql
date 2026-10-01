-- CreateTable
CREATE TABLE "NotaFiscalSituacaoProtheus" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "empresaGrupoId" TEXT,
    "modelo" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "cStat" TEXT NOT NULL,
    "chave" TEXT,
    "dataEmissao" TEXT,
    "dataCancelamento" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotaFiscalSituacaoProtheus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotaFiscalSituacaoProtheus_companyId_empresaGrupoId_modelo__key" ON "NotaFiscalSituacaoProtheus"("companyId", "empresaGrupoId", "modelo", "serie", "numero");

-- AddForeignKey
ALTER TABLE "NotaFiscalSituacaoProtheus" ADD CONSTRAINT "NotaFiscalSituacaoProtheus_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscalSituacaoProtheus" ADD CONSTRAINT "NotaFiscalSituacaoProtheus_empresaGrupoId_fkey" FOREIGN KEY ("empresaGrupoId") REFERENCES "AnaliseFiscalCnpjGrupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

