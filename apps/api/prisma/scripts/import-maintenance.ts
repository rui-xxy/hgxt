import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../../src/generated/prisma/client';
import source from '../data/maintenance-2026.json';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('缺少 DATABASE_URL');
const url = new URL(connectionString);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/hgxt') {
  throw new Error('设备维修日志导入仅允许写入本机开发库 hgxt');
}

type SourceRow = (typeof source)[number];
const records = source as SourceRow[];
const keys = new Set<number>();
for (const [index, row] of records.entries()) {
  if (!Number.isInteger(row.sourceRow) || keys.has(row.sourceRow) ||
    row.sourceRow !== index + 3 ||
    row.reportYear !== 2026 || row.reportMonth < 1 || row.reportMonth > 12 ||
    (row.date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      new Date(`${row.date}T00:00:00.000Z`).toISOString().slice(0, 10) !== row.date))) {
    throw new Error(`源数据校验失败：Excel 行 ${row.sourceRow}`);
  }
  keys.add(row.sourceRow);
}
if (records.length !== 2404 || keys.size !== 2404) {
  throw new Error(`源数据应有 2404 条，实际 ${records.length} 条`);
}
const expectedMonths = [250, 219, 244, 275, 339, 250, 260, 294, 264, 9, 0, 0];
const actualMonths = expectedMonths.map((_, index) => records.filter((row) => row.reportMonth === index + 1).length);
if (actualMonths.some((count, index) => count !== expectedMonths[index]) ||
  records.filter((row) => row.date === null).length !== 2) {
  throw new Error('统计月份分布或异常日期数量与已核对的工作簿不符');
}

const value = (text: string | null): string => text ?? '';
const data: Prisma.MaintenanceRecordCreateManyInput[] = records.map((row) => ({
  sourceWorkbook: 'maintenance-2026',
  sourceRow: row.sourceRow,
  sourceDateText: row.sourceDateText,
  date: row.date ? new Date(`${row.date}T00:00:00.000Z`) : null,
  reportYear: row.reportYear,
  reportMonth: row.reportMonth,
  personnel: row.personnel,
  department: row.department,
  location: row.location,
  equipmentModel: value(row.equipmentModel),
  workContent: row.workContent,
  workTimeText: value(row.workTimeText),
  replacedParts: row.replacedParts,
  faultType: row.faultType,
  faultCause: row.faultCause,
  repairHours: row.repairHours,
  isRework: row.isRework,
  remarks: value(row.remarks),
}));

async function main(): Promise<void> {
  const perMonth = Array.from({ length: 12 }, (_, index) =>
    data.filter((row) => row.reportMonth === index + 1).length,
  );
  console.log(`维修日志源数据 ${data.length} 条；各月 ${perMonth.join('/')}`);
  if (process.argv.includes('--dry-run')) return;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    // 兼容最初仅按 sourceRow 导入的本机记录，补齐来源后复合唯一键才能防止重导。
    await prisma.maintenanceRecord.updateMany({
      where: { sourceWorkbook: null, sourceRow: { not: null }, reportYear: 2026 },
      data: { sourceWorkbook: 'maintenance-2026' },
    });
    let inserted = 0;
    for (let i = 0; i < data.length; i += 200) {
      const result = await prisma.maintenanceRecord.createMany({
        data: data.slice(i, i + 200),
        skipDuplicates: true,
      });
      inserted += result.count;
    }
    // 已有 Excel 行不覆盖：保留此后在界面中的人工修订。
    const total = await prisma.maintenanceRecord.count({ where: { reportYear: 2026 } });
    console.log(`本次新增 ${inserted} 条；数据库 2026 年现有 ${total} 条`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
