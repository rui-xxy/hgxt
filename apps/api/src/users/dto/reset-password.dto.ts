import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: '新密码，至少 8 位' })
  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(128)
  newPassword!: string;
}
