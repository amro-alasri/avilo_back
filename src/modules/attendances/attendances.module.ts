import { Module } from '@nestjs/common';
import { AttendancesService } from './attendances.service.js';
import { AttendancesController } from './attendances.controller.js';
import { LocationVerificationService } from './services/location-verification.service.js';
import { DeviceVerificationService } from './services/device-verification.service.js';
import { FaceVerificationService } from './services/face-verification.service.js';
import { AttendancePolicyService } from './services/attendance-policy.service.js';
import { BiometricCryptoService } from './services/biometric-crypto.service.js';

@Module({
  controllers: [AttendancesController],
  providers: [
    AttendancesService,
    LocationVerificationService,
    DeviceVerificationService,
    FaceVerificationService,
    AttendancePolicyService,
    BiometricCryptoService,
  ],
  exports: [AttendancesService],
})
export class AttendancesModule {}
