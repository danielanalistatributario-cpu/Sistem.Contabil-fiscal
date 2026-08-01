-- CreateTable
CREATE TABLE "PerfilProduto" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerfilProduto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerfilProdutoItem" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT,

    CONSTRAINT "PerfilProdutoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidacaoCadastroApuracao" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodo" TEXT,
    "totalItens" INTEGER NOT NULL,
    "totalOk" INTEGER NOT NULL,
    "totalDivergente" INTEGER NOT NULL,
    "totalSemPerfil" INTEGER NOT NULL,
    "totalDuplicado" INTEGER NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidacaoCadastroApuracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidacaoCadastroItem" (
    "id" TEXT NOT NULL,
    "apuracaoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT,
    "perfilAtual" TEXT,
    "perfilEncontrado" TEXT,
    "perfisEncontrados" TEXT,
    "status" TEXT NOT NULL,
    "observacao" TEXT,

    CONSTRAINT "ValidacaoCadastroItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PerfilProduto_companyId_nome_key" ON "PerfilProduto"("companyId", "nome");

-- CreateIndex
CREATE INDEX "PerfilProdutoItem_perfilId_codigo_idx" ON "PerfilProdutoItem"("perfilId", "codigo");

-- AddForeignKey
ALTER TABLE "PerfilProduto" ADD CONSTRAINT "PerfilProduto_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfilProdutoItem" ADD CONSTRAINT "PerfilProdutoItem_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "PerfilProduto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidacaoCadastroApuracao" ADD CONSTRAINT "ValidacaoCadastroApuracao_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidacaoCadastroItem" ADD CONSTRAINT "ValidacaoCadastroItem_apuracaoId_fkey" FOREIGN KEY ("apuracaoId") REFERENCES "ValidacaoCadastroApuracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
