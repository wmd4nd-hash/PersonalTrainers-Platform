-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'NON_BINARY', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "SessionFormat" AS ENUM ('IN_PERSON', 'ONLINE');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'EXHAUSTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('CERTIFICATION', 'INSURANCE', 'IDENTITY', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ADMIN';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarFileId" TEXT,
ADD COLUMN     "calendarToken" TEXT,
ADD COLUMN     "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "gender" "Gender" NOT NULL DEFAULT 'UNSPECIFIED',
ADD COLUMN     "suspendedAt" TIMESTAMP(3);

-- Give existing users a calendar token before making it required.
UPDATE "User" SET "calendarToken" = md5(random()::text || "id") WHERE "calendarToken" IS NULL;
ALTER TABLE "User" ALTER COLUMN "calendarToken" SET NOT NULL;

-- AlterTable
ALTER TABLE "TrainerProfile" ADD COLUMN     "cancellationWindowHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "defaultLocation" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY['english']::TEXT[],
ADD COLUMN     "lateCancelFeePercent" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "meetingUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "minNoticeHours" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "offersInPerson" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "offersOnline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ratingAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stripeAccountId" TEXT,
ADD COLUMN     "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancellationReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "format" "SessionFormat" NOT NULL DEFAULT 'IN_PERSON',
ADD COLUMN     "location" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "meetingUrl" TEXT,
ADD COLUMN     "packagePurchaseId" TEXT,
ADD COLUMN     "platformFeeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refundedCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reminderSentAt" TIMESTAMP(3),
ADD COLUMN     "stripePaymentIntentId" TEXT;

-- AlterTable
ALTER TABLE "ProgramAssignment" ADD COLUMN     "startsOn" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TimeOff" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sessionCount" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "validDays" INTEGER NOT NULL DEFAULT 90,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagePurchase" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sessionsTotal" INTEGER NOT NULL,
    "sessionsUsed" INTEGER NOT NULL DEFAULT 0,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "platformFeeCents" INTEGER NOT NULL DEFAULT 0,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackagePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "trainerReply" TEXT NOT NULL DEFAULT '',
    "repliedAt" TIMESTAMP(3),
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "link" TEXT NOT NULL DEFAULT '',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "html" TEXT NOT NULL DEFAULT '',
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT NOT NULL DEFAULT '',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationDocument" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "fileId" TEXT NOT NULL,
    "expiresOn" TIMESTAMP(3),
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerNote" TEXT NOT NULL DEFAULT '',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientNote" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutLog" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effort" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "WorkoutLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseLog" (
    "id" TEXT NOT NULL,
    "workoutLogId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "setsDone" INTEGER NOT NULL,
    "reps" TEXT NOT NULL DEFAULT '',
    "weightKg" DOUBLE PRECISION,

    CONSTRAINT "ExerciseLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeOff_trainerId_startsAt_idx" ON "TimeOff"("trainerId", "startsAt");

-- CreateIndex
CREATE INDEX "Package_trainerId_idx" ON "Package"("trainerId");

-- CreateIndex
CREATE UNIQUE INDEX "PackagePurchase_stripeCheckoutSessionId_key" ON "PackagePurchase"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "PackagePurchase_clientId_trainerId_idx" ON "PackagePurchase"("clientId", "trainerId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_bookingId_key" ON "Review"("bookingId");

-- CreateIndex
CREATE INDEX "Review_trainerId_createdAt_idx" ON "Review"("trainerId", "createdAt");

-- CreateIndex
CREATE INDEX "Conversation_clientId_lastMessageAt_idx" ON "Conversation"("clientId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_trainerId_clientId_key" ON "Conversation"("trainerId", "clientId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailOutbox_status_createdAt_idx" ON "EmailOutbox"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationDocument_fileId_key" ON "VerificationDocument"("fileId");

-- CreateIndex
CREATE INDEX "VerificationDocument_status_createdAt_idx" ON "VerificationDocument"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_clientId_trainerId_key" ON "Favorite"("clientId", "trainerId");

-- CreateIndex
CREATE INDEX "ClientNote_trainerId_clientId_idx" ON "ClientNote"("trainerId", "clientId");

-- CreateIndex
CREATE INDEX "WorkoutLog_clientId_completedAt_idx" ON "WorkoutLog"("clientId", "completedAt");

-- CreateIndex
CREATE INDEX "ExerciseLog_exerciseId_idx" ON "ExerciseLog"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "User_avatarFileId_key" ON "User"("avatarFileId");

-- CreateIndex
CREATE UNIQUE INDEX "User_calendarToken_key" ON "User"("calendarToken");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerProfile_stripeAccountId_key" ON "TrainerProfile"("stripeAccountId");

-- CreateIndex
CREATE INDEX "Booking_status_startsAt_idx" ON "Booking"("status", "startsAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_avatarFileId_fkey" FOREIGN KEY ("avatarFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeOff" ADD CONSTRAINT "TimeOff_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_packagePurchaseId_fkey" FOREIGN KEY ("packagePurchaseId") REFERENCES "PackagePurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePurchase" ADD CONSTRAINT "PackagePurchase_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePurchase" ADD CONSTRAINT "PackagePurchase_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePurchase" ADD CONSTRAINT "PackagePurchase_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationDocument" ADD CONSTRAINT "VerificationDocument_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationDocument" ADD CONSTRAINT "VerificationDocument_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationDocument" ADD CONSTRAINT "VerificationDocument_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseLog" ADD CONSTRAINT "ExerciseLog_workoutLogId_fkey" FOREIGN KEY ("workoutLogId") REFERENCES "WorkoutLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseLog" ADD CONSTRAINT "ExerciseLog_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

