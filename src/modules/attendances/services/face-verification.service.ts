import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { EnrollBiometricDto } from '../dto/biometrics.dto.js';
import { BiometricType } from '../../../../prisma/generated/prisma/enums.js';
import { VerificationResult } from './location-verification.service.js';

@Injectable()
export class FaceVerificationService {
  private readonly logger = new Logger(FaceVerificationService.name);
  
  // Standard ArcFace acceptance threshold (Cosine Similarity >= 0.82)
  public static readonly COSINE_THRESHOLD = 0.82;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculates the Cosine Similarity between two N-dimensional numerical vectors.
   * Sim(A, B) = (A . B) / (||A|| * ||B||)
   */
  public computeCosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length !== vectorB.length) {
      throw new BadRequestException(
        `Vector dimensionality mismatch: ${vectorA.length} vs ${vectorB.length}`,
      );
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /**
   * Enrolls or updates an employee's master biometric vector template.
   */
  async enrollTemplate(tenantId: string, dto: EnrollBiometricDto) {
    if (!dto.employeeId) {
      throw new BadRequestException('Employee ID is required for biometric enrollment');
    }
    const rawId = dto.employeeId;
    const employeeId = typeof rawId === 'object' 
      ? (rawId as any)?.userId || (rawId as any)?.sub || (rawId as any)?.id 
      : String(rawId);

    const employee = await this.prisma.employee.findFirst({
      where: {
        OR: [
          { id: employeeId },
          { email: employeeId },
        ],
      },
    });

    if (!employee || (tenantId && employee.tenantId !== tenantId)) {
      throw new NotFoundException('Employee not found in this organization');
    }

    const actualEmployeeId = employee.id;
    const actualTenantId = employee.tenantId || tenantId;

    try {
      // Deactivate previous active templates of the same type for this employee
      await this.prisma.biometricTemplate.updateMany({
        where: {
          employeeId: actualEmployeeId,
          type: (dto.type as any) || BiometricType.face_arcface_512,
          isActive: true,
        },
        data: { isActive: false },
      });

      // Create new master template - wrap in object to ensure pg serializes as JSON rather than Postgres native array
      const template = await this.prisma.biometricTemplate.create({
        data: {
          tenantId: actualTenantId,
          employeeId: actualEmployeeId,
          type: (dto.type as any) || BiometricType.face_arcface_512,
          vectorData: { vector: dto.vector, length: dto.vector.length },
          qualityScore: dto.qualityScore ?? 1.0,
          isActive: true,
        },
      });

      this.logger.log(`Successfully enrolled biometric template for employee ${actualEmployeeId}`);
      return {
        success: true,
        templateId: template.id,
        algorithmVersion: template.algorithmVersion,
        enrolledAt: template.createdAt,
      };
    } catch (error: any) {
      this.logger.error(`Failed to persist biometric template: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to save face biometric template: ${error.message}`);
    }
  }

  /**
   * Verifies live biometric embedding against employee's enrolled reference template.
   */
  async verifyLiveEmbedding(
    employeeId: string,
    tenantId: string,
    liveEmbedding?: number[],
  ): Promise<VerificationResult & { similarityScore?: number }> {
    if (!liveEmbedding || liveEmbedding.length === 0) {
      return {
        score: 0,
        isValid: true, // Don't block if feature is optional, but provide 0 score
        message: 'No biometric embedding provided.',
      };
    }

    const template = await this.prisma.biometricTemplate.findFirst({
      where: {
        employeeId,
        tenantId,
        type: BiometricType.face_arcface_512,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!template) {
      this.logger.warn(`Employee ${employeeId} has no enrolled biometric template.`);
      return {
        score: 0,
        isValid: false,
        message: 'No biometric template enrolled for this employee. Please contact HR.',
      };
    }

    // Safely extract reference vector from various JSON storage representations
    let referenceVector: number[] = [];
    const rawData = template.vectorData as any;
    if (Array.isArray(rawData)) {
      referenceVector = rawData;
    } else if (rawData && Array.isArray(rawData.vector)) {
      referenceVector = rawData.vector;
    } else if (typeof rawData === 'string') {
      try {
        const parsed = JSON.parse(rawData);
        referenceVector = Array.isArray(parsed) ? parsed : (parsed?.vector || []);
      } catch {
        referenceVector = [];
      }
    }

    const similarity = this.computeCosineSimilarity(referenceVector, liveEmbedding);

    this.logger.debug(
      `Biometric matching for ${employeeId}: Cosine Similarity = ${similarity.toFixed(4)} (Threshold: ${FaceVerificationService.COSINE_THRESHOLD})`,
    );

    if (similarity >= FaceVerificationService.COSINE_THRESHOLD) {
      return {
        score: 40, // High confidence score
        isValid: true,
        similarityScore: similarity,
        message: `Biometric matched successfully (Score: ${(similarity * 100).toFixed(1)}%).`,
      };
    } else {
      return {
        score: 0,
        isValid: false,
        similarityScore: similarity,
        message: `Face verification failed: Identity mismatch (Score: ${(similarity * 100).toFixed(1)}%).`,
      };
    }
  }

  /**
   * Legacy verify helper for backwards compatibility.
   */
  verify(hasFaceMatched: boolean | undefined): VerificationResult {
    if (hasFaceMatched === false) {
      return { score: 0, isValid: false, message: 'Face mismatch.' };
    } else if (hasFaceMatched === true) {
      return { score: 25, isValid: true };
    }
    return { score: 0, isValid: true };
  }
}
