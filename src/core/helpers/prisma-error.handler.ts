import { BadRequestException, ConflictException } from '@nestjs/common';

/**
 * Handles Prisma known request errors and maps them to appropriate HTTP exceptions.
 * Call this in catch blocks of service methods.
 */
export function handlePrismaError(error: any): never {
  // P2002: Unique constraint violation
  if (error?.code === 'P2002') {
    const fields = error?.meta?.target ?? ['field'];
    throw new ConflictException(`القيمة مكررة: ${Array.isArray(fields) ? fields.join(', ') : fields}`);
  }

  // P2025: Record not found (e.g. update/delete on non-existing record)
  if (error?.code === 'P2025') {
    throw new BadRequestException('السجل غير موجود');
  }

  // P2003: Foreign key constraint violation
  if (error?.code === 'P2003') {
    throw new BadRequestException('انتهاك قيد المفتاح الخارجي - تأكد من صحة البيانات المرتبطة');
  }

  // DriverAdapterError wraps Prisma errors (used by @prisma/adapter-pg)
  if (error?.driverAdapterError) {
    const message: string = error?.driverAdapterError?.message ?? '';
    if (message.includes('duplicate key') || message.includes('UniqueConstraintViolation')) {
      throw new ConflictException('القيمة مكررة - يوجد سجل بنفس البيانات');
    }
    if (message.includes('foreign key') || message.includes('ForeignKeyViolation')) {
      throw new BadRequestException('انتهاك قيد المفتاح الخارجي');
    }
  }

  // Re-throw unknown errors
  throw error;
}
