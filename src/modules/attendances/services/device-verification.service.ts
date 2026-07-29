import { Injectable, Logger } from '@nestjs/common';
import { VerificationResult, LocationData } from './location-verification.service.js';

@Injectable()
export class DeviceVerificationService {
  private readonly logger = new Logger(DeviceVerificationService.name);

  verify(locationData: LocationData): VerificationResult {
    let score = 0;

    // 1. Mock Location Check
    if (locationData.isMockLocation) {
      this.logger.warn('Mock location detected!');
      return { score: 0, isValid: false, message: 'Fake GPS / Mock Location detected.' };
    } else {
      score += 15; // Base points for a legitimate GPS reading
    }

    // Future extension: Play Integrity API / Root detection check could add more points
    score += 5; // Assuming trusted device for now

    return { score, isValid: true };
  }
}
