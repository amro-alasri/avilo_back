import { IsEnum, IsNumber, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AttendanceMethod } from '../../../../prisma/generated/prisma/enums.js';

class LocationDto {
  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;

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
