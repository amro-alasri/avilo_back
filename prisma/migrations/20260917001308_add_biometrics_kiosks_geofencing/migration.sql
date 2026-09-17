-- CreateEnum
CREATE TYPE "BiometricType" AS ENUM ('face_arcface_512', 'voice_ecapa_192');

-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "biometric_score" DOUBLE PRECISION,
ADD COLUMN     "challenge_id" TEXT,
ADD COLUMN     "device_id" TEXT,
ADD COLUMN     "kiosk_device_id" TEXT,
ADD COLUMN     "liveness_score" DOUBLE PRECISION,
ADD COLUMN     "verification_flags" JSONB;

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "break_minutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "grace_minutes_in" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "grace_minutes_out" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "is_night_shift" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "biometric_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "type" "BiometricType" NOT NULL DEFAULT 'face_arcface_512',
    "vector_data" JSONB NOT NULL,
    "algorithm_version" TEXT NOT NULL DEFAULT 'arcface_v1',
    "quality_score" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "biometric_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "device_uuid" TEXT NOT NULL,
    "device_model" TEXT,
    "platform" TEXT NOT NULL,
    "os_version" TEXT,
    "app_version" TEXT,
    "public_key" TEXT,
    "is_trusted" BOOLEAN NOT NULL DEFAULT true,
    "is_jailbroken" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kiosk_devices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "device_uuid" TEXT NOT NULL,
    "public_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_heartbeat_at" TIMESTAMP(3),
    "battery_level" INTEGER,
    "app_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kiosk_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geofence_zones" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zone_type" TEXT NOT NULL DEFAULT 'circle',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "radius_meters" INTEGER,
    "polygon_coords" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geofence_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beacons" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "major" INTEGER NOT NULL,
    "minor" INTEGER NOT NULL,
    "rssi_threshold" INTEGER NOT NULL DEFAULT -85,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beacons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_rosters_daily" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "is_off_day" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_rosters_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "biometric_templates_tenant_id_idx" ON "biometric_templates"("tenant_id");

-- CreateIndex
CREATE INDEX "biometric_templates_employee_id_type_idx" ON "biometric_templates"("employee_id", "type");

-- CreateIndex
CREATE INDEX "devices_employee_id_idx" ON "devices"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_tenant_id_device_uuid_key" ON "devices"("tenant_id", "device_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_devices_device_uuid_key" ON "kiosk_devices"("device_uuid");

-- CreateIndex
CREATE INDEX "kiosk_devices_tenant_id_idx" ON "kiosk_devices"("tenant_id");

-- CreateIndex
CREATE INDEX "kiosk_devices_branch_id_idx" ON "kiosk_devices"("branch_id");

-- CreateIndex
CREATE INDEX "geofence_zones_tenant_id_idx" ON "geofence_zones"("tenant_id");

-- CreateIndex
CREATE INDEX "geofence_zones_branch_id_idx" ON "geofence_zones"("branch_id");

-- CreateIndex
CREATE INDEX "beacons_tenant_id_idx" ON "beacons"("tenant_id");

-- CreateIndex
CREATE INDEX "beacons_branch_id_idx" ON "beacons"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "beacons_uuid_major_minor_key" ON "beacons"("uuid", "major", "minor");

-- CreateIndex
CREATE INDEX "shift_rosters_daily_employee_id_idx" ON "shift_rosters_daily"("employee_id");

-- CreateIndex
CREATE INDEX "shift_rosters_daily_shift_id_idx" ON "shift_rosters_daily"("shift_id");

-- CreateIndex
CREATE INDEX "shift_rosters_daily_date_idx" ON "shift_rosters_daily"("date");

-- CreateIndex
CREATE UNIQUE INDEX "shift_rosters_daily_tenant_id_employee_id_date_key" ON "shift_rosters_daily"("tenant_id", "employee_id", "date");

-- CreateIndex
CREATE INDEX "attendances_kiosk_device_id_idx" ON "attendances"("kiosk_device_id");

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_kiosk_device_id_fkey" FOREIGN KEY ("kiosk_device_id") REFERENCES "kiosk_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_templates" ADD CONSTRAINT "biometric_templates_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiosk_devices" ADD CONSTRAINT "kiosk_devices_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_zones" ADD CONSTRAINT "geofence_zones_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beacons" ADD CONSTRAINT "beacons_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_rosters_daily" ADD CONSTRAINT "shift_rosters_daily_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_rosters_daily" ADD CONSTRAINT "shift_rosters_daily_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
