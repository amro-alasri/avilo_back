import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: any = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'string' ? { message: res } : res;
    } else if (exception instanceof Error) {
      this.logger.error(`Exception: ${exception.message}`, exception.stack);
      message = { message: 'Internal server error' };
      // In development, you might expose exception.message
    }

    const errorResponse = {
      ...message,
      timestamp: new Date().toISOString(),
      path: request.url,
      tenantId: (request as any).user?.tenantId || (request.headers['x-tenant-id'] as string) || null,
    };

    response.status(status).send(errorResponse);
  }
}
