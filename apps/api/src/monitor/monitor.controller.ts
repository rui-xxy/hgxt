import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@hgxt/shared';
import type {
  MonitorDepartmentsResult,
  MonitorLogResult,
  MonitorMemberResult,
  MonitorOnlineResult,
  MonitorOverviewResult,
  MonitorPageHeatResult,
  MonitorSecurityResult,
} from '@hgxt/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { UserKeyThrottlerGuard } from '../common/guards/user-key-throttler.guard';
import { parseUserAgent } from '../common/utils/ua';
import { MonitorService } from './monitor.service';
import { TrackEventDto } from './dto/track-event.dto';
import {
  MonitorLogsQueryDto,
  MonitorMemberQueryDto,
  MonitorRangeDto,
  MonitorToDateDto,
} from './dto/monitor-query.dto';

@ApiTags('monitor 访问监控')
@ApiBearerAuth()
@Controller('monitor')
export class MonitorController {
  constructor(private readonly monitor: MonitorService) {}

  /**
   * 埋点限流按已认证用户分桶（每用户 120 次/分钟）：共享出口 IP 下员工互不抢占。
   * 正常用量 ≈ 每 60 秒 1 次心跳 + 少量页面切换；超频客户端被丢弃不影响他人。
   */
  @Post('events')
  @HttpCode(204)
  @UseGuards(UserKeyThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: '埋点上报（仅行为埋点：page_view / heartbeat；按用户限流）' })
  async track(
    @Body() dto: TrackEventDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<void> {
    const ua = parseUserAgent(req.headers['user-agent']);
    const ip = typeof req.ip === 'string' ? req.ip : null;
    await this.monitor.trackEvent(user.id, dto, ip, ua);
  }

  @Get('overview')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: '总览：KPI / 访问走势 / 高峰 / 登录与设备（from、to 为上海时区日期，最多 92 天）' })
  overview(@Query() query: MonitorRangeDto): Promise<MonitorOverviewResult> {
    return this.monitor.overview(query.from, query.to);
  }

  @Get('security')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: '安全提醒：登录失败 / 非工作时间登录 / 导出 / 新设备登录' })
  security(@Query() query: MonitorRangeDto): Promise<MonitorSecurityResult> {
    return this.monitor.security(query.from, query.to);
  }

  @Get('online')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: '当前在线成员（最近 10 分钟内有活动；登出/禁用立即移出）' })
  online(): Promise<MonitorOnlineResult> {
    return this.monitor.onlineList();
  }

  @Get('pages')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: '页面热度：访问次数 / 人数 / 平均停留 / 环比' })
  pages(@Query() query: MonitorRangeDto): Promise<MonitorPageHeatResult> {
    return this.monitor.pageHeat(query.from, query.to);
  }

  @Get('departments')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: '部门活跃：截至 to（默认今天）的 7 天每日访问人数' })
  departments(@Query() query: MonitorToDateDto): Promise<MonitorDepartmentsResult> {
    return this.monitor.departments(query.to);
  }

  @Get('logs')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: '访问日志（tab=all/login/view/data；department=部门名或 none=未分配）',
  })
  logs(@Query() query: MonitorLogsQueryDto): Promise<MonitorLogResult> {
    return this.monitor.logs(query);
  }

  @Get('logs/export')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: '访问日志导出 CSV（筛选条件与 logs 一致；超级管理员的导出不记录；超 1 万条截断并在文件内标注）' })
  async exportLogs(
    @Query() query: MonitorLogsQueryDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { csv, from: usedFrom, to: usedTo, count, total } = await this.monitor.logsCsv(query);
    // 导出是服务端可验证的业务事实：在真正完成导出的这里记录，而不是依赖客户端上报
    await this.monitor.recordForUser(user.id, 'export', 'monitor', `访问日志 · ${count} 条`, {
      ip: typeof req.ip === 'string' ? req.ip : null,
      ua: parseUserAgent(req.headers['user-agent']),
    });
    const filename = `访问日志_${usedFrom}_${usedTo}.csv`;
    res
      .setHeader('Content-Type', 'text/csv; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
      // 截断信息透出给前端提示（total > count 时说明有日志未包含在文件里）
      .setHeader('X-Total-Count', String(total))
      .setHeader('X-Exported-Count', String(count))
      .send(csv);
  }

  @Get('members/:id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: '成员访问详情（date 为上海时区日期，默认今天）' })
  member(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MonitorMemberQueryDto,
  ): Promise<MonitorMemberResult> {
    return this.monitor.member(id, query.date);
  }
}
