-- CreateTable
CREATE TABLE "LegislacaoAnalise" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "modo" TEXT NOT NULL DEFAULT 'ANALISE',
    "nomeArquivo" TEXT NOT NULL,
    "nomeArquivoB" TEXT,
    "tipoDocumento" TEXT,
    "numero" TEXT,
    "dataDocumento" TEXT,
    "orgao" TEXT,
    "titulo" TEXT NOT NULL,
    "resumo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ANALISADA',
    "resultado" JSONB NOT NULL,
    "checklistMarcados" JSONB,
    "assinaturaId" TEXT,
    "modelo" TEXT,
    "paginas" INTEGER,
    "leituraTexto" BOOLEAN NOT NULL DEFAULT false,
    "tokensEntrada" INTEGER,
    "tokensSaida" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegislacaoAnalise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegislacaoAssinatura" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "setor" TEXT,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegislacaoAssinatura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegislacaoAnalise_companyId_createdAt_idx" ON "LegislacaoAnalise"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "LegislacaoAssinatura_companyId_idx" ON "LegislacaoAssinatura"("companyId");

-- AddForeignKey
ALTER TABLE "LegislacaoAnalise" ADD CONSTRAINT "LegislacaoAnalise_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegislacaoAssinatura" ADD CONSTRAINT "LegislacaoAssinatura_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
