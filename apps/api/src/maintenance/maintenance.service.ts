import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { calculateMaintenanceHours } from '@hgxt/shared';
import type { MaintenanceRecord } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { MaintenanceRecordDto } from './maintenance.dto';

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('日期无效');
  }
  return date;
}

function asResponse(row: MaintenanceRecord) {
  return {
    ...row,
    date: row.date?.toISOString().slice(0, 10) ?? null,
    repairHours: calculateMaintenanceHours(row.workTimeText) ?? row.repairHours,
  };
}

@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService) {}

  async list(year?: number) {
    const rows = await this.prisma.maintenanceRecord.findMany({
      where: year === undefined ? undefined : { reportYear: year },
      orderBy: [{ date: 'desc' }, { sourceRow: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(asResponse);
  }

  async create(body: MaintenanceRecordDto) {
    const repairHours = calculateMaintenanceHours(body.workTimeText) ?? body.repairHours ?? null;
    const row = await this.prisma.maintenanceRecord.create({
      data: { ...body, date: parseDate(body.date), repairHours },
    });
    return asResponse(row);
  }

  async update(id: string, body: MaintenanceRecordDto) {
    const existing = await this.prisma.maintenanceRecord.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('维修记录不存在');
    const repairHours = calculateMaintenanceHours(body.workTimeText) ?? body.repairHours ?? existing.repairHours;
    const row = await this.prisma.maintenanceRecord.update({
      where: { id },
      data: { ...body, date: parseDate(body.date), repairHours },
    });
    return asResponse(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.maintenanceRecord.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('维修记录不存在');
    await this.prisma.maintenanceRecord.delete({ where: { id } });
    return { id };
  }
}
