import { Global, Module } from '@nestjs/common';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';

/**
 * 访问监控：事件写入（登录/登出/表单提交等由 auth、forms 模块调用）
 * 与查询聚合（本模块控制器）。@Global 让记录方无需重复 import。
 */
@Global()
@Module({
  controllers: [MonitorController],
  providers: [MonitorService],
  exports: [MonitorService],
})
export class MonitorModule {}
