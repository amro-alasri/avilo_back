import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null))
  domain?: string | null;

  @IsOptional()
  @IsString()
  contactEmail?: string | null;

  @IsOptional()
  @IsString()
  contactPhone?: string | null;
  
  @IsOptional()
  @IsString()
  status?: 'active' | 'suspended' | 'trial' | 'cancelled';
  
  @IsOptional()
  @IsString()
  plan?: 'free' | 'starter' | 'professional' | 'enterprise';
}
