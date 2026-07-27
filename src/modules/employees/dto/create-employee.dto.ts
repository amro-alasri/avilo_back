import { IsEmail, IsNotEmpty, IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';

enum EmployeeStatus {
  active = 'active',
  on_leave = 'on_leave',
  terminated = 'terminated',
  probation = 'probation',
  pending = 'pending',
  suspended = 'suspended',
  rejected = 'rejected'
}

enum Gender {
  male = 'male',
  female = 'female'
}

export class CreateEmployeeDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsNotEmpty()
  employeeNumber: string;

  @IsString()
  @IsNotEmpty()
  jobTitle: string;

  @IsDateString()
  @IsNotEmpty()
  joinDate: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsString()
  phone?: string;
  
  @IsOptional()
  @IsString()
  roleId?: string; // Optional role assignment
}
