import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Role } from '@hgxt/shared';
import { Roles } from '../common/decorators/roles.decorator';
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
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get('records')
  @ApiOperation({ summary: '维修日志原始记录；看板统计由这些记录计算' })
  list(@Query() query: RecordsQuery) {
    return this.maintenance.list(query.year);
  }

  @Post('records')
  @ApiOperation({ summary: '新增维修登记' })
  create(@Body() body: MaintenanceRecordDto) {
    return this.maintenance.create(body);
  }

  @Patch('records/:id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: '修改维修记录（管理员）' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: MaintenanceRecordDto) {
    return this.maintenance.update(id, body);
  }

  @Delete('records/:id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: '删除维修记录（管理员）' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.maintenance.remove(id);
  }
}
