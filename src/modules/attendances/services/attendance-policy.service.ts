import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { VerificationResult } from './location-verification.service.js';

export interface FinalDecision {
  totalScore: number;
  status: string; // 'present', 'pending_review', 'rejected'
  reasons: string[];
}

@Injectable()
export class AttendancePolicyService {
  private readonly logger = new Logger(AttendancePolicyService.name);

  evaluate(results: VerificationResult[]): FinalDecision {
    let totalScore = 0;
    const reasons: string[] = [];
    let isHardReject = false;

    for (const result of results) {
      if (!result.isValid) {
        isHardReject = true;
      }
      totalScore += result.score;
      if (result.message) {
        reasons.push(result.message);
      }
    }

    // Face validation is omitted for now, so max score might be 75 instead of 100.
    // Let's normalize or adjust our thresholds based on available data.
    // For now, if max is 75 (Geofence 30, Accuracy 15, Speed 5, Mock 15, Device 5 + Face 25).
    // Let's scale totalScore by a factor to make it out of 100 if we assume Face is ignored.
    // If face is ignored, max points = 75. 
    // We'll multiply by (100/75) to normalize to 100.
    totalScore = Math.min(100, Math.round(totalScore * (100 / 75)));

    if (isHardReject) {
      this.logger.warn(`Attendance rejected. Score: ${totalScore}, Reasons: ${reasons.join(' | ')}`);
      throw new BadRequestException(`Attendance rejected: ${reasons.join(', ')}`);
    }

    if (totalScore >= 90) {
      return { totalScore, status: 'present', reasons };
    } else if (totalScore >= 70) {
      return { totalScore, status: 'pending_review', reasons: [...reasons, 'Low confidence score'] };
    } else {
      this.logger.warn(`Attendance rejected due to low score. Score: ${totalScore}`);
      throw new BadRequestException(`Attendance rejected: Score too low (${totalScore}). ${reasons.join(', ')}`);
    }
  }
}
