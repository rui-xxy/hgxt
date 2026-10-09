import { Body, Controller, Get, HttpCode, Post, Req, UseFilters, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { LoginResponse, RefreshResponse, UserDTO } from '@hgxt/shared';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { ThrottlerExceptionFilter } from '../common/filters/throttler-exception.filter';
import { parseUserAgent } from '../common/utils/ua';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';

/** 从请求里取访问监控需要的元数据（IP + User-Agent 摘要） */
function requestMeta(req: Request) {
  return { ip: typeof req.ip === 'string' ? req.ip : null, ua: parseUserAgent(req.headers['user-agent']) };
}

/**
 * A5：只对认证端点限流（内部系统全公司常共享出口 IP，全局限流会误伤正常使用）。
 * 内存存储，单实例有效；多实例部署时需换 Redis 存储（见整改文档 A5 备注）。
 */
@ApiTags('auth 认证')
@UseGuards(ThrottlerGuard)
@UseFilters(ThrottlerExceptionFilter)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: '登录（用户名 + 密码，同 IP 每分钟最多 10 次）' })
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<LoginResponse> {
    return this.authService.login(dto.username, dto.password, requestMeta(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: '刷新令牌（轮换：旧 refresh 作废、下发新的）' })
  refresh(@Body() dto: RefreshDto): Promise<RefreshResponse> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: '登出（作废传入的 refresh token，幂等）' })
  async logout(@Body() dto: LogoutDto, @Req() req: Request): Promise<{ success: true }> {
    await this.authService.logout(dto.refreshToken, requestMeta(req));
    return { success: true };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '当前登录用户信息' })
  me(@CurrentUser() user: AuthUser): Promise<UserDTO> {
    return this.authService.me(user.id);
  }
}
