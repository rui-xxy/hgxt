-- CreateTable
CREATE TABLE "MaintenanceRecord" (
    "id" TEXT NOT NULL,
    "sourceRow" INTEGER,
    "sourceDateText" TEXT NOT NULL,
    "date" DATE,
    "reportYear" INTEGER NOT NULL,
    "reportMonth" INTEGER NOT NULL,
    "personnel" TEXT NOT NULL DEFAULT '',
    "department" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "equipmentModel" TEXT NOT NULL DEFAULT '',
    "workContent" TEXT NOT NULL DEFAULT '',
    "workTimeText" TEXT NOT NULL DEFAULT '',
    "replacedParts" TEXT NOT NULL DEFAULT '',
    "faultType" TEXT NOT NULL DEFAULT '',
    "faultCause" TEXT NOT NULL DEFAULT '',
    "repairHours" DOUBLE PRECISION,
    "isRework" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceRecord_sourceRow_key" ON "MaintenanceRecord"("sourceRow");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_reportYear_reportMonth_idx" ON "MaintenanceRecord"("reportYear", "reportMonth");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_date_idx" ON "MaintenanceRecord"("date");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_department_idx" ON "MaintenanceRecord"("department");
