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

  /**
   * 匿名登记页的联想选项数据：仅含人员/部门/区域/型号/故障等分类字段，
   * 不含日期、工作内容、备注等明细——公开可读但 limiting 信息暴露面。
   */
  async optionRows() {
    return this.prisma.maintenanceRecord.findMany({
      select: {
        personnel: true,
        department: true,
        location: true,
        equipmentModel: true,
        faultType: true,
        faultCause: true,
      },
      orderBy: { createdAt: 'desc' },
    });
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
