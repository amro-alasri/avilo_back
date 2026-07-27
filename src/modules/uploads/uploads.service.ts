import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { nanoid } from 'nanoid';
import * as path from 'path';

@Injectable()
export class UploadsService {
  private minioClient: Minio.Client;
  private logger = new Logger(UploadsService.name);
  private bucketName: string;

  constructor(private configService: ConfigService) {
    this.bucketName = this.configService.get('MINIO_BUCKET', 'avilo-uploads');
    
    this.minioClient = new Minio.Client({
      endPoint: this.configService.get('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(this.configService.get('MINIO_PORT', '9000')),
      useSSL: this.configService.get('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.configService.get('MINIO_ACCESS_KEY', 'admin'),
      secretKey: this.configService.get('MINIO_SECRET_KEY', 'admin123'),
    });

    this.ensureBucketExists();
  }

  private async ensureBucketExists() {
    try {
      const exists = await this.minioClient.bucketExists(this.bucketName);
      if (!exists) {
        await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
        const policy = {
          Version: "2012-10-17",
          Statement: [
            {
              Action: ["s3:GetObject"],
              Effect: "Allow",
              Principal: "*",
              Resource: [`arn:aws:s3:::${this.bucketName}/*`]
            }
          ]
        };
        await this.minioClient.setBucketPolicy(this.bucketName, JSON.stringify(policy));
        this.logger.log(`Created bucket ${this.bucketName} with public read policy`);
      }
    } catch (err) {
      this.logger.error('Failed to initialize MinIO bucket', err);
    }
  }

  async uploadFile(file: any, folder: string = 'misc'): Promise<string> {
    const ext = path.extname(file.filename);
    const filename = `${folder}/${nanoid()}${ext}`;
    
    await this.minioClient.putObject(
      this.bucketName,
      filename,
      file.file,
      undefined,
      { 'Content-Type': file.mimetype }
    );

    const endPoint = this.configService.get('MINIO_ENDPOINT', 'localhost');
    const port = this.configService.get('MINIO_PORT', '9000');
    const ssl = this.configService.get('MINIO_USE_SSL', 'false') === 'true';
    const protocol = ssl ? 'https' : 'http';

    return `${protocol}://${endPoint}:${port}/${this.bucketName}/${filename}`;
  }
}
