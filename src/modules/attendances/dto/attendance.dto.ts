import { IsEnum, IsNumber, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AttendanceMethod } from '../../../../prisma/generated/prisma/enums.js';

class LocationDto {
  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsNumber()
  accuracy: number;

  @IsOptional()
  @IsNumber()
  speed?: number;

  @IsOptional()
  @IsNumber()
  heading?: number;

  @IsOptional()
  isMockLocation?: boolean;

  @IsOptional()
  address?: string;
}

export class CheckInDto {
  @IsEnum(AttendanceMethod)
  method: AttendanceMethod;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;
}

export class CheckOutDto {
  @IsEnum(AttendanceMethod)
  method: AttendanceMethod;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;
}
