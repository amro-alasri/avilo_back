import { IsNotEmpty, IsNumber, IsString, IsArray, ValidateNested, IsDateString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum AmountType {
  fixed = 'fixed',
  percentage = 'percentage'
}

export enum ComponentType {
  allowance = 'allowance',
  deduction = 'deduction'
}

export class SalaryComponentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(ComponentType)
  type: ComponentType;

  @IsEnum(AmountType)
  amountType: AmountType;

  @IsNumber()
  amount: number;
}

export class CreateSalaryStructureDto {
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @IsDateString()
  @IsNotEmpty()
  effectiveDate: string;

  @IsNumber()
  baseSalary: number; // Stored in cents

  @IsString()
  @IsNotEmpty()
  currency: string = 'USD';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalaryComponentDto)
  components: SalaryComponentDto[];
}
