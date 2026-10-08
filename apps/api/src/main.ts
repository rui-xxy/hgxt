import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
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

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 可选：部署在 nginx 等反向代理之后时设 TRUST_PROXY=1，采信 X-Forwarded-For（信任一跳），
  // 否则限流会把全部用户当成反代 IP 共用一个桶；API 直接对外时保持关闭（防伪造头绕过限流）
  if (process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
  }

  // B6：基础 HTTP 安全头。CSP 会拦 Swagger UI 的内联脚本，开发环境关闭、生产保留。
  // 生产模式下 API 同时托管前端静态产物（见下方 useStaticAssets）：
  // AntD 会注入内联 <style>，默认 CSP 不含 'unsafe-inline' 会把整站样式拦掉，故显式放开 style-src。
  // 例外：登录页两段动画 /login-sulfur/ 与 /login-showreel/ 内含内联启动脚本，
  // 这两个素材路径豁免 CSP（helmet 其余安全头照常），全站其他路径仍保持严格策略
  const strictHelmet = helmet({
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            // 纯 HTTP 直连部署必须关闭：helmet 默认开启会把页面资源强制升级为 https，
            // 而本服务不提供 TLS，浏览器升级后全部资源加载失败导致白屏（HTTPS 反代部署可再打开）
            upgradeInsecureRequests: null,
          },
        }
      : false,
  });
  const looseHelmet = helmet({ contentSecurityPolicy: false });
  // 登录页两段影片素材目录（含内联启动脚本，会被 script-src 'self' 拦掉）豁免 CSP
  const cspExempt = ['/login-sulfur/', '/login-showreel/'];
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (cspExempt.some((prefix) => req.path.startsWith(prefix))) {
      looseHelmet(req, res, next);
      return;
    }
    strictHelmet(req, res, next);
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 剥掉 DTO 里没声明的字段
      transform: true, // query 参数按 @Type() 转数字等
    }),
  );

  // 单进程部署：API 直接托管 apps/admin 的构建产物，前端不需要额外的静态服务器/nginx。
  // 目录存在才启用——开发模式前端走 vite:5173，互不影响
  const adminDist = resolve(__dirname, '../../admin/dist');
  const serveStatic = existsSync(adminDist);
  if (serveStatic) {
    app.useStaticAssets(adminDist);
    // SPA 路由回退：/api 之外的未命中路径统一回 index.html，支持 /production/plan 等深链刷新
    app
      .getHttpAdapter()
      .getInstance()
      .get(/^\/(?!api(?:\/|$)).*/, (_req: Request, res: Response) => {
        res.sendFile(join(adminDist, 'index.html'));
      });
  }

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
  new Logger('Bootstrap').log(
    `API 已启动: http://${host}:${port}（环境: ${isProduction ? 'production' : 'development'}）` +
      (serveStatic ? `，前端页面: http://${host}:${port}/` : ''),
  );
}

void bootstrap();
