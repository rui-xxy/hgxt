import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class FormListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize = 20;
  @IsOptional() @IsString() @MaxLength(64)
  keyword?: string;
  @IsOptional() @IsString() @MaxLength(32)
  category?: string;
}

export class SubmissionListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  pageSize = 100;
  @IsOptional() @IsString() @MaxLength(100)
  keyword?: string;
  @IsOptional() @IsString() @MaxLength(32)
  progress?: string;
}
