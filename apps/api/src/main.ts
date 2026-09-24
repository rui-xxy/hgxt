import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 剥掉 DTO 里没声明的字段
      transform: true, // query 参数按 @Type 转数字等
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('HGXT API')
    .setDescription('HGXT 管理后台 V1：认证 + 用户管理')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`API 已启动: http://localhost:${port}（Swagger: /api/docs）`);
}

void bootstrap();
