import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  Matches,
} from 'class-validator';

/** 登记项只接受维修日志主表的原始字段；统计值均从记录现算。 */
export class MaintenanceRecordDto {
  @IsString()
  @Length(0, 80)
  sourceDateText!: string;

  @ApiPropertyOptional({ description: '可解析的自然日期；历史原表的异常日期可为 null' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  reportYear!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  reportMonth!: number;

  @IsString() @Length(0, 500) personnel!: string;
  @IsString() @Length(0, 500) department!: string;
  @IsString() @Length(0, 500) location!: string;
  @IsString() @Length(0, 500) equipmentModel!: string;
  @IsString() @Length(1, 4000) workContent!: string;
  @IsString() @Length(0, 500) workTimeText!: string;
  @IsString() @Length(0, 1000) replacedParts!: string;
  @IsString() @Length(0, 500) faultType!: string;
  @IsString() @Length(0, 500) faultCause!: string;

  @ApiPropertyOptional({ description: '原表工时；历史异常保留原值并计入合计，界面单独提示核对' })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  repairHours?: number | null;

  @IsBoolean() isRework!: boolean;
  @IsString() @Length(0, 4000) remarks!: string;
}
