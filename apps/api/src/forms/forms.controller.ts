import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FormData, SaveFormSubmissionsBody } from '@hgxt/shared';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { FormsService } from './forms.service';
import { FormListQuery, SubmissionListQuery } from './query.dto';

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

  @Get(':id/submissions')
  @ApiOperation({ summary: '表单数据表格' })
  listSubmissions(@Param('id', ParseUUIDPipe) id: string, @Query() query: SubmissionListQuery) {
    return this.forms.listSubmissions(id, query);
  }

  @Post(':id/submissions')
  @ApiOperation({ summary: '填写并提交表单' })
  createSubmission(@Param('id', ParseUUIDPipe) id: string, @Body() body: { data: FormData }, @CurrentUser() user: AuthUser) {
    return this.forms.createSubmission(id, body?.data, user.id);
  }

  @Post(':id/submissions/batch')
  @ApiOperation({ summary: '批量保存表格增删改' })
  saveSubmissions(@Param('id', ParseUUIDPipe) id: string, @Body() body: SaveFormSubmissionsBody, @CurrentUser() user: AuthUser) {
    return this.forms.saveSubmissions(id, body, user.id);
  }
}
