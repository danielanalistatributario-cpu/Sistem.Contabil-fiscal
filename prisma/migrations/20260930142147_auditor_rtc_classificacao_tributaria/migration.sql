-- CreateTable
CREATE TABLE "AuditorRtcCst" (
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "fonte" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditorRtcCst_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "AuditorRtcCclasstrib" (
    "codigo" TEXT NOT NULL,
    "cstCodigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipoAliquota" TEXT,
    "percentualReducao" DOUBLE PRECISION,
    "fundamentoLegal" TEXT,
    "fonte" TEXT NOT NULL,
    "observacao" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditorRtcCclasstrib_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "AuditorRtcNcmClassificacao" (
    "id" TEXT NOT NULL,
    "ncm" TEXT NOT NULL,
    "descricaoNcm" TEXT,
    "cclasstribCodigo" TEXT NOT NULL,
    "anexo" TEXT,
    "fundamentoLegal" TEXT,
    "fonte" TEXT NOT NULL,
    "observacao" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditorRtcNcmClassificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditorRtcCclasstrib_cstCodigo_idx" ON "AuditorRtcCclasstrib"("cstCodigo");

-- CreateIndex
CREATE INDEX "AuditorRtcNcmClassificacao_ncm_idx" ON "AuditorRtcNcmClassificacao"("ncm");

-- AddForeignKey
ALTER TABLE "AuditorRtcCclasstrib" ADD CONSTRAINT "AuditorRtcCclasstrib_cstCodigo_fkey" FOREIGN KEY ("cstCodigo") REFERENCES "AuditorRtcCst"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditorRtcNcmClassificacao" ADD CONSTRAINT "AuditorRtcNcmClassificacao_cclasstribCodigo_fkey" FOREIGN KEY ("cclasstribCodigo") REFERENCES "AuditorRtcCclasstrib"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;
