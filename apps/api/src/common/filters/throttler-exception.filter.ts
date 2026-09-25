import { Catch, ExceptionFilter, ExecutionContext } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

/** 429 返回中文文案（默认的 ThrottlerException 信息面向开发者） */
@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  catch(_exception: ThrottlerException, host: ExecutionContext): void {
    const response = host.switchToHttp().getResponse();
    response.status(429).json({
      statusCode: 429,
      error: 'TooManyRequests',
      message: '请求过于频繁，请稍后再试',
    });
  }
}
