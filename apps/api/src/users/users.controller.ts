import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { UserDTO, UserPageResult } from '@hgxt/shared';
import { Role } from '@hgxt/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('users 用户管理')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: '用户列表（分页 + 关键字搜索）' })
  findAll(@Query() query: QueryUsersDto): Promise<UserPageResult> {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '用户详情' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserDTO> {
    return this.usersService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: '新增用户' })
  create(@Body() dto: CreateUserDto): Promise<UserDTO> {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '编辑用户（username 不可修改）' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto): Promise<UserDTO> {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '启用 / 禁用用户（禁用后立即踢下线，不能禁用自己）' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<UserDTO> {
    return this.usersService.updateStatus(id, dto.status, currentUser.id);
  }

  @Post(':id/reset-password')
  @ApiOperation({ summary: '重置用户密码（重置后该用户全部会话失效）' })
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<UserDTO> {
    return this.usersService.resetPassword(id, dto.newPassword);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除用户（RefreshToken 级联删，表单提交记录保留但提交人置空）' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<{ success: true }> {
    return this.usersService.remove(id, currentUser.id);
  }
}
