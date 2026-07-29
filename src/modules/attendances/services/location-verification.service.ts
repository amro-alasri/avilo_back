import { Injectable, Logger } from '@nestjs/common';
import * as geolib from 'geolib';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed?: number;
  heading?: number;
  isMockLocation?: boolean;
}

export interface VerificationResult {
  score: number;
  isValid: boolean;
  message?: string;
}

@Injectable()
export class LocationVerificationService {
  private readonly logger = new Logger(LocationVerificationService.name);

  verify(branch: { latitude: number | null; longitude: number | null; geofenceRadius: number | null }, locationData: LocationData): VerificationResult {
    let score = 0;
    
    // 1. Accuracy Check
    if (locationData.accuracy > 50) {
      return { score: 0, isValid: false, message: 'GPS accuracy is too low (>' + locationData.accuracy + 'm).' };
    }
    
    if (locationData.accuracy <= 10) {
      score += 15;
    } else if (locationData.accuracy <= 20) {
      score += 10;
    } else {
      score += 5;
    }

    // 2. Speed Check
    // Typical walking speed is ~1.4 m/s (5 km/h). If speed is > 5 m/s (~18 km/h), they are likely in a vehicle.
    if (locationData.speed !== undefined && locationData.speed > 5) {
       // Severe penalty for moving fast
       return { score: 0, isValid: false, message: 'Unreasonable speed detected.' };
    } else {
      score += 5;
    }

    // 3. Geofence Check
    if (!branch.latitude || !branch.longitude) {
      // If branch doesn't have a location set, we can't verify geofence. Give partial score or skip.
      this.logger.warn('Branch location not configured for geofence check.');
      return { score, isValid: true, message: 'Branch location not configured.' };
    }

    const distance = geolib.getDistance(
      { latitude: locationData.latitude, longitude: locationData.longitude },
      { latitude: branch.latitude, longitude: branch.longitude }
    );

    const radius = branch.geofenceRadius || 100; // Default 100 meters

    if (distance <= radius) {
      score += 30; // Max points for being in Geofence
    } else if (distance <= radius + 50) {
      score += 10; // Partial points for being near (grace area)
    } else {
      return { score: 0, isValid: false, message: `Out of geofence zone. Distance: ${distance}m, Allowed: ${radius}m.` };
    }

    return { score, isValid: true };
  }
}
