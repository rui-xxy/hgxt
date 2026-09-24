import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LogoutDto {
  @ApiProperty({ description: '要作废的 Refresh Token' })
  @IsString()
  @IsNotEmpty({ message: '缺少 refreshToken' })
  @MaxLength(256)
  refreshToken!: string;
}
