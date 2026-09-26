import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  FormDTO, FormData, FormField, FormPageResult, FormSubmissionDTO,
  FormSubmissionPageResult, SaveFormSubmissionsBody,
} from '@hgxt/shared';
import { Prisma, type Form, type FormSubmission } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { FormListQuery, SubmissionListQuery } from './query.dto';

function schemaOf(form: Form): FormField[] {
  return form.schema as unknown as FormField[];
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function cleanData(form: Form, input: unknown): FormData {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('提交内容必须是字段对象');
  }
  const source = input as Record<string, unknown>;
  const schema = schemaOf(form);
  const known = new Set(schema.map((field) => field.id));
  if (form.title.includes('硫酸车间')) known.add('parkingRecords');
  if (Object.keys(source).some((key) => !known.has(key))) {
    throw new BadRequestException('提交内容包含未知字段');
  }
  const data: FormData = {};
  for (const field of schema) {
    const raw = source[field.id];
    if (raw === undefined || raw === null || raw === '') {
      if (field.required) throw new BadRequestException(`${field.title}为必填项`);
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
      data[field.id] = raw;
    } else {
      throw new BadRequestException(`${field.title}格式不正确`);
    }
  }
  if (typeof data.field_date !== 'string' || !isDate(data.field_date)) {
    throw new BadRequestException('填写日期无效');
  }
  if (source.parkingRecords !== undefined && source.parkingRecords !== null) {
    if (typeof source.parkingRecords !== 'string' || source.parkingRecords.length > 10000) {
      throw new BadRequestException('停车记录格式不正确');
    }
    data.parkingRecords = source.parkingRecords;
  }
  return data;
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
    const ids = forms.map((form) => form.id);
    const dates = ids.length ? await this.prisma.$queryRaw<{ formId: string; latest: string | null }[]>(Prisma.sql`
      SELECT "formId", MAX(CASE WHEN data->>'field_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        THEN data->>'field_date' END) AS latest
      FROM "FormSubmission" WHERE "formId" IN (${Prisma.join(ids)}) GROUP BY "formId"
    `) : [];
    const latest = new Map(dates.map((item) => [item.formId, item.latest]));
    return {
      items: forms.map((form): FormDTO => ({
        id: form.id,
        title: form.title,
        description: form.description,
        schema: schemaOf(form),
        latestEntryDate: latest.get(form.id) ?? null,
        submissionCount: form._count.submissions,
      })),
      total, page, pageSize,
    };
  }

  async get(id: string): Promise<FormDTO> {
    const form = await this.findForm(id);
    const [latest] = await this.prisma.$queryRaw<{ latest: string | null }[]>(Prisma.sql`
      SELECT MAX(CASE WHEN data->>'field_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        THEN data->>'field_date' END) AS latest
      FROM "FormSubmission" WHERE "formId" = ${id}
    `);
    return {
      id: form.id,
      title: form.title,
      description: form.description,
      schema: schemaOf(form),
      latestEntryDate: latest?.latest ?? null,
      submissionCount: await this.prisma.formSubmission.count({ where: { formId: id } }),
    };
  }

  async listSubmissions(id: string, query: SubmissionListQuery): Promise<FormSubmissionPageResult> {
    await this.findForm(id);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 100;
    const [rows, total] = await Promise.all([
      this.prisma.$queryRaw<FormSubmission[]>(Prisma.sql`
        SELECT * FROM "FormSubmission" WHERE "formId" = ${id}
        ORDER BY data->>'field_date' DESC NULLS LAST, "createdAt" DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `),
      this.prisma.formSubmission.count({ where: { formId: id } }),
    ]);
    return { items: rows.map(asSubmission), total, page, pageSize };
  }

  async createSubmission(id: string, input: unknown, submitterId: string): Promise<FormSubmissionDTO> {
    const form = await this.findForm(id);
    const data = cleanData(form, input);
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
    const created = body.created.map((row) => cleanData(form, row));
    const updated = body.updated.map((row) => {
      if (!row || typeof row.id !== 'string') throw new BadRequestException('记录 ID 无效');
      return { id: row.id, data: cleanData(form, row.data) };
    });
    if (body.deleted.some((value) => typeof value !== 'string')) throw new BadRequestException('记录 ID 无效');
    const ids = [...updated.map((row) => row.id), ...body.deleted];
    if (new Set(ids).size !== ids.length) throw new BadRequestException('记录 ID 重复');
    await this.prisma.$transaction(async (tx) => {
      if (ids.length) {
        const count = await tx.formSubmission.count({ where: { formId: id, id: { in: ids } } });
        if (count !== ids.length) throw new NotFoundException('部分记录不属于此表单');
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
