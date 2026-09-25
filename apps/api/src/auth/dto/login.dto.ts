import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** class-transformer @Transform 的入参是 { value, ... }，只接收并返回值本身 */
function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class LoginDto {
  @ApiProperty({ description: '用户名（不区分大小写）', example: 'admin' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: '请输入用户名' })
  @MaxLength(64)
  username!: string;

  @ApiProperty({ description: '密码' })
  @IsString()
  @IsNotEmpty({ message: '请输入密码' })
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
