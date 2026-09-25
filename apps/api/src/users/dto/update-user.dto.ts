import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@hgxt/shared';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** class-transformer @Transform 的入参是 { value, ... }，只接收并返回值本身 */
function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * E3 可空字段 PATCH 语义（对 email/phone 统一生效）：
 *   字段缺省（undefined）= 不修改
 *   显式 null            = 清空
 *   字符串               = 设置值
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ description: '姓名' })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({ description: '邮箱；null=清空，缺省=不修改（统一小写）', nullable: true, type: String })
  @Transform(trimString)
  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(128)
  email?: string | null;

  @ApiPropertyOptional({ description: '手机号；null=清空，缺省=不修改', nullable: true, type: String })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @ApiPropertyOptional({ description: '角色（不能降级最后一个管理员）', enum: Role })
  @IsOptional()
  @IsIn(Object.values(Role), { message: '角色不合法' })
  role?: Role;
}
