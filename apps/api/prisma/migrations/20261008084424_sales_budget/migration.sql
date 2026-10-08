-- CreateTable
CREATE TABLE "SalesBudget" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "product" TEXT NOT NULL,
    "months" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesBudget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesBudget_year_product_key" ON "SalesBudget"("year", "product");
