-- CreateTable
CREATE TABLE "NormaXml" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'NT',
    "numero" TEXT NOT NULL,
    "versao" TEXT NOT NULL,
    "titulo" TEXT,
    "documentos" TEXT NOT NULL,
    "modelos" TEXT NOT NULL,
    "arquivoNome" TEXT,
    "paginas" INTEGER,
    "homologacaoEm" TEXT,
    "producaoEm" TEXT,
    "situacao" TEXT NOT NULL DEFAULT 'ATIVA',
    "marcos" JSONB NOT NULL,
    "campos" JSONB NOT NULL,
    "regras" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NormaXml_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidacaoXml" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "normaId" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "normaRotulo" TEXT NOT NULL,
    "arquivoNome" TEXT NOT NULL,
    "chave" TEXT,
    "numeroNf" TEXT,
    "serie" TEXT,
    "modelo" TEXT,
    "dataEmissao" TEXT,
    "tpAmb" TEXT,
    "emitenteDoc" TEXT,
    "emitenteNome" TEXT,
    "destinatarioDoc" TEXT,
    "destinatarioNome" TEXT,
    "ignorouVigencia" BOOLEAN NOT NULL DEFAULT false,
    "veredito" TEXT NOT NULL,
    "conformidade" INTEGER,
    "qtdConformes" INTEGER NOT NULL DEFAULT 0,
    "qtdAlertas" INTEGER NOT NULL DEFAULT 0,
    "qtdDivergencias" INTEGER NOT NULL DEFAULT 0,
    "qtdAusentes" INTEGER NOT NULL DEFAULT 0,
    "qtdIndevidos" INTEGER NOT NULL DEFAULT 0,
    "qtdNaoValidaveis" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "ocorrencias" JSONB NOT NULL,
    "regras" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidacaoXml_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NormaXml_companyId_numero_versao_key" ON "NormaXml"("companyId", "numero", "versao");

-- CreateIndex
CREATE INDEX "NormaXml_companyId_idx" ON "NormaXml"("companyId");

-- CreateIndex
CREATE INDEX "ValidacaoXml_companyId_createdAt_idx" ON "ValidacaoXml"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ValidacaoXml_normaId_idx" ON "ValidacaoXml"("normaId");

-- AddForeignKey
ALTER TABLE "NormaXml" ADD CONSTRAINT "NormaXml_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidacaoXml" ADD CONSTRAINT "ValidacaoXml_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidacaoXml" ADD CONSTRAINT "ValidacaoXml_normaId_fkey" FOREIGN KEY ("normaId") REFERENCES "NormaXml"("id") ON DELETE SET NULL ON UPDATE CASCADE;
