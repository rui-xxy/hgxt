-- CreateTable
CREATE TABLE "ProductionPlan" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "workshop" TEXT NOT NULL,
    "annual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "months" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumptionTarget" (
    "id" TEXT NOT NULL,
    "workshop" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsumptionTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionPlan_year_workshop_key" ON "ProductionPlan"("year", "workshop");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumptionTarget_workshop_material_key" ON "ConsumptionTarget"("workshop", "material");
