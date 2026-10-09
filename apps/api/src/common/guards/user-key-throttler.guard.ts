import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * 按已认证用户分桶的限流（替代默认的按 IP）。
 *
 * 用于埋点这类「每个在线用户都持续上报」的端点：内网全公司常共享出口 IP
 * （见 AGENTS.md A5 备注），按 IP 限流会让 100 名在线员工的心跳互相抢占配额，
 * 造成监控数据静默丢失。认证后的 userId 才是正确的桶键；匿名请求回退 IP。
 */
@Injectable()
export class UserKeyThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const user = (req as { user?: { id?: string } }).user;
    return Promise.resolve(user?.id ?? (req.ip as string | undefined) ?? 'anonymous');
  }
}
