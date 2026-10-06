import { ApiProperty } from '@nestjs/swagger';
import { PAGE_PERMISSION_VALUES, Role, type PagePermission } from '@hgxt/shared';
import { Transform } from 'class-transformer';
import {
  IsArray,
  ArrayUnique,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/** E1：username 规则以后端为准（前端正则只是提前提示，不是系统规则） */
export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{2,64}$/;
export const USERNAME_MESSAGE = '用户名需为 2-64 位字母、数字、下划线或横线（不区分大小写）';

/** class-transformer @Transform 的入参是 { value, ... }，只接收并返回值本身 */
function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateUserDto {
  @ApiProperty({ description: '登录用户名（创建后不可修改，入库统一小写）', example: 'zhangsan' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: '请输入用户名' })
  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username!: string;

  @ApiProperty({ description: '姓名', example: '张三' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: '请输入姓名' })
  @MaxLength(64)
  name!: string;

  @ApiProperty({ description: '初始密码，至少 8 位' })
  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(128)
  password!: string;

  @ApiProperty({ description: '手机号', required: false })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiProperty({ description: '角色', enum: Role })
  @IsIn(Object.values(Role), { message: '角色不合法' })
  role!: Role;

  @ApiProperty({ description: '普通用户可访问的页面', enum: PAGE_PERMISSION_VALUES, isArray: true, required: false })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @IsIn(PAGE_PERMISSION_VALUES, { each: true, message: '页面权限不合法' })
  pagePermissions?: PagePermission[];
}
