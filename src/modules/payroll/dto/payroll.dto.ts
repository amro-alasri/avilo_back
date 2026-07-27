import { IsNotEmpty, IsNumber, Min, Max, IsString } from 'class-validator';

export class CreatePayrollRunDto {
  @IsNumber()
  @Min(1)
  @Max(12)
  periodMonth: number;

  @IsNumber()
  @Min(2000)
  periodYear: number;
}
