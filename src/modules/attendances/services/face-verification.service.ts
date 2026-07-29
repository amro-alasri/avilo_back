import { Injectable, Logger } from '@nestjs/common';
import { VerificationResult } from './location-verification.service.js';

@Injectable()
export class FaceVerificationService {
  private readonly logger = new Logger(FaceVerificationService.name);

  verify(hasFaceMatched: boolean | undefined): VerificationResult {
    let score = 0;

    // Face Recognition Check (Stubbed for now, assuming valid if not explicitly failed)
    if (hasFaceMatched === false) {
      this.logger.warn('Face verification failed.');
      return { score: 0, isValid: false, message: 'Face mismatch.' };
    } else if (hasFaceMatched === true) {
      score += 25; // High confidence points for face match
    } else {
      score += 0; // If feature is not used, don't penalize, but don't add points. 
      // In a real system, we might require this, but for now we'll just not add the 25 points.
      // We will adjust the total possible score later or just accept 0 for now.
    }

    return { score, isValid: true };
  }
}
