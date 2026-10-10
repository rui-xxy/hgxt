import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PagePermission, Role } from '@hgxt/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { PageAccess } from '../common/decorators/page-permission.decorator';
import { ThrottlerExceptionFilter } from '../common/filters/throttler-exception.filter';
import { MaintenanceRecordDto } from './maintenance.dto';
import { MaintenanceService } from './maintenance.service';

class RecordsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;
}

@ApiTags('maintenance 设备维修')
@ApiBearerAuth()
@Controller('maintenance')
@PageAccess(PagePermission.MAINTENANCE)
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get('records')
  @ApiOperation({ summary: '维修日志记录；可识别的工作时间自动计算工时' })
  list(@Query() query: RecordsQuery) {
    return this.maintenance.list(query.year);
  }

  @Public()
  @Get('options')
  @ApiOperation({ summary: '登记页联想选项（匿名可读，仅人员/部门/区域/设备/故障分类字段）' })
  options() {
    return this.maintenance.optionRows();
  }

  @Public()
  @Post('records')
  @UseGuards(ThrottlerGuard)
  @UseFilters(ThrottlerExceptionFilter)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: '新增维修登记（无需登录，同 IP 每分钟最多 20 次）' })
  create(@Body() body: MaintenanceRecordDto) {
    return this.maintenance.create(body);
  }

  @Patch('records/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: '修改维修记录（管理员）' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: MaintenanceRecordDto) {
    return this.maintenance.update(id, body);
  }

  @Delete('records/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: '删除维修记录（管理员）' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.maintenance.remove(id);
  }
}
