import { Controller, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { UploadsService } from './uploads.service.js';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard.js';

@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  async uploadFile(@Req() req: FastifyRequest) {
    if (!req.isMultipart()) {
      throw new BadRequestException('Request is not multipart');
    }
    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No file uploaded');
    }
    const url = await this.uploadsService.uploadFile(data);
    return { url };
  }
}
