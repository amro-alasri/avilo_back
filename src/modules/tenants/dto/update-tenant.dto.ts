import { IsOptional, IsString } from 'class-validator';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  domain?: string;
  
  @IsOptional()
  @IsString()
  status?: 'active' | 'suspended' | 'trial' | 'cancelled';
  
  @IsOptional()
  @IsString()
  plan?: 'free' | 'starter' | 'professional' | 'enterprise';
}
