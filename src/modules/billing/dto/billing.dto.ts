import { IsNotEmpty, IsNumber, IsString, IsEnum, IsDateString, IsOptional } from 'class-validator';

export enum TenantPlan {
  free = 'free',
  starter = 'starter',
  professional = 'professional',
  enterprise = 'enterprise'
}

export enum BillingCycle {
  monthly = 'monthly',
  yearly = 'yearly'
}

export class CreateSubscriptionDto {
  @IsEnum(TenantPlan)
  plan: TenantPlan;

  @IsEnum(BillingCycle)
  billingCycle: BillingCycle;

  @IsDateString()
  startDate: string;
}

export class CreateInvoiceDto {
  @IsNumber()
  amount: number; // in cents

  @IsDateString()
  dueDate: string;

  @IsOptional()
  @IsString()
  description?: string;
}
