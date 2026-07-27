import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateLeaveRequestDto {
  @IsUUID()
  @IsNotEmpty()
  leaveTypeId: string;

  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

export class UpdateLeaveStatusDto {
  @IsString()
  @IsNotEmpty()
  status: 'approved' | 'rejected';

  @IsString()
  @IsOptional()
  reviewNotes?: string;
}
