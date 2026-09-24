import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@hgxt/shared';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: '姓名' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({ description: '邮箱（传空字符串视为清空）' })
  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(128)
  email?: string;

  @ApiPropertyOptional({ description: '手机号（传空字符串视为清空）' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ description: '角色', enum: Role })
  @IsOptional()
  @IsIn(Object.values(Role), { message: '角色不合法' })
  role?: Role;
}
