import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@hgxt/shared';
import { IsIn } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({ description: '用户状态', enum: UserStatus })
  @IsIn(Object.values(UserStatus), { message: '状态不合法' })
  status!: UserStatus;
}
