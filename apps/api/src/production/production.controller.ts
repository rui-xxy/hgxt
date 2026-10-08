import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PagePermission, Role, type DetailedWorkshopCode } from '@hgxt/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { PageAccess } from '../common/decorators/page-permission.decorator';
import { OverviewService } from './overview.service';
import { PlanService } from './plan.service';
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

class SulfuricControlQuery {
  @ApiPropertyOptional({ description: '中控化验月份 YYYY-MM；不传则返回最新有数据月份' })
  @IsOptional()
  @IsString()
  @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/)
  month?: string;
}

class PlanYearQuery {
  @ApiPropertyOptional({ description: '计划年度（默认当前年）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number = new Date().getFullYear();
}

// 保存体的运行时校验：shared 里只有 TS interface（编译后消失），必须用真 DTO class
class PlanRowDto {
  @IsString()
  @Length(1, 20)
  workshop!: string;

  @IsInt()
  @Min(0)
  annual!: number;

  @IsArray()
  @ArrayMinSize(12)
  @ArrayMaxSize(12)
  months!: Array<unknown>;
}

class PlanTargetDto {
  @IsString()
  @Length(1, 20)
  workshop!: string;

  @IsString()
  @Length(1, 20)
  material!: string;

  @IsString()
  @Length(1, 10)
  unit!: string;

  @IsString()
  @Length(0, 40)
  target!: string;
}

class PlanSettingsSaveDto {
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => PlanRowDto)
  rows!: PlanRowDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PlanTargetDto)
  targets?: PlanTargetDto[];
}

/** 生产指标（读取时现算，不改写表单数据） */
@ApiTags('production 生产指标')
@ApiBearerAuth()
@Controller('production')
export class ProductionController {
  constructor(
    private readonly production: ProductionService,
    private readonly overview: OverviewService,
    private readonly plan: PlanService,
  ) {}

  @Get('sulfuric')
  @ApiOperation({ summary: '硫酸车间：按归属日的库存 / 差值产量 / 分表电耗' })
  sulfuric(@Query() query: SulfuricSummaryQuery) {
    return this.production.sulfuricSummary(query.days);
  }

  @Get('sulfuric/control')
  @ApiOperation({ summary: '硫酸车间中控分析：指定月份的化验值与异常备注' })
  sulfuricControl(@Query() query: SulfuricControlQuery) {
    return this.production.sulfuricControl(query.month);
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

  @Get('fenglian')
  @ApiOperation({ summary: '丰联车间：三车间与标准厂房日报原值' })
  fenglian(@Query() query: SulfuricSummaryQuery) {
    return this.overview.fenglianSummary(query.days);
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

  @Get('plan')
  @PageAccess(PagePermission.PLAN)
  @ApiOperation({ summary: '计划与完成：计划 vs 实际看板（实际值现算，计划值来自设置页）' })
  planBoard(@Query() query: PlanYearQuery) {
    return this.plan.board(query.year ?? new Date().getFullYear());
  }

  @Get('brief')
  @PageAccess(PagePermission.BRIEF)
  @ApiOperation({ summary: '经营简报：车间计划与历史产销数据' })
  brief(@Query() query: PlanYearQuery) {
    return this.plan.brief(query.year ?? new Date().getFullYear());
  }

  @Get('plan/settings')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: '生产计划设置：分别录入年度/月度计划与各车间单耗上限' })
  planSettings(@Query() query: PlanYearQuery) {
    return this.plan.getSettings(query.year ?? new Date().getFullYear());
  }

  @Post('plan/settings')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: '保存年度计划、月度计划与单耗上限（单一事务，任一失败整体回滚）' })
  savePlanSettings(@Body() body: PlanSettingsSaveDto) {
    return this.plan.saveSettings(body as never);
  }
}
