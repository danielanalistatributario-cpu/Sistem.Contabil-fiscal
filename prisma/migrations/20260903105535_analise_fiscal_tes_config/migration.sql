-- CreateTable
CREATE TABLE "AnaliseFiscalTesConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "chaveNf" TEXT NOT NULL,
    "permiteProdutos" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnaliseFiscalTesConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnaliseFiscalCnpjGrupo" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnaliseFiscalCnpjGrupo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnaliseFiscalTesConfig_companyId_codigo_key" ON "AnaliseFiscalTesConfig"("companyId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "AnaliseFiscalCnpjGrupo_companyId_cnpj_key" ON "AnaliseFiscalCnpjGrupo"("companyId", "cnpj");

-- AddForeignKey
ALTER TABLE "AnaliseFiscalTesConfig" ADD CONSTRAINT "AnaliseFiscalTesConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnaliseFiscalCnpjGrupo" ADD CONSTRAINT "AnaliseFiscalCnpjGrupo_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
