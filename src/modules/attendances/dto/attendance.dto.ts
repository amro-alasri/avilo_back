import { IsEnum, IsNumber, IsObject, IsOptional, ValidateNested, IsNotEmpty, IsString, IsArray, IsBoolean } from 'class-validator';
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

export class BeaconDto {
  @IsNotEmpty()
  uuid: string;

  @IsNumber()
  major: number;

  @IsNumber()
  minor: number;

  @IsNumber()
  rssi: number;
}

export class BiometricPayloadDto {
  @IsOptional()
  challengeId?: string;

  @IsOptional()
  embedding?: number[];

  @IsOptional()
  stepLogs?: any[];

  @IsOptional()
  livenessScore?: number;
}

export class CheckInDto {
  @IsEnum(AttendanceMethod)
  method: AttendanceMethod;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BiometricPayloadDto)
  biometrics?: BiometricPayloadDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BeaconDto)
  beacon?: BeaconDto;

  @IsOptional()
  deviceUuid?: string;

  @IsOptional()
  @IsBoolean()
  deviceBiometricConfirmed?: boolean;

  @IsOptional()
  kioskDeviceId?: string;
}

export class CheckOutDto {
  @IsEnum(AttendanceMethod)
  method: AttendanceMethod;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BiometricPayloadDto)
  biometrics?: BiometricPayloadDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BeaconDto)
  beacon?: BeaconDto;

  @IsOptional()
  deviceUuid?: string;

  @IsOptional()
  @IsBoolean()
  deviceBiometricConfirmed?: boolean;

  @IsOptional()
  kioskDeviceId?: string;
}
