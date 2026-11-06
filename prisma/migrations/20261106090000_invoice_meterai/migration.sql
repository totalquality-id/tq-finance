-- e-Meterai per invoice
ALTER TABLE "Invoice" ADD COLUMN "meterai" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "meteraiSn" TEXT;

CREATE UNIQUE INDEX "Invoice_meteraiSn_key" ON "Invoice"("meteraiSn");

-- Kwitansi ≥ Rp5.000.000 sebelumnya otomatis menampilkan kotak meterai: pertahankan.
UPDATE "Invoice" SET "meterai" = true WHERE "docType" = 'KWITANSI' AND "total" >= 5000000;
