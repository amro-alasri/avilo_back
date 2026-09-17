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

export interface BeaconData {
  uuid: string;
  major: number;
  minor: number;
  rssi: number;
}

export interface GeofenceZoneData {
  zoneType: string; // 'circle' | 'polygon'
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters?: number | null;
  polygonCoords?: [number, number][] | any; // Array of [latitude, longitude]
}

export interface VerificationResult {
  score: number;
  isValid: boolean;
  message?: string;
}

@Injectable()
export class LocationVerificationService {
  private readonly logger = new Logger(LocationVerificationService.name);

  /**
   * Ray-Casting algorithm to test whether a coordinate (lat, lng) is inside an arbitrary polygon.
   */
  public isPointInPolygon(point: { latitude: number; longitude: number }, polygon: { latitude: number; longitude: number }[]): boolean {
    const x = point.longitude;
    const y = point.latitude;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].longitude;
      const yi = polygon[i].latitude;
      const xj = polygon[j].longitude;
      const yj = polygon[j].latitude;

      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }

    return inside;
  }

  /**
   * Verifies Bluetooth Low Energy (BLE) Beacon presence for indoor micro-location.
   */
  public verifyBeacon(
    registeredBeacons: { uuid: string; major: number; minor: number; rssiThreshold: number }[],
    submittedBeacon?: BeaconData,
  ): VerificationResult {
    if (!submittedBeacon) {
      return { score: 0, isValid: true, message: 'No beacon detected' };
    }

    const matched = registeredBeacons.find(
      (b) =>
        b.uuid.toLowerCase() === submittedBeacon.uuid.toLowerCase() &&
        b.major === submittedBeacon.major &&
        b.minor === submittedBeacon.minor,
    );

    if (!matched) {
      this.logger.warn(`Unrecognized beacon submitted: ${submittedBeacon.uuid}:${submittedBeacon.major}:${submittedBeacon.minor}`);
      return { score: 0, isValid: false, message: 'Beacon mismatch: Device is near an unauthorized beacon.' };
    }

    const threshold = matched.rssiThreshold || -85;
    if (submittedBeacon.rssi < threshold) {
      return {
        score: 10,
        isValid: false,
        message: `Beacon signal too weak (${submittedBeacon.rssi} dBm < ${threshold} dBm threshold).`,
      };
    }

    this.logger.log(`Verified valid indoor beacon presence: ${matched.uuid} with RSSI ${submittedBeacon.rssi} dBm`);
    return {
      score: 35, // High confidence for physical beacon proximity
      isValid: true,
      message: 'Verified physical indoor presence via BLE Beacon.',
    };
  }

  /**
   * Main multi-layer location verification engine.
   */
  verify(
    branch: {
      latitude: number | null;
      longitude: number | null;
      geofenceRadius: number | null;
      geofenceZones?: GeofenceZoneData[];
    },
    locationData?: LocationData,
    beaconResult?: VerificationResult,
  ): VerificationResult {
    // If beacon verification passed with high confidence, give instant approval for indoor locations
    if (beaconResult && beaconResult.isValid && beaconResult.score >= 30) {
      return {
        score: 35,
        isValid: true,
        message: 'Location confirmed via physical BLE Beacon.',
      };
    }

    if (!locationData) {
      return { score: 0, isValid: false, message: 'No location data or beacon provided.' };
    }

    // 1. Anti-Mock / Fake GPS Detection
    if (locationData.isMockLocation) {
      this.logger.warn('Mock Location / Fake GPS detected in check-in attempt.');
      return { score: 0, isValid: false, message: 'Fraud Alert: Mock location / fake GPS provider detected.' };
    }

    let score = 0;

    // 2. Accuracy Check
    if (locationData.accuracy > 50) {
      return { score: 0, isValid: false, message: `GPS accuracy is too low (>${locationData.accuracy}m).` };
    }

    if (locationData.accuracy <= 10) {
      score += 15;
    } else if (locationData.accuracy <= 20) {
      score += 10;
    } else {
      score += 5;
    }

    // 3. Speed Check (> 5 m/s or 18 km/h indicates moving vehicle, not stationary pedestrian)
    if (locationData.speed !== undefined && locationData.speed > 5) {
      return { score: 0, isValid: false, message: 'Abnormal speed detected: Check-in while moving is prohibited.' };
    } else {
      score += 5;
    }

    // 4. Polygonal Geofence Check (if configured)
    if (branch.geofenceZones && branch.geofenceZones.length > 0) {
      for (const zone of branch.geofenceZones) {
        if (zone.zoneType === 'polygon' && Array.isArray(zone.polygonCoords) && zone.polygonCoords.length >= 3) {
          const formattedPoly = zone.polygonCoords.map((c: any) => ({
            latitude: Array.isArray(c) ? c[1] : c.latitude,
            longitude: Array.isArray(c) ? c[0] : c.longitude,
          }));

          const isInside = this.isPointInPolygon(
            { latitude: locationData.latitude, longitude: locationData.longitude },
            formattedPoly,
          );

          if (isInside) {
            score += 30;
            return { score, isValid: true, message: 'Inside branch polygon geofence zone.' };
          }
        }
      }
    }

    // 5. Circular Geofence Check (Fallback)
    if (!branch.latitude || !branch.longitude) {
      this.logger.warn('Branch coordinates not configured for circular geofence check.');
      return { score, isValid: true, message: 'Branch location not configured.' };
    }

    const distance = geolib.getDistance(
      { latitude: locationData.latitude, longitude: locationData.longitude },
      { latitude: branch.latitude, longitude: branch.longitude },
    );

    const radius = branch.geofenceRadius || 100;

    if (distance <= radius) {
      score += 30; // Max points for being within Geofence
    } else if (distance <= radius + 50) {
      score += 10; // Grace area near boundary
    } else {
      return {
        score: 0,
        isValid: false,
        message: `Out of geofence zone. Distance: ${distance}m (Allowed: ${radius}m).`,
      };
    }

    return { score, isValid: true };
  }
}
