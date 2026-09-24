import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: '用户名', example: 'admin' })
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
