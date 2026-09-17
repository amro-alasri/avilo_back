import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { VerificationResult } from './location-verification.service.js';

export interface ShiftEvaluationContext {
  shift?: {
    startTime: string; // "08:00"
    endTime: string;   // "17:00"
    graceMinutesIn: number;
    graceMinutesOut: number;
    isNightShift: boolean;
  } | null;
  punchTime: Date;
  isCheckIn: boolean;
}

export interface FinalDecision {
  totalScore: number;
  status: string; // 'present' | 'late' | 'early_departure' | 'pending_review'
  lateMinutes?: number;
  earlyMinutes?: number;
  reasons: string[];
}

@Injectable()
export class AttendancePolicyService {
  private readonly logger = new Logger(AttendancePolicyService.name);

  /**
   * Evaluates verification results (Face, Liveness, Geofence, Beacon, Device).
   */
  evaluateVerification(results: VerificationResult[]): { totalScore: number; reasons: string[] } {
    let rawScore = 0;
    const reasons: string[] = [];
    let isHardReject = false;

    for (const result of results) {
      if (!result.isValid) {
        isHardReject = true;
      }
      rawScore += result.score;
      if (result.message) {
        reasons.push(result.message);
      }
    }

    if (isHardReject) {
      this.logger.warn(`Attendance rejected: ${reasons.join(' | ')}`);
      throw new BadRequestException(`Attendance verification failed: ${reasons.join(', ')}`);
    }

    // Normalize score to 100 max
    const totalScore = Math.min(100, Math.max(0, rawScore));
    return { totalScore, reasons };
  }

  /**
   * Computes shift compliance (tardiness, early departure, grace period).
   */
  evaluateShiftCompliance(context: ShiftEvaluationContext): { status: string; lateMinutes?: number; earlyMinutes?: number; note?: string } {
    if (!context.shift) {
      return { status: 'present' }; // Open/flexible shift default
    }

    const { startTime, endTime, graceMinutesIn, graceMinutesOut } = context.shift;
    const punchDate = context.punchTime;
    const punchHours = punchDate.getHours();
    const punchMinutes = punchDate.getMinutes();
    const punchTotalMinutes = punchHours * 60 + punchMinutes;

    if (context.isCheckIn) {
      const [startH, startM] = startTime.split(':').map(Number);
      const shiftStartTotalMinutes = startH * 60 + startM;
      const allowedCutoff = shiftStartTotalMinutes + graceMinutesIn;

      if (punchTotalMinutes > allowedCutoff) {
        const lateMinutes = punchTotalMinutes - shiftStartTotalMinutes;
        return {
          status: 'late',
          lateMinutes,
          note: `Late arrival by ${lateMinutes} minutes (Grace: ${graceMinutesIn}m).`,
        };
      }

      return { status: 'present' };
    } else {
      // Check-Out evaluation
      const [endH, endM] = endTime.split(':').map(Number);
      const shiftEndTotalMinutes = endH * 60 + endM;
      const allowedEarlyCutoff = shiftEndTotalMinutes - graceMinutesOut;

      if (punchTotalMinutes < allowedEarlyCutoff) {
        const earlyMinutes = shiftEndTotalMinutes - punchTotalMinutes;
        return {
          status: 'early_departure',
          earlyMinutes,
          note: `Early departure by ${earlyMinutes} minutes.`,
        };
      }

      return { status: 'present' };
    }
  }

  /**
   * Master decision combiner.
   */
  evaluate(results: VerificationResult[], shiftContext?: ShiftEvaluationContext): FinalDecision {
    const { totalScore, reasons } = this.evaluateVerification(results);

    let status = 'present';
    let lateMinutes: number | undefined;
    let earlyMinutes: number | undefined;

    if (shiftContext) {
      const shiftResult = this.evaluateShiftCompliance(shiftContext);
      if (shiftResult.status !== 'present') {
        status = shiftResult.status;
        lateMinutes = shiftResult.lateMinutes;
        earlyMinutes = shiftResult.earlyMinutes;
        if (shiftResult.note) reasons.push(shiftResult.note);
      }
    }

    if (totalScore < 65) {
      status = 'pending_review';
      reasons.push(`Low confidence score (${totalScore}%) flagged for HR review.`);
    }

    return {
      totalScore,
      status,
      lateMinutes,
      earlyMinutes,
      reasons,
    };
  }
}
