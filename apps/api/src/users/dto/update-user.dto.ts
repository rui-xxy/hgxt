import { ApiPropertyOptional } from '@nestjs/swagger';
import { PAGE_PERMISSION_VALUES, Role, type PagePermission } from '@hgxt/shared';
import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

/** class-transformer @Transform 的入参是 { value, ... }，只接收并返回值本身 */
function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * E3 可空字段 PATCH 语义（适用于 phone）：
 *   字段缺省（undefined）= 不修改
 *   显式 null            = 清空
 *   字符串               = 设置值
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ description: '姓名（不可传空字符串）' })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '姓名不能为空' })
  @MaxLength(64)
  name?: string;

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

  @ApiPropertyOptional({ description: '普通用户可访问的页面', enum: PAGE_PERMISSION_VALUES, isArray: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @IsIn(PAGE_PERMISSION_VALUES, { each: true, message: '页面权限不合法' })
  pagePermissions?: PagePermission[];
}
