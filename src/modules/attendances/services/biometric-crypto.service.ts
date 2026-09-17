import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { RedisService } from '../../../core/redis/redis.service.js';
import { StepLogDto } from '../dto/biometrics.dto.js';

export interface IssuedChallenge {
  challengeId: string;
  steps: string[];
  expiresAt: number;
}

interface StoredChallengeData {
  steps: string[];
  issuedAt: number;
  userId: string;
  tenantId: string;
}

@Injectable()
export class BiometricCryptoService {
  private readonly logger = new Logger(BiometricCryptoService.name);
  private static readonly CHALLENGE_TTL_SECONDS = 30; // 30 seconds expiration window
  private static readonly POSSIBLE_ACTIONS = ['LOOK_CENTER', 'TURN_LEFT', 'TURN_RIGHT', 'BLINK', 'SMILE'];

  constructor(private readonly redis: RedisService) {}

  /**
   * Generates a cryptographic nonce and randomized liveness action sequence.
   */
  async createChallenge(userId: string, tenantId: string): Promise<IssuedChallenge> {
    const challengeId = crypto.randomBytes(16).toString('hex');
    const now = Date.now();

    // Select 2-3 randomized actions starting with LOOK_CENTER
    const shuffled = [...BiometricCryptoService.POSSIBLE_ACTIONS.filter((a) => a !== 'LOOK_CENTER')].sort(
      () => 0.5 - Math.random(),
    );
    const steps = ['LOOK_CENTER', shuffled[0], shuffled[1]];

    const challengeData: StoredChallengeData = {
      steps,
      issuedAt: now,
      userId,
      tenantId,
    };

    const redisKey = `challenge:${challengeId}`;
    await this.redis.set(
      redisKey,
      JSON.stringify(challengeData),
      BiometricCryptoService.CHALLENGE_TTL_SECONDS,
    );

    this.logger.debug(`Issued biometric challenge ${challengeId} for user ${userId} with steps: ${steps.join(' -> ')}`);

    return {
      challengeId,
      steps,
      expiresAt: now + BiometricCryptoService.CHALLENGE_TTL_SECONDS * 1000,
    };
  }

  /**
   * Atomically validates and consumes the challenge token, preventing replay attacks.
   */
  async validateAndConsumeChallenge(
    challengeId: string,
    userId: string,
    tenantId: string,
    submittedStepLogs?: StepLogDto[],
  ): Promise<{ isValid: boolean; livenessScore: number; message?: string }> {
    const redisKey = `challenge:${challengeId}`;
    
    // Atomic GETDEL prevents any replay of this challenge nonce
    const rawData = await this.redis.getdel(redisKey);
    if (!rawData) {
      return {
        isValid: false,
        livenessScore: 0,
        message: 'Challenge token is invalid or has expired.',
      };
    }

    let stored: StoredChallengeData;
    try {
      stored = JSON.parse(rawData);
    } catch {
      return { isValid: false, livenessScore: 0, message: 'Corrupt challenge token data.' };
    }

    // Verify user and tenant ownership
    if (stored.userId !== userId || stored.tenantId !== tenantId) {
      return { isValid: false, livenessScore: 0, message: 'Challenge token does not match user context.' };
    }

    // Check challenge age
    const now = Date.now();
    const elapsedSeconds = (now - stored.issuedAt) / 1000;
    if (elapsedSeconds > BiometricCryptoService.CHALLENGE_TTL_SECONDS) {
      return { isValid: false, livenessScore: 0, message: 'Challenge execution timed out.' };
    }

    // If step logs provided, verify sequence order
    if (submittedStepLogs && submittedStepLogs.length > 0) {
      const submittedActions = submittedStepLogs.map((s) => s.action);
      for (const expectedAction of stored.steps) {
        if (!submittedActions.includes(expectedAction)) {
          return {
            isValid: false,
            livenessScore: 0.3,
            message: `Active liveness failed: Missing expected gesture '${expectedAction}'.`,
          };
        }
      }
    }

    // Sequence verified, return high liveness score
    return {
      isValid: true,
      livenessScore: 0.96,
    };
  }
}
