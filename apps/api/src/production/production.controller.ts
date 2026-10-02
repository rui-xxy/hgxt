import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role, type DetailedWorkshopCode } from '@hgxt/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { OverviewService } from './overview.service';
import { ProductionService } from './production.service';

class SulfuricSummaryQuery {
  @ApiPropertyOptional({ description: '返回最近 N 个有数据的归属日（0=全部历史，默认 30）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  days?: number = 30;
}

/** 生产指标（读取时现算，不改写表单数据） */
@ApiTags('production 生产指标')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN)
@Controller('production')
export class ProductionController {
  constructor(
    private readonly production: ProductionService,
    private readonly overview: OverviewService,
  ) {}

  @Get('sulfuric')
  @ApiOperation({ summary: '硫酸车间：按归属日的库存 / 差值产量 / 分表电耗（仅管理员）' })
  sulfuric(@Query() query: SulfuricSummaryQuery) {
    return this.production.sulfuricSummary(query.days);
  }

  @Get('workshops')
  @ApiOperation({ summary: '车间版面：各车间日产量序列（硫酸折98、热电供汽计量，其余为上报值）' })
  workshops(@Query() query: SulfuricSummaryQuery) {
    return this.overview.workshopOverview(query.days);
  }

  @Get('workshops/:code/detail')
  @ApiOperation({ summary: '硫酸镁、水滑石、蒽醌车间的消耗与产销存明细' })
  workshopDetail(@Param('code') code: DetailedWorkshopCode, @Query() query: SulfuricSummaryQuery) {
    return this.overview.detailedWorkshop(code, query.days);
  }

  @Get('amino')
  @ApiOperation({ summary: '氨基磺酸车间：日产量、五项消耗与期末库存' })
  amino(@Query() query: SulfuricSummaryQuery) {
    return this.overview.aminoSummary(query.days);
  }

  @Get('thermal')
  @ApiOperation({ summary: '热电车间：外供和内供蒸汽分路、发电、水表与蒸汽总表日差值' })
  thermal(@Query() query: SulfuricSummaryQuery) {
    return this.overview.thermalSummary(query.days);
  }

  @Get('energy')
  @ApiOperation({ summary: '能源中心：各车间电 / 汽（内供+外供）/ 水的日用量与自发电' })
  energy(@Query() query: SulfuricSummaryQuery) {
    return this.overview.energy(query.days);
  }

  @Get('materials')
  @ApiOperation({ summary: '物料与库存：原辅料库存（可用天数预警）/ 产成品产销存 / 车间间往来' })
  materials() {
    return this.overview.materials();
  }

  @Get('tanks')
  @ApiOperation({ summary: '车间版面：硫酸系统指定归属日期的期末分罐液位' })
  tanks(@Query('date') date?: string) {
    return this.overview.tankLevels(date);
  }
}
