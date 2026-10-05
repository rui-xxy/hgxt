-- Excel 不同年度都会从第 3 行开始，来源文件和行号共同确定一条原始记录。
ALTER TABLE "MaintenanceRecord" ADD COLUMN "sourceWorkbook" TEXT;

-- 回填本次已导入的 2026 工作簿；手工登记的 sourceRow 为 NULL。
UPDATE "MaintenanceRecord"
SET "sourceWorkbook" = 'maintenance-2026'
WHERE "sourceRow" IS NOT NULL AND "reportYear" = 2026;

DROP INDEX "MaintenanceRecord_sourceRow_key";
CREATE UNIQUE INDEX "MaintenanceRecord_sourceWorkbook_sourceRow_key"
ON "MaintenanceRecord"("sourceWorkbook", "sourceRow");
