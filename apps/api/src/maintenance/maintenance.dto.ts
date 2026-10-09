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
  @ApiPropertyOptional({ description: '设备所属车间；旧版登记可留空' })
  @IsOptional() @IsString() @Length(0, 500) workshop?: string;
  @ApiPropertyOptional({ description: '设备名称；旧版登记可留空' })
  @IsOptional() @IsString() @Length(0, 500) equipmentName?: string;
  @IsString() @Length(0, 500) equipmentModel!: string;
  @IsString() @Length(1, 4000) workContent!: string;
  @IsString() @Length(0, 500) workTimeText!: string;
  @IsString() @Length(0, 1000) replacedParts!: string;
  @IsString() @Length(0, 500) faultType!: string;
  @IsString() @Length(0, 500) faultCause!: string;

  @ApiPropertyOptional({ description: '原表工时；可识别工作时间时自动计算，历史原值保留作回退' })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  repairHours?: number | null;

  @IsBoolean() isRework!: boolean;
  @IsString() @Length(0, 4000) remarks!: string;
}
