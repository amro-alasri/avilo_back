import { IsNotEmpty, IsString, IsEnum, IsDateString, IsOptional, IsNumber, IsBoolean, Min } from 'class-validator';
import { TenantPlan } from './billing.dto';

export class CreateAdminSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsEnum(TenantPlan)
  plan: TenantPlan;

  @IsString()
  @IsNotEmpty()
  billingCycle: string; // 'monthly' | 'yearly' | 'custom'

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsNumber()
  @Min(1)
  maxEmployees: number;

  @IsNumber()
  @Min(1)
  maxLocations: number;

  @IsBoolean()
  hasPayroll: boolean;

  @IsBoolean()
  hasLeaves: boolean;

  @IsBoolean()
  hasVoiceBiometrics: boolean;

  @IsBoolean()
  hasFaceBiometrics: boolean;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;

  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateAdminSubscriptionDto {
  @IsOptional()
  @IsEnum(TenantPlan)
  plan?: TenantPlan;

  @IsOptional()
  @IsString()
  billingCycle?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxEmployees?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxLocations?: number;

  @IsOptional()
  @IsBoolean()
  hasPayroll?: boolean;

  @IsOptional()
  @IsBoolean()
  hasLeaves?: boolean;

  @IsOptional()
  @IsBoolean()
  hasVoiceBiometrics?: boolean;

  @IsOptional()
  @IsBoolean()
  hasFaceBiometrics?: boolean;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}
