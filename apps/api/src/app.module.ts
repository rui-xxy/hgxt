import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FormsModule } from './forms/forms.module';
import { ProductionModule } from './production/production.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PagePermissionGuard } from './common/guards/page-permission.guard';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, UsersModule, FormsModule, ProductionModule, MaintenanceModule],
  // 注册顺序即执行顺序：先认证、后角色
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PagePermissionGuard },
  ],
})
export class AppModule {}
