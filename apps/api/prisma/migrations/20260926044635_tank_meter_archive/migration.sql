-- CreateTable
CREATE TABLE "Tank" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "capacity" DOUBLE PRECISION NOT NULL,
    "density" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Tank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meter" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "Meter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tank_fieldId_key" ON "Tank"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "Meter_fieldId_key" ON "Meter"("fieldId");
