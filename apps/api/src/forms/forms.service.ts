import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  FormDTO, FormData, FormField, FormLastValuesResult, FormPageResult,
  FormSubmissionDTO, FormSubmissionPageResult, SaveFormSubmissionsBody,
} from '@hgxt/shared';
import { CURRENT_DEPARTMENTS, normalizeDepartmentValue, parseDepartmentNames } from '@hgxt/shared';
import { Prisma, type Form, type FormSubmission } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { FormListQuery, SubmissionListQuery } from './query.dto';

/** 事项表的部门选项统一使用现行名称，旧称在保存时归一。 */
function schemaOf(form: Form): FormField[] {
  const schema = form.schema as unknown as FormField[];
  if (form.code !== 'matters_2026') return schema;
  return schema.map((field) => field.id === 'department'
    ? { ...field, multiple: true, options: CURRENT_DEPARTMENTS.map((name) => ({ label: name, value: name })) }
    : field);
}

/**
 * 主日期字段 = schema 中第一个必填 date 字段（数据归属日期，通常是隐藏的 field_date）。
 * 「最新填写时间」「排序」「新增行默认日期」都以它为准；没有 date 字段的表单
 * （如纯登记表、事项表中可空的开始/完成日期）相关逻辑整体跳过。
 */
export function primaryDateField(schema: FormField[]): FormField | undefined {
  return schema.find((field) => field.type === 'date' && field.required);
}

/** 字段 id 可安全拼进 SQL（schema 数据入库前受控，这里再防御一次） */
function safeFieldId(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new BadRequestException('字段定义不合法');
  return id;
}

/** 每张表单在其 schema 的 date 字段上取最大日期值（跨多个 date 字段取最大） */
function latestDateExpr(dateFieldIds: string[]): Prisma.Sql {
  const cases = dateFieldIds.map((id) =>
    Prisma.sql`MAX(CASE WHEN data->>${safeFieldId(id)} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN data->>${safeFieldId(id)} END)`,
  );
  return cases.length === 1 ? cases[0] : Prisma.sql`GREATEST(${Prisma.join(cases)})`;
}

function asSubmission(row: FormSubmission): FormSubmissionDTO {
  return {
    id: row.id,
    formId: row.formId,
    data: row.data as FormData,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-[0-9]{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function cleanData(form: Form, input: unknown, previousData?: FormData): FormData {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('提交内容必须是字段对象');
  }
  const source = input as Record<string, unknown>;
  const schema = schemaOf(form);
  const known = new Set(schema.map((field) => field.id));
  if (form.parkingEnabled) known.add('parkingRecords');
  if (Object.keys(source).some((key) => !known.has(key))) {
    throw new BadRequestException('提交内容包含未知字段');
  }
  const data: FormData = {};
  for (const field of schema) {
    let raw = source[field.id];
    // 隐藏的日期字段缺省 → 自动填当天（数据归属日期由系统填，不依赖前端）
    if (raw === undefined && field.hidden && field.type === 'date') {
      raw = todayStr();
    }
    // 编辑历史行时只校验改动的字段；原有数据可能来自 Excel，类型或长度与现行表单不同。
    if (previousData && raw === previousData[field.id] && (raw === null || typeof raw === 'string' || typeof raw === 'number')) {
      data[field.id] = raw;
      continue;
    }
    if (raw === undefined || raw === null || raw === '') {
      // 硫酸中控按当次实际检测项目补录；仅记录日期必须填写。
      if (field.required && !(form.code?.startsWith('sulfuric_control_') && field.id !== 'field_date')) {
        throw new BadRequestException(`${field.title}为必填项`);
      }
      data[field.id] = null;
    } else if (field.type === 'number') {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        throw new BadRequestException(`${field.title}必须是数字`);
      }
      if ((field.min !== undefined && raw < field.min) || (field.max !== undefined && raw > field.max)) {
        throw new BadRequestException(`${field.title}超出允许范围`);
      }
      data[field.id] = raw;
    } else if (typeof raw === 'string' && raw.length <= 1000) {
      if (field.type === 'date' && !isDate(raw)) throw new BadRequestException(`${field.title}日期无效`);
      if (field.type === 'select' && !field.options?.some((option) => option.value === raw)) {
        throw new BadRequestException(`${field.title}选项无效`);
      }
      if (field.multiple && field.options) {
        const names = parseDepartmentNames(raw);
        const allowed = new Set(field.options.map((option) => option.value));
        const hasHistoricalName = names.some((name) => !allowed.has(name));
        if (hasHistoricalName && previousData?.[field.id] !== raw) {
          throw new BadRequestException(`${field.title}请选择现行部门`);
        }
        data[field.id] = hasHistoricalName ? raw : normalizeDepartmentValue(raw);
      } else {
        data[field.id] = raw;
      }
    } else {
      throw new BadRequestException(`${field.title}格式不正确`);
    }
  }
    // 必填主日期必须有效；仅含可选日期的表格跳过该校验
  const primary = primaryDateField(schema);
  if (primary) {
    const value = data[primary.id];
    if (typeof value !== 'string' || !isDate(value)) {
      throw new BadRequestException(`${primary.title}无效`);
    }
  }
  if (source.parkingRecords !== undefined && source.parkingRecords !== null) {
    if (typeof source.parkingRecords !== 'string' || source.parkingRecords.length > 10000) {
      throw new BadRequestException('停车记录格式不正确');
    }
    data.parkingRecords = source.parkingRecords;
  }
  return data;
}

function sparseControlData(data: FormData): FormData {
  return Object.fromEntries(Object.entries(data).filter(([key, value]) =>
    key === 'field_date' || (value !== null && value !== '')));
}

@Injectable()
export class FormsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: FormListQuery): Promise<FormPageResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.FormWhereInput = {
      status: 'published',
      ...(query.keyword?.trim() ? { title: { contains: query.keyword.trim(), mode: 'insensitive' } } : {}),
      ...(query.category?.trim() ? { category: query.category.trim() } : {}),
    };
    const [forms, total] = await Promise.all([
      this.prisma.form.findMany({
        where,
        include: { _count: { select: { submissions: true } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.form.count({ where }),
    ]);
    // 各表按自己的 date 字段取最新归属日期
    const latest = new Map<string, string | null>();
    const hasMaintenance = forms.some((form) => form.code === 'maintenance_log');
    const maintenance = hasMaintenance ? await Promise.all([
      this.prisma.maintenanceRecord.count(),
      this.prisma.maintenanceRecord.findFirst({ where: { date: { not: null } }, orderBy: { date: 'desc' }, select: { date: true } }),
    ]) : null;
    for (const form of forms) {
      if (form.code === 'maintenance_log') {
        latest.set(form.id, maintenance?.[1]?.date?.toISOString().slice(0, 10) ?? null);
        continue;
      }
      const dateIds = schemaOf(form).filter((f) => f.type === 'date').map((f) => f.id);
      if (!dateIds.length) {
        latest.set(form.id, null);
        continue;
      }
      const [row] = await this.prisma.$queryRaw<{ latest: string | null }[]>(Prisma.sql`
        SELECT ${latestDateExpr(dateIds)} AS latest FROM "FormSubmission" WHERE "formId" = ${form.id}
      `);
      latest.set(form.id, row?.latest ?? null);
    }
    return {
      items: forms.map((form): FormDTO => ({
        id: form.id,
        code: form.code,
        title: form.title,
        category: form.category,
        entryMode: form.entryMode === 'sheet' ? 'sheet' : 'form',
        description: form.description,
        schema: schemaOf(form),
        parkingEnabled: form.parkingEnabled,
        latestEntryDate: latest.get(form.id) ?? null,
        submissionCount: form.code === 'maintenance_log' ? maintenance?.[0] ?? 0 : form._count.submissions,
      })),
      total, page, pageSize,
    };
  }

  async get(id: string): Promise<FormDTO> {
    const form = await this.findForm(id);
    const maintenance = form.code === 'maintenance_log' ? await Promise.all([
      this.prisma.maintenanceRecord.count(),
      this.prisma.maintenanceRecord.findFirst({ where: { date: { not: null } }, orderBy: { date: 'desc' }, select: { date: true } }),
    ]) : null;
    const schema = schemaOf(form);
    const dateIds = schema.filter((f) => f.type === 'date').map((f) => f.id);
    let latest: string | null = null;
    if (dateIds.length) {
      const [row] = await this.prisma.$queryRaw<{ latest: string | null }[]>(Prisma.sql`
        SELECT ${latestDateExpr(dateIds)} AS latest FROM "FormSubmission" WHERE "formId" = ${id}
      `);
      latest = row?.latest ?? null;
    }
    return {
      id: form.id,
      code: form.code,
      title: form.title,
      category: form.category,
      entryMode: form.entryMode === 'sheet' ? 'sheet' : 'form',
      description: form.description,
      schema,
      parkingEnabled: form.parkingEnabled,
      latestEntryDate: maintenance ? maintenance[1]?.date?.toISOString().slice(0, 10) ?? null : latest,
      submissionCount: maintenance ? maintenance[0] : await this.prisma.formSubmission.count({ where: { formId: id } }),
    };
  }

  async listSubmissions(id: string, query: SubmissionListQuery): Promise<FormSubmissionPageResult> {
    const form = await this.findForm(id);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 100;
    const primary = primaryDateField(schemaOf(form));
    const orderExpr = primary
      ? Prisma.sql`data->>${safeFieldId(primary.id)} DESC NULLS LAST, "createdAt" DESC`
      : Prisma.sql`"createdAt" DESC`;
    const conditions: Prisma.Sql[] = [Prisma.sql`"formId" = ${id}`];
    if (form.entryMode === 'sheet' && query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      conditions.push(Prisma.sql`(
        data->>'matter' ILIKE ${keyword} OR data->>'completionNote' ILIKE ${keyword}
        OR data->>'department' ILIKE ${keyword} OR data->>'owner' ILIKE ${keyword}
        OR data->>'source' ILIKE ${keyword}
      )`);
    }
    if (form.entryMode === 'sheet' && query.progress?.trim()) {
      conditions.push(Prisma.sql`data->>'progress' = ${query.progress.trim()}`);
    }
    const where = Prisma.join(conditions, ' AND ');
    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<FormSubmission[]>(Prisma.sql`
        SELECT * FROM "FormSubmission" WHERE ${where}
        ORDER BY ${orderExpr}
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `),
      this.prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS total FROM "FormSubmission" WHERE ${where}
      `),
    ]);
    return { items: rows.map(asSubmission), total: counts[0]?.total ?? 0, page, pageSize };
  }

  /**
   * 上次值（USER 可用）：每个字段最近一次非空值及其归属日期。
   * 只返回「最近值」不返回历史明细——员工填报参考用，不属于需要限权的历史数据。
   */
  async lastValues(id: string): Promise<FormLastValuesResult> {
    const form = await this.findForm(id);
    const schema = schemaOf(form);
    const primary = primaryDateField(schema);
    const rows = await this.prisma.formSubmission.findMany({
      where: { formId: id },
      orderBy: [{ createdAt: 'desc' }],
      select: { data: true },
    });
    // 按主日期（无则按提交时间）从新到旧找每个字段最近的非空值
    const sorted = [...rows].sort((a, b) => {
      const key = (row: { data: Prisma.JsonValue }) => {
        const v = primary ? (row.data as FormData)[primary.id] : null;
        return typeof v === 'string' && isDate(v) ? v : '';
      };
      return key(b).localeCompare(key(a));
    });
    const result: FormLastValuesResult = {};
    for (const row of sorted) {
      for (const [fieldId, value] of Object.entries(row.data as FormData)) {
        if (result[fieldId]) continue;
        if (value === null || value === '') continue;
        const businessDate = primary ? (row.data as FormData)[primary.id] : null;
        result[fieldId] = {
          value,
          date: typeof businessDate === 'string' && businessDate ? businessDate : todayStr(),
        };
      }
    }
    return result;
  }

  async createSubmission(id: string, input: unknown, submitterId: string | null): Promise<FormSubmissionDTO> {
    const form = await this.findForm(id);
    if (form.entryMode === 'sheet') throw new BadRequestException('此表格仅支持在数据页维护');
    const data = cleanData(form, input);
    if (form.code?.startsWith('sulfuric_control_')) {
      const date = data.field_date as string;
      const patch = Object.fromEntries(Object.entries(data).filter(([key, value]) => key !== 'field_date' && value !== null && value !== ''));
      if (!Object.keys(patch).length) throw new BadRequestException('请至少填写一项中控数据或生产情况记录');
      return this.prisma.$transaction(async (tx) => {
        // 同一天由不同岗位分别填写时，串行查找并合并字段，避免产生重复日期或覆盖其他岗位的值。
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${id}), hashtext(${date}))`;
        const [existing] = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "FormSubmission"
          WHERE "formId" = ${id} AND data->>'field_date' = ${date}
          ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE
        `;
        if (!existing) {
          return asSubmission(await tx.formSubmission.create({
            data: { formId: id, data: sparseControlData(data) as Prisma.InputJsonValue, submitterId },
          }));
        }
        const [updated] = await tx.$queryRaw<FormSubmission[]>`
          UPDATE "FormSubmission"
          SET data = data || ${JSON.stringify(patch)}::jsonb, "updatedAt" = NOW()
          WHERE id = ${existing.id} AND "formId" = ${id}
          RETURNING *
        `;
        return asSubmission(updated);
      });
    }
    return asSubmission(await this.prisma.formSubmission.create({
      data: { formId: id, data: data as Prisma.InputJsonValue, submitterId },
    }));
  }

  async saveSubmissions(id: string, body: SaveFormSubmissionsBody, submitterId: string) {
    const form = await this.findForm(id);
    if (!body || !Array.isArray(body.created) || !Array.isArray(body.updated) || !Array.isArray(body.deleted)) {
      throw new BadRequestException('保存内容格式不正确');
    }
    if (body.created.length + body.updated.length + body.deleted.length > 1000) {
      throw new BadRequestException('单次最多保存 1000 行');
    }
    const created = body.created.map((row) => {
      const data = cleanData(form, row);
      return form.code?.startsWith('sulfuric_control_') ? sparseControlData(data) : data;
    });
    const updated = body.updated.map((row) => {
      if (!row || typeof row.id !== 'string') throw new BadRequestException('记录 ID 无效');
      return { id: row.id, data: row.data };
    });
    if (body.deleted.some((value) => typeof value !== 'string')) throw new BadRequestException('记录 ID 无效');
    const ids = [...updated.map((row) => row.id), ...body.deleted];
    if (new Set(ids).size !== ids.length) throw new BadRequestException('记录 ID 重复');
    await this.prisma.$transaction(async (tx) => {
      if (ids.length) {
        const existingRows = await tx.formSubmission.findMany({ where: { formId: id, id: { in: ids } }, select: { id: true, data: true } });
        if (existingRows.length !== ids.length) throw new NotFoundException('部分记录不属于此表单');
        const existingById = new Map(existingRows.map((row) => [row.id, row.data as FormData]));
        for (const row of updated) {
          row.data = cleanData(form, row.data, existingById.get(row.id));
        }
      }
      for (const data of created) {
        await tx.formSubmission.create({ data: { formId: id, data: data as Prisma.InputJsonValue, submitterId } });
      }
      for (const row of updated) {
        await tx.formSubmission.update({ where: { id: row.id, formId: id }, data: { data: row.data as Prisma.InputJsonValue } });
      }
      if (body.deleted.length) {
        await tx.formSubmission.deleteMany({ where: { formId: id, id: { in: body.deleted } } });
      }
    });
    return { created: created.length, updated: updated.length, deleted: body.deleted.length };
  }

  private async findForm(id: string): Promise<Form> {
    const form = await this.prisma.form.findUnique({ where: { id } });
    if (!form || form.status !== 'published') throw new NotFoundException('表单不存在');
    return form;
  }
}
