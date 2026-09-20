import { IsEmail, IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class BiometricLoginDto {
  @IsString()
  @IsNotEmpty()
  tenantSlug: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  deviceUuid: string;

  @IsString()
  @IsNotEmpty()
  biometricToken: string;

  @IsString()
  @IsOptional()
  deviceModel?: string;

  @IsString()
  @IsOptional()
  platform?: string;

  @IsString()
  @IsOptional()
  osVersion?: string;

  @IsString()
  @IsOptional()
  appVersion?: string;
}
