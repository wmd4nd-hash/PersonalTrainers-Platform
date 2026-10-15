import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/ui";
import { requireTrainerProfileId } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Your profile" };

export default function ProfilePage() {
  return (
    <>
      <PageHeader
        title="Your trainer profile"
        description="This is what clients see when they find you."
      />
      <Suspense fallback={<Skeleton className="h-[32rem]" />}>
        <Profile />
      </Suspense>
    </>
  );
}

async function Profile() {
  const trainerId = await requireTrainerProfileId();
  const profile = await db.trainerProfile.findUniqueOrThrow({ where: { id: trainerId } });

  return (
    <>
      {profile.published && (
        <p className="mb-4 text-sm">
          Your profile is live at{" "}
          <Link href={`/trainers/${profile.id}`} className="font-medium text-brand">
            /trainers/{profile.id}
          </Link>
        </p>
      )}
      <ProfileForm
        profile={{
          headline: profile.headline,
          bio: profile.bio,
          specialties: profile.specialties.join(", "),
          city: profile.city,
          timezone: profile.timezone,
          yearsExperience: profile.yearsExperience,
          sessionRate: (profile.sessionRateCents / 100).toFixed(2),
          sessionMinutes: profile.sessionMinutes,
          currency: profile.currency.toUpperCase(),
          published: profile.published,
        }}
      />
    </>
  );
}
