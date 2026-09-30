import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@hgxt/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { ProductionService } from './production.service';

class SulfuricSummaryQuery {
  @ApiPropertyOptional({ description: '返回最近 N 个有数据的归属日（1-120，默认 30）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  days?: number = 30;
}

/** 生产指标（读取时现算，不改写表单数据） */
@ApiTags('production 生产指标')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN)
@Controller('production')
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Get('sulfuric')
  @ApiOperation({ summary: '硫酸车间：按归属日的库存 / 差值产量 / 分表电耗（仅管理员）' })
  sulfuric(@Query() query: SulfuricSummaryQuery) {
    return this.production.sulfuricSummary(query.days);
  }
}
