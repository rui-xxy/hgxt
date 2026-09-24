import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: '登录时下发的 Refresh Token' })
  @IsString()
  @IsNotEmpty({ message: '缺少 refreshToken' })
  @MaxLength(256)
  refreshToken!: string;
}
