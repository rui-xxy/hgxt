import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

/** B5：JWT Secret 启动校验——弱配置宁可拒绝启动，也不带病运行 */
function validateJwtSecret(isProduction: boolean): void {
  const secret = process.env.JWT_ACCESS_SECRET ?? '';
  const weakReason =
    secret.length < 32
      ? `长度不足 32 字符（当前 ${secret.length}）`
      : /change-me|do-not-use|example/i.test(secret)
        ? '仍是示例值'
        : null;

  if (!weakReason) return;
  const message = `JWT_ACCESS_SECRET 配置过弱：${weakReason}`;
  if (isProduction) {
    throw new Error(`${message}，生产环境拒绝启动。请设置至少 32 字符的随机密钥`);
  }
  new Logger('Bootstrap').warn(`${message}（开发环境仅警告，生产环境将拒绝启动）`);
}

async function bootstrap(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  validateJwtSecret(isProduction);

  const app = await NestFactory.create(AppModule);

  // B6：基础 HTTP 安全头。CSP 会拦 Swagger UI 的内联脚本，开发环境关闭、生产保留
  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false,
    }),
  );

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 剥掉 DTO 里没声明的字段
      transform: true, // query 参数按 @Type 转数字等
    }),
  );

  // B4：Swagger 仅开发默认开启；生产需要显式 ENABLE_SWAGGER=true
  if (!isProduction || process.env.ENABLE_SWAGGER === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('HGXT API')
      .setDescription('HGXT 管理后台 V1：认证 + 用户管理')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  // B2：默认只监听本机回环；对外部署显式设置 HOST=0.0.0.0
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? '127.0.0.1';
  await app.listen(port, host);
  new Logger('Bootstrap').log(`API 已启动: http://${host}:${port}（环境: ${isProduction ? 'production' : 'development'}）`);
}

void bootstrap();
