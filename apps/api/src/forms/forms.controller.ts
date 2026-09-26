import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FormData, SaveFormSubmissionsBody } from '@hgxt/shared';
import { Role } from '@hgxt/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { FormsService } from './forms.service';
import { FormListQuery, SubmissionListQuery } from './query.dto';

/**
 * 权限模型：
 * - 登录即可（USER 员工填报）：表单列表 / 表单定义 / 提交填报
 * - 仅 SUPER_ADMIN（数据管理）：读历史提交 / 批量保存（含改、删）
 */
@ApiTags('forms 表单')
@ApiBearerAuth()
@Controller('forms')
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @Get()
  @ApiOperation({ summary: '表单列表，最新填写日期来自提交内容' })
  list(@Query() query: FormListQuery) { return this.forms.list(query); }

  @Get(':id')
  @ApiOperation({ summary: '表单与字段定义' })
  get(@Param('id', ParseUUIDPipe) id: string) { return this.forms.get(id); }

  @Post(':id/submissions')
  @ApiOperation({ summary: '填写并提交表单' })
  createSubmission(@Param('id', ParseUUIDPipe) id: string, @Body() body: { data: FormData }, @CurrentUser() user: AuthUser) {
    return this.forms.createSubmission(id, body?.data, user.id);
  }

  @Get(':id/submissions/latest')
  @ApiOperation({ summary: '上次值：每个字段最近一次非空值（员工填报参考，USER 可用）' })
  lastValues(@Param('id', ParseUUIDPipe) id: string) {
    return this.forms.lastValues(id);
  }

  // ── 数据管理接口：仅 SUPER_ADMIN ──

  @Get(':id/submissions')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: '表单数据表格（仅管理员）' })
  listSubmissions(@Param('id', ParseUUIDPipe) id: string, @Query() query: SubmissionListQuery) {
    return this.forms.listSubmissions(id, query);
  }

  @Post(':id/submissions/batch')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: '批量保存表格增删改（仅管理员）' })
  saveSubmissions(@Param('id', ParseUUIDPipe) id: string, @Body() body: SaveFormSubmissionsBody, @CurrentUser() user: AuthUser) {
    return this.forms.saveSubmissions(id, body, user.id);
  }
}
