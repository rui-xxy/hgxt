import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@hgxt/shared';
import { IsEmail, IsIn, IsOptional, IsString, IsNotEmpty, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ description: '登录用户名（创建后不可修改）', example: 'zhangsan' })
  @IsString()
  @IsNotEmpty({ message: '请输入用户名' })
  @MaxLength(64)
  username!: string;

  @ApiProperty({ description: '姓名', example: '张三' })
  @IsString()
  @IsNotEmpty({ message: '请输入姓名' })
  @MaxLength(64)
  name!: string;

  @ApiProperty({ description: '初始密码，至少 8 位' })
  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(128)
  password!: string;

  @ApiProperty({ description: '邮箱', required: false })
  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(128)
  email?: string;

  @ApiProperty({ description: '手机号', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiProperty({ description: '角色', enum: Role })
  @IsIn(Object.values(Role), { message: '角色不合法' })
  role!: Role;
}
