-- DropForeignKey
ALTER TABLE "AssetDepreciation" DROP CONSTRAINT "AssetDepreciation_assetId_fkey";

-- DropForeignKey
ALTER TABLE "Bill" DROP CONSTRAINT "Bill_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Bill" DROP CONSTRAINT "Bill_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "BillPayment" DROP CONSTRAINT "BillPayment_billId_fkey";

-- DropForeignKey
ALTER TABLE "JournalLine" DROP CONSTRAINT "JournalLine_accountId_fkey";

-- DropForeignKey
ALTER TABLE "JournalLine" DROP CONSTRAINT "JournalLine_journalId_fkey";

-- DropForeignKey
ALTER TABLE "JournalLine" DROP CONSTRAINT "JournalLine_projectId_fkey";

-- DropIndex
DROP INDEX "Invoice_journalId_key";

-- DropIndex
DROP INDEX "InvoicePayment_journalId_key";

-- DropIndex
DROP INDEX "InvoicePayment_number_key";

-- AlterTable
ALTER TABLE "Contact" DROP COLUMN "bankAccount",
DROP COLUMN "bankHolder",
DROP COLUMN "bankName",
ADD COLUMN     "shortCode" TEXT,
ALTER COLUMN "type" SET DEFAULT 'CLIENT',
ALTER COLUMN "paymentTermDays" SET DEFAULT 14;

-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "appliedTaxes",
DROP COLUMN "discount",
DROP COLUMN "journalId",
DROP COLUMN "receivableAccountId",
DROP COLUMN "revenueAccountId",
DROP COLUMN "taxAdd",
DROP COLUMN "taxDeduct",
ADD COLUMN     "attn" TEXT,
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'KONTRAK',
ADD COLUMN     "docType" TEXT NOT NULL DEFAULT 'INVOICE',
ADD COLUMN     "dpp" DECIMAL(18,2) NOT NULL,
ADD COLUMN     "internalNote" TEXT,
ADD COLUMN     "layout" TEXT NOT NULL DEFAULT 'JASA',
ADD COLUMN     "ppn" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "ppnRate" DECIMAL(5,2) NOT NULL DEFAULT 11,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "sentNote" TEXT,
ADD COLUMN     "sentVia" TEXT,
ADD COLUMN     "seq" INTEGER NOT NULL,
ADD COLUMN     "series" TEXT NOT NULL,
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "taxMode" TEXT NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "InvoicePayment" DROP COLUMN "cashAccountId",
DROP COLUMN "journalId",
DROP COLUMN "number",
ADD COLUMN     "account" TEXT NOT NULL,
ADD COLUMN     "buktiPotongNo" TEXT,
ADD COLUMN     "creatorName" TEXT NOT NULL,
ADD COLUMN     "pph23" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "budgetCost",
ADD COLUMN     "department" TEXT,
ADD COLUMN     "presenter" TEXT,
ADD COLUMN     "spkNo" TEXT;

-- DropTable
DROP TABLE "Account";

-- DropTable
DROP TABLE "AssetDepreciation";

-- DropTable
DROP TABLE "Bill";

-- DropTable
DROP TABLE "BillPayment";

-- DropTable
DROP TABLE "CashTransaction";

-- DropTable
DROP TABLE "FixedAsset";

-- DropTable
DROP TABLE "Journal";

-- DropTable
DROP TABLE "JournalLine";

-- DropTable
DROP TABLE "Tax";

-- DropTable
DROP TABLE "TaxPayment";

-- CreateTable
CREATE TABLE "InvoiceFollowUp" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "promiseDate" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "creatorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceFollowUp_invoiceId_date_idx" ON "InvoiceFollowUp"("invoiceId", "date");

-- CreateIndex
CREATE INDEX "Invoice_date_idx" ON "Invoice"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_series_seq_key" ON "Invoice"("series", "seq");

-- CreateIndex
CREATE INDEX "InvoicePayment_date_idx" ON "InvoicePayment"("date");

-- AddForeignKey
ALTER TABLE "InvoiceFollowUp" ADD CONSTRAINT "InvoiceFollowUp_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

