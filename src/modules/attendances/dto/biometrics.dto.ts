import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { BiometricType } from '../../../../prisma/generated/prisma/enums.js';

export class RequestChallengeDto {
  @IsOptional()
  @IsString()
  deviceUuid?: string;
}

export class EnrollBiometricDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsNotEmpty()
  @IsArray()
  @ArrayMinSize(128)
  @ArrayMaxSize(512)
  @IsNumber({}, { each: true })
  vector: number[];

  @IsOptional()
  @IsEnum(BiometricType)
  type?: BiometricType = BiometricType.face_arcface_512;

  @IsOptional()
  @IsNumber()
  qualityScore?: number = 1.0;
}

export class StepLogDto {
  @IsNotEmpty()
  @IsString()
  action: string;

  @IsNotEmpty()
  @IsNumber()
  timestamp: number;

  @IsOptional()
  metrics?: Record<string, any>;
}

export class VerifyBiometricDto {
  @IsNotEmpty()
  @IsString()
  challengeId: string;

  @IsNotEmpty()
  @IsArray()
  @ArrayMinSize(128)
  @ArrayMaxSize(512)
  @IsNumber({}, { each: true })
  embedding: number[];

  @IsOptional()
  @IsArray()
  stepLogs?: StepLogDto[];

  @IsOptional()
  @IsString()
  deviceUuid?: string;

  @IsOptional()
  @IsString()
  signature?: string;
}
