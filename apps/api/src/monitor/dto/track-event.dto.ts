import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import type { TrackEventBody } from '@hgxt/shared';

/**
 * 前端埋点上报：只接受行为埋点（page_view / heartbeat）。
 * export 等业务事实由服务端在真正执行导出的接口里记录——
 * 动作与页面由客户端决定的事件不能进入审计/安全提醒口径。
 */
export class TrackEventDto implements TrackEventBody {
  @IsIn(['page_view', 'heartbeat'])
  action!: TrackEventBody['action'];

  @IsOptional()
  @IsString()
  @Length(1, 64)
  page?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  detail?: string;
}
