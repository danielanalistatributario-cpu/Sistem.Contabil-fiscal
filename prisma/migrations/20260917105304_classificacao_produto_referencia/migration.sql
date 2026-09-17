-- AlterTable
ALTER TABLE "ValidacaoCadastroItem" ADD COLUMN     "cClassTribCorreto" TEXT,
ADD COLUMN     "confiancaCorreta" TEXT,
ADD COLUMN     "cstCorreto" TEXT,
ADD COLUMN     "fundamentoLegalCorreto" TEXT,
ADD COLUMN     "perfilCorreto" TEXT,
ADD COLUMN     "reducaoCorreta" TEXT;

-- CreateTable
CREATE TABLE "ClassificacaoProdutoReferencia" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "empresaGrupoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT,
    "ncm" TEXT,
    "tipo" TEXT,
    "grupo" TEXT,
    "finalidade" TEXT,
    "cst" TEXT,
    "cClassTrib" TEXT,
    "perfilCorreto" TEXT NOT NULL,
    "reducao" TEXT,
    "fundamentoLegal" TEXT,
    "confianca" TEXT,
    "homologado" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassificacaoProdutoReferencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassificacaoProdutoReferencia_companyId_empresaGrupoId_cod_key" ON "ClassificacaoProdutoReferencia"("companyId", "empresaGrupoId", "codigo");

-- AddForeignKey
ALTER TABLE "ClassificacaoProdutoReferencia" ADD CONSTRAINT "ClassificacaoProdutoReferencia_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificacaoProdutoReferencia" ADD CONSTRAINT "ClassificacaoProdutoReferencia_empresaGrupoId_fkey" FOREIGN KEY ("empresaGrupoId") REFERENCES "AnaliseFiscalCnpjGrupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
