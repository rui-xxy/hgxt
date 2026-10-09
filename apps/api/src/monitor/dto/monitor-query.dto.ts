import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { isValidDateKey, type MonitorLogQuery, type MonitorLogTab } from '@hgxt/shared';

const TAB_VALUES: MonitorLogTab[] = ['all', 'login', 'view', 'data'];

/** 日期参数：格式之外还必须是真实日历日期（'2026-13-45' 这类直接 400，不进日期计算） */
@ValidatorConstraint({ name: 'isDateKey', async: false })
class IsDateKeyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return value === undefined || value === null || value === '' || isValidDateKey(value as string);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} 应为真实存在的日期（YYYY-MM-DD）`;
  }
}

/** 日期区间查询（overview / security / pages / 导出共用） */
export class MonitorRangeDto {
  @IsOptional()
  @Validate(IsDateKeyConstraint)
  from?: string;

  @IsOptional()
  @Validate(IsDateKeyConstraint)
  to?: string;
}

/** 部门活跃的截止日期 */
export class MonitorToDateDto {
  @IsOptional()
  @Validate(IsDateKeyConstraint)
  to?: string;
}

/** 成员详情的查询日期 */
export class MonitorMemberQueryDto {
  @IsOptional()
  @Validate(IsDateKeyConstraint)
  date?: string;
}

/** 访问日志查询：tab 枚举、分页整数（NaN/小数/越界 400）、日期真实存在 */
export class MonitorLogsQueryDto extends MonitorRangeDto implements MonitorLogQuery {
  @IsOptional()
  @IsIn(TAB_VALUES)
  tab?: MonitorLogTab;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  department?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
